"""Run an independent research task and archive its submission and run summary."""

from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid

from .artifacts import audit_task_inputs, file_records, seal, sha256_file, write_json

ROOT = Path(__file__).resolve().parents[1]
PINNED_OPENCODE_VERSION = "1.18.17"
ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
TASK_INPUT_FILES = ("task.md", "resource_limits.json")
REQUIRED_SUBMISSION_FILES = (
    "REPORT.md", "DERIVATION.md", "RUN_LOG.md", "REFERENCES.md", "INTEGRITY.md", "ARTIFACTS.json",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def positive(value, name: str) -> int:
    if type(value) is not int or value <= 0:
        raise ValueError(name + " must be a positive integer; zero does not mean unlimited")
    return value


def load_task(case: Path) -> tuple[dict, list[dict]]:
    # Dataset case directories can also contain evaluator materials. Select only
    # the two agent inputs; never stage or recursively copy the whole directory.
    audit_task_inputs(case, TASK_INPUT_FILES)
    problem = case / "task.md"
    if not problem.is_file() or not problem.stat().st_size:
        raise ValueError("task.md is required")
    contract = json.loads((case / "resource_limits.json").read_text(encoding="utf-8"))
    if not isinstance(contract, dict):
        raise ValueError("resource_limits.json must be an object")
    if contract.get("nodes") != 1 or contract.get("network_access") != "disabled":
        raise ValueError("single-node, network-disabled resource limits required")
    for name in ("cpu_cores", "time_limit_minutes", "temporary_storage_gib"):
        positive(contract.get(name), name)
    # Convert dataset units for execution without changing the staged inputs.
    contract["candidate_active_wall_seconds"] = contract["time_limit_minutes"] * 60
    contract["scratch_bytes"] = contract["temporary_storage_gib"] * 2**30
    records = [{"path": name, "bytes": (case / name).stat().st_size,
                "sha256": sha256_file(case / name)} for name in sorted(TASK_INPUT_FILES)]
    return contract, records


def opencode_configuration(config: dict) -> dict:
    """Apply explicitly supplied provider/model options to the permission baseline."""
    effective = json.loads((ROOT / "configs/opencode.json").read_text(encoding="utf-8"))
    providers = config.get("provider_configuration", {})
    if not isinstance(providers, dict):
        raise ValueError("provider_configuration must be a provider object")
    effective["provider"] = copy.deepcopy(providers)
    model_id = config.get("model_id")
    if not isinstance(model_id, str):
        raise ValueError("model_id must be a verified provider/model identifier")
    provider, separator, model = model_id.partition("/")
    if not separator or not provider or not model or "REPLACE" in provider + model:
        raise ValueError("model_id must be a verified provider/model identifier")
    variant = config.get("harness_variant")
    options = config.get("harness_variant_options")
    if not isinstance(variant, str) or not variant or "REPLACE" in variant:
        raise ValueError("set the verified OpenCode CLI variant separately from effort")
    if not isinstance(options, dict) or not options:
        raise ValueError("set explicit provider variant options")
    output_config = options.get("output_config", {})
    if not isinstance(output_config, dict):
        raise ValueError("provider output_config must be an object")
    reported_effort = options.get("reasoningEffort", output_config.get("effort"))
    if reported_effort is not None and reported_effort != config.get("reasoning_effort"):
        raise ValueError("reasoning_effort disagrees with provider variant options")
    try:
        registration = effective["provider"].setdefault(provider, {}).setdefault("models", {}).setdefault(model, {})
        registration.setdefault("variants", {})[variant] = copy.deepcopy(options)
        limit = config.get("model_output_token_limit")
        if limit is not None:
            registration.setdefault("limit", {})["output"] = positive(limit, "model output token limit")
        if registration.get("limit", {}).get("output") is not None:
            positive(registration["limit"]["output"], "model output token limit")
    except (AttributeError, TypeError) as exc:
        raise ValueError("provider/model registration must use object fields") from exc
    # These copied configs must contain credential references rather than values.
    def check_credentials(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key.lower() in ("apikey", "api_key", "authorization", "token"):
                    if not isinstance(item, str) or not re.fullmatch(r"\{env:[A-Z][A-Z0-9_]*\}", item):
                        raise ValueError("provider credentials must use environment references")
                check_credentials(item)
        elif isinstance(value, list):
            for item in value:
                check_credentials(item)
    check_credentials(effective["provider"])
    return effective


def cleanup_containers(env: dict) -> bool:
    """Remove only containers named by this attempt, including daemon survivors."""
    directory = Path(env["RESEARCH_EXAM_CONTAINER_RECORDS"])
    prefix = env["RESEARCH_EXAM_CONTAINER_NAME_PREFIX"]
    for record in directory.glob("*/container.name"):
        try:
            if record.is_symlink():
                return False
            name = record.read_text(encoding="utf-8").strip()
            if not name.startswith(prefix) or not re.fullmatch(r"[A-Za-z0-9._-]+", name):
                return False
            result = subprocess.run(
                [env["RESEARCH_EXAM_PODMAN_WRAPPER"], "rm", "--force", "--ignore", name],
                env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        except (OSError, subprocess.SubprocessError):
            return False
        if result.returncode != 0:
            return False
    return True


def opencode_command(config: dict, prompt: str) -> list[str]:
    return [config.get("harness_executable", "opencode"), "run", "--model",
            config["model_id"], "--variant", config["harness_variant"], prompt]


def candidate_instructions(command_timeout_max_seconds: int, host_workspace: Path) -> str:
    return (
        "\n\nWorkspace and tool instructions:\n"
        f"The absolute host examination workspace is {host_workspace}. "
        "Native read/edit/write/glob/grep tools use host workspace paths. "
        "When a native tool requires an absolute file path, use this host workspace path "
        "followed by the file location, for example "
        f"{host_workspace / 'submission' / 'code.py'}.\n"
        "The custom bash tool runs in the network-disabled container at /workspace. "
        "The same files are mounted there: submission/code.py is /workspace/submission/code.py. "
        "Do not use the container's /workspace absolute path with host file tools.\n"
        "You can write all scientific report and calculation artifacts through bash "
        "under /workspace/submission/. Only the corresponding host submission directory is sealed.\n"
        "Use native read with the absolute host workspace path to read a generated PNG/JPEG image "
        "when the configured model endpoint supports image input. Bash text output is not an image attachment. "
        "Native write/edit (or apply_patch when provided) can create submission files; "
        "Bash can write the same files.\n"
        "bash.timeout is in milliseconds. If omitted, a call requests 120000 ms (120 seconds). "
        f"The configured project cap is {command_timeout_max_seconds} seconds per call; "
        "both the request and the default are capped by that limit and the remaining examination time. "
        "For a longer computation, explicitly request a longer timeout within those limits. "
        "Changing a command timeout does not extend the total examination deadline.\n"
    )


def stage_protocol(workspace: Path, case_id: str, run_id: str, wall: int,
                   timeout_cap: int) -> str:
    """Retain candidate-visible instructions and return the same text for the prompt."""
    initial = (ROOT / "protocol/CANDIDATE_PROMPT.txt").read_text(encoding="utf-8").format(
        case_id=case_id, attempt=run_id)
    common = (f"Case: {case_id}\nAttempt: {run_id}\nActive wall time: {wall} seconds\n\n"
              + (ROOT / "protocol/EXAM_INSTRUCTIONS.md").read_text(encoding="utf-8"))
    environment = "# Candidate computation environment\n" + candidate_instructions(timeout_cap, workspace)
    requirements = (ROOT / "submission_requirements.md").read_text(encoding="utf-8")
    for filename, text in (("CANDIDATE_PROMPT.txt", initial), ("EXAM_INSTRUCTIONS.md", common),
                           ("CANDIDATE_ENVIRONMENT.md", environment)):
        (workspace / filename).write_text(text, encoding="utf-8")
    shutil.copy2(ROOT / "protocol/exam_status.py", workspace / "exam-status")
    (workspace / "exam-status").chmod(0o755)
    (workspace / "scratch").mkdir()
    return "\n\n".join((initial, common, environment, requirements))


def submission_requirements(records: list[dict], sealed: bool) -> dict:
    """Report entry-point presence in the sealed inventory, never a scientific grade."""
    paths = {row["path"] for row in records}
    missing = [name for name in REQUIRED_SUBMISSION_FILES if name not in paths] if sealed else None
    return {
        "required_files": list(REQUIRED_SUBMISSION_FILES),
        "missing_files": missing,
        "status": "not_checked" if missing is None else "files_missing" if missing else "files_present",
    }


def clean_environment(workspace: Path, contract: dict, config: dict) -> tuple[dict, list[str]]:
    # Credentials are forwarded only to the model harness, never the shell container.
    env = {key: os.environ[key] for key in (
        "PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL",
        "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE",
    ) if key in os.environ}
    for name in config.get("credential_env", []):
        if not isinstance(name, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
            raise ValueError("invalid credential environment variable name")
        if name in os.environ:
            env[name] = os.environ[name]
    home = workspace.parent / "harness-home"
    home.mkdir()
    for key in ("HOME", "USERPROFILE", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME"):
        env[key] = str(home)
    env.update({"TMPDIR": str(home), "TEMP": str(home), "TMP": str(home),
                "PYTHONNOUSERSITE": "1", "MPLBACKEND": "Agg",
                "PHYSICSBENCH_WORKSPACE": str(workspace),
                "PHYSICSBENCH_TASK": str(workspace / "task"),
                "PHYSICSBENCH_SUBMISSION": str(workspace / "submission")})
    for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        env[name] = str(contract["cpu_cores"])
    cap = config.get("harness_output_token_cap")
    if cap is not None:
        env["OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"] = str(positive(cap, "harness output token cap"))
    secrets = [env[name] for name in config.get("credential_env", [])
               if env.get(name)]
    return env, secrets


def terminate(proc: subprocess.Popen) -> None:
    if os.name == "posix":
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    else:
        # Kill the whole Windows process tree, including computational children.
        if proc.poll() is None:
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            if proc.poll() is None:
                proc.kill()
    proc.wait(timeout=10)


def run(args) -> dict:
    case = args.case.resolve()
    contract, selected = load_task(case)
    config = json.loads(args.config.read_text(encoding="utf-8"))
    configuration_digest = sha256_file(args.config)
    if not isinstance(config, dict) or config.get("schema") != "physicsbench-run/v1":
        raise ValueError("unsupported runner configuration")
    backend = config.get("backend")
    if backend not in ("local-smoke", "opencode"):
        raise ValueError("backend must be local-smoke or opencode")
    harness_version, harness_digest = None, None
    timeout_cap = positive(config.get("command_timeout_max_seconds"), "command timeout")
    round_number = positive(config.get("round"), "round")
    max_files = positive(config.get("submission_max_files"), "submission file count")
    max_bytes = positive(config.get("submission_max_bytes"), "submission bytes")
    overflow_policy = config.get("submission_overflow_policy", "warn_and_seal")
    if overflow_policy not in ("warn_and_seal", "reject"):
        raise ValueError("unsupported submission overflow policy")
    credential_names = config.get("credential_env", [])
    if not isinstance(credential_names, list) or not all(
            isinstance(name, str) and re.fullmatch(r"[A-Z][A-Z0-9_]*", name)
            for name in credential_names):
        raise ValueError("credential_env must be an array of variable names")
    for field in ("harness_output_token_cap", "model_output_token_limit"):
        if config.get(field) is not None:
            positive(config[field], field)
    effective_opencode = None
    effective_model_limit = None
    if backend == "local-smoke":
        command = config.get("candidate_command")
        if not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
            raise ValueError("candidate_command must be a nonempty argument array")
    if not ID.fullmatch(args.case_id):
        raise ValueError("invalid case identifier")
    # Smoke can use a short deadline; scientific attempts cannot override task limits.
    wall = contract["candidate_active_wall_seconds"]
    if args.smoke_wall_seconds is not None:
        if backend != "local-smoke":
            raise ValueError("smoke wall override is unavailable for scientific attempts")
        wall = positive(args.smoke_wall_seconds, "smoke wall seconds")
    if backend == "opencode":
        if os.name != "posix":
            raise ValueError("OpenCode/container mode requires Linux")
        if config.get("task_only_deployment_confirmed") is not True:
            raise ValueError("OpenCode mode requires a task-only deployment confirmation")
        if config.get("resource_limits_enforced_externally") is not True:
            raise ValueError("CPU and scratch limits must be enforced by the operator's cgroups/quota")
        image = config.get("container_image", "")
        if not isinstance(image, str) or not re.search(r"@sha256:[a-f0-9]{64}$", image):
            raise ValueError("container image must be pinned by digest")
        effective_opencode = opencode_configuration(config)
        provider, _, model = config["model_id"].partition("/")
        effective_model_limit = effective_opencode["provider"][provider]["models"][model].get("limit", {}).get("output")
        executable = config.get("harness_executable", "opencode")
        version = subprocess.run([executable, "--version"], capture_output=True, text=True,
                                 timeout=15, check=True).stdout.strip()
        if version != PINNED_OPENCODE_VERSION:
            raise ValueError("OpenCode version differs from the supported adapter version")
        harness_version = version
        executable_path = shutil.which(executable)
        if executable_path:
            harness_digest = sha256_file(Path(executable_path))
        if not config.get("model_id") or not config.get("reasoning_effort"):
            raise ValueError("set a verified provider model identifier and reasoning variant")
    destination = args.output.resolve()
    if destination == case or destination.is_relative_to(case) or case.is_relative_to(destination):
        raise ValueError("output and source case directories must not overlap")
    destination.mkdir(parents=True, exist_ok=False)
    run_id = str(uuid.uuid4())
    workspace = destination / "workspace"
    workspace.mkdir()
    # Preserve dataset-relative links to ../../submission_requirements.md.
    task_root = workspace / "task"
    staged_case = task_root / "cases" / args.case_id.lower()
    staged_case.mkdir(parents=True)
    for name in TASK_INPUT_FILES:
        shutil.copy2(case / name, staged_case / name)
    if file_records(staged_case) != selected:
        raise ValueError("task inputs changed during staging")
    shutil.copy2(ROOT / "submission_requirements.md", task_root / "submission_requirements.md")
    audit_task_inputs(task_root)
    frozen = file_records(task_root)
    submission = workspace / "submission"
    submission.mkdir()
    prompt = stage_protocol(workspace, args.case_id, run_id, wall, timeout_cap)
    env, secrets = clean_environment(workspace, contract, config)
    env["RESEARCH_EXAM_CLOCK_FILE"] = str(destination / "exam_clock.json")
    if backend == "local-smoke":
        command = [sys.executable if x == "{python}" else
                   str(ROOT / "examples/mock_candidate.py") if x == "{mock_candidate}" else x
                   for x in command]
    else:
        tools = workspace / ".opencode" / "tools"
        tools.mkdir(parents=True)
        shutil.copy2(ROOT / "adapters/opencode/bash.ts", tools / "bash.ts")
        write_json(destination / "opencode.effective.json", effective_opencode)
        (destination / "containers").mkdir()
        env.update({
            "OPENCODE_CONFIG": str(destination / "opencode.effective.json"),
            "RESEARCH_EXAM_SHELL_RUNNER": str(ROOT / "scripts/run_candidate_command.sh"),
            "RESEARCH_EXAM_PODMAN_WRAPPER": config.get("container_runtime", "podman"),
            "RESEARCH_EXAM_IMAGE": config["container_image"],
            "RESEARCH_EXAM_EXPECTED_WORKSPACE": str(workspace),
            "RESEARCH_EXAM_CLOCK_FILE": str(destination / "exam_clock.json"),
            "RESEARCH_EXAM_COMMAND_TIMEOUT_MAX": str(timeout_cap),
            "RESEARCH_EXAM_CPU_CORES": str(contract["cpu_cores"]),
            "RESEARCH_EXAM_CONTAINER_RECORDS": str(destination / "containers"),
            "RESEARCH_EXAM_CONTAINER_NAME_PREFIX": "physicsbench-" + run_id + "-",
        })
        prompt += "\n\nTask specification:\n" + (staged_case / "task.md").read_text(encoding="utf-8")
        prompt += "\n\nResource limits:\n" + (staged_case / "resource_limits.json").read_text(encoding="utf-8")
        command = opencode_command(config, prompt)
    started = utc_now()
    started_epoch = time.time()
    clock = {"schema": "physicsbench-clock/v1", "started_epoch_seconds": started_epoch,
             "deadline_epoch_seconds": started_epoch + wall, "wall_seconds": wall}
    write_json(destination / "exam_clock.json", clock)
    monotonic_start = time.monotonic()
    status, exit_code = "infrastructure_failure", None
    findings = []
    warnings = []
    stopped = True
    proc = None
    try:
        with (destination / "harness.stdout.log").open("wb") as stdout, \
             (destination / "harness.stderr.log").open("wb") as stderr:
            proc = subprocess.Popen(command, cwd=workspace, env=env,
                                    stdout=stdout, stderr=stderr,
                                    start_new_session=os.name == "posix")
            try:
                exit_code = proc.wait(timeout=max(0, wall - (time.monotonic() - monotonic_start)))
                status = "completed" if exit_code == 0 else "harness_exit_nonzero"
            except subprocess.TimeoutExpired:
                status = "time_limit"
            finally:
                # Also reap remaining POSIX children after an early harness exit.
                terminate(proc)
                exit_code = proc.returncode
    except (OSError, subprocess.SubprocessError):
        findings.append("harness_start_or_termination_failure")
        status = "infrastructure_failure"
        stopped = proc is None
    if backend == "opencode" and not cleanup_containers(env):
        findings.append("container_cleanup_failure")
        status = "infrastructure_failure"
        stopped = False
    elapsed = round(time.monotonic() - monotonic_start, 3)
    # Redact exact forwarded secret values from logs before making a receipt.
    for name in ("harness.stdout.log", "harness.stderr.log"):
        path = destination / name
        if path.exists():
            content = path.read_bytes()
            for secret in secrets:
                content = content.replace(secret.encode(), b"[REDACTED]")
            path.write_bytes(content)
    try:
        if not stopped:
            raise ValueError("candidate work may still be changing")
        if file_records(task_root) != frozen:
            findings.append("task_inputs_changed")
            status = "infrastructure_failure"
    except (OSError, ValueError):
        findings.append("task_inputs_unsafe")
        status = "infrastructure_failure"
    archive = destination / "submission.tar.gz"
    records = []
    archive_hash = None
    try:
        if not stopped:
            raise ValueError("candidate work may still be changing")
        # Credential bytes in submitted artifacts are rejected, never published.
        for row in file_records(submission) if secrets else []:
            # Scan with overlap so a value split across chunks is still rejected.
            needles = [secret.encode() for secret in secrets]
            overlap = max(len(needle) for needle in needles) - 1
            tail = b""
            with (submission / row["path"]).open("rb") as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                    data = tail + chunk
                    if any(needle in data for needle in needles):
                        raise ValueError("credential leak in submission")
                    tail = data[-overlap:] if overlap else b""
        records, warnings = seal(submission, archive, max_files=max_files, max_bytes=max_bytes,
                                 overflow_policy=overflow_policy)
        archive_hash = sha256_file(archive)
    except (OSError, ValueError):
        findings.append("submission_not_sealed")
        status = "infrastructure_failure"
    result = {
        "schema": "physicsbench-result/v1", "run_id": run_id,
        "case_id": args.case_id, "model_id": config.get("model_id"),
        "reasoning_effort": config.get("reasoning_effort"), "round": round_number,
        "harness_variant": config.get("harness_variant"),
        "harness_output_token_cap": int(env["OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"])
            if "OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX" in env else None,
        "model_output_token_limit": effective_model_limit,
        "effective_opencode_configuration_sha256": sha256_file(destination / "opencode.effective.json")
            if backend == "opencode" else None,
        "submission_overflow_policy": overflow_policy,
        "backend": backend, "started_at": started, "finished_at": utc_now(),
        "elapsed_seconds": elapsed, "wall_seconds": wall,
        "command_timeout_max_seconds": timeout_cap,
        "configuration_sha256": configuration_digest,
        "harness_version": harness_version, "harness_sha256": harness_digest,
        "container_image": config.get("container_image") if backend == "opencode" else None,
        "adapter_sha256": sha256_file(ROOT / "adapters/opencode/bash.ts")
                          if backend == "opencode" else None,
        "status": status, "exit_code": exit_code,
        "isolation": "not_enforced_smoke_only" if backend == "local-smoke"
                     else "task_only_host_and_network_disabled_container",
        "task_files": frozen, "submission_files": records,
        "submission_requirements": submission_requirements(records, archive_hash is not None),
        "archive": "submission.tar.gz" if archive_hash else None,
        "archive_sha256": archive_hash, "findings": findings, "warnings": warnings,
        "grading": None,
    }
    write_json(destination / "result.json", result)
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    verify = commands.add_parser("validate-task")
    verify.add_argument("--case", type=Path, required=True)
    attempt = commands.add_parser("run")
    attempt.add_argument("--case", type=Path, required=True)
    attempt.add_argument("--case-id", required=True)
    attempt.add_argument("--config", type=Path, required=True)
    attempt.add_argument("--output", type=Path, required=True)
    attempt.add_argument("--smoke-wall-seconds", type=int)
    args = parser.parse_args(argv)
    try:
        if args.action == "validate-task":
            _, records = load_task(args.case.resolve())
            print(json.dumps({"valid": True, "task_file_count": len(records)}))
            return 0
        result = run(args)
        print(json.dumps({key: result[key] for key in ("run_id", "status", "archive", "grading")}))
        return 2 if result["status"] == "infrastructure_failure" else 0
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        # Do not print user paths, provider stderr, or credential-bearing arguments.
        print("configuration or preflight rejected: " + type(exc).__name__, file=sys.stderr)
        return 2
