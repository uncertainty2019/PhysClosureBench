from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

from physicsbench.artifacts import audit_task_inputs, file_records, regular_files, seal, sha256_file
from physicsbench.runner import (ROOT, REQUIRED_SUBMISSION_FILES, candidate_instructions,
                                clean_environment, cleanup_containers, load_task,
                                opencode_command, opencode_configuration,
                                positive, run, stage_protocol)


class RunnerSmokeTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.case = self.base / "cases/case30"
        shutil.copytree(ROOT / "cases/case30", self.case)
        self.config = self.base / "run.json"
        self.settings = json.loads((ROOT / "configs/smoke.json").read_text(encoding="utf-8"))

    def attempt(self, *, seconds=5):
        self.config.write_text(json.dumps(self.settings), encoding="utf-8")
        return run(argparse.Namespace(
            case=self.case, case_id="Case30", config=self.config,
            output=self.base / "attempt", smoke_wall_seconds=seconds))

    def test_complete_smoke_seals_real_files(self):
        result = self.attempt()
        self.assertEqual(result["status"], "completed")
        self.assertIsNone(result["grading"])
        self.assertEqual(result["isolation"], "not_enforced_smoke_only")
        archive = self.base / "attempt/submission.tar.gz"
        self.assertEqual(result["archive_sha256"], sha256_file(archive))
        with tarfile.open(archive) as opened:
            member = opened.getmembers()[0]
            self.assertEqual(member.name, "submission/SMOKE.txt")
            self.assertEqual(member.uid, 0)
            self.assertEqual(member.uname, "")
        schema = json.loads((ROOT / "schemas/result.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(set(result), set(schema["required"]))
        try:
            import jsonschema
        except ImportError:
            pass  # The runner and smoke suite have no required Python dependencies.
        else:
            jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker()).validate(result)

    def test_total_timeout_preserves_partial_work(self):
        self.settings["candidate_command"].append("--sleep")
        result = self.attempt(seconds=1)
        self.assertEqual(result["status"], "time_limit")
        self.assertTrue(result["submission_files"])
        self.assertIsNotNone(result["archive_sha256"])
        self.assertIsNone(result["grading"])
        self.assertEqual(result["submission_requirements"]["status"], "files_missing")

    def test_common_protocol_is_staged_and_included_in_the_prompt(self):
        workspace = self.base / "protocol-workspace"
        workspace.mkdir()
        prompt = stage_protocol(workspace, "case30", "synthetic-attempt", 2700, 1200)
        for name in REQUIRED_SUBMISSION_FILES:
            self.assertIn(name, prompt)
        for name in ("CANDIDATE_PROMPT.txt", "EXAM_INSTRUCTIONS.md", "CANDIDATE_ENVIRONMENT.md"):
            self.assertIn((workspace / name).read_text(encoding="utf-8"), prompt)
        self.assertIn("case30", prompt)
        self.assertIn("2700 seconds", prompt)
        self.assertIn("./exam-status", prompt)
        self.assertTrue((workspace / "exam-status").is_file())
        self.assertTrue((workspace / "scratch").is_dir())
        self.assertEqual(list((workspace / "scratch").iterdir()), [])

    def test_missing_entry_points_are_reported_without_blocking_partial_sealing(self):
        self.settings["candidate_command"] = [
            "{python}", "-c",
            "import os,pathlib,sys; pathlib.Path(os.environ['PHYSICSBENCH_SUBMISSION'], "
            "'REPORT.md').write_text('Synthetic partial report, not a scientific answer.'); sys.exit(7)",
        ]
        result = self.attempt()
        self.assertEqual(result["status"], "harness_exit_nonzero")
        self.assertIsNotNone(result["archive_sha256"])
        self.assertIsNone(result["grading"])
        requirements = result["submission_requirements"]
        self.assertEqual(requirements["status"], "files_missing")
        self.assertEqual(requirements["missing_files"], list(REQUIRED_SUBMISSION_FILES[1:]))
        with tarfile.open(self.base / "attempt/submission.tar.gz") as opened:
            self.assertIn("submission/REPORT.md", opened.getnames())

    def test_all_six_entry_points_are_recorded_without_inventing_a_grade(self):
        documents = {name: "Synthetic fixture, no scientific result."
                     for name in REQUIRED_SUBMISSION_FILES}
        documents["ARTIFACTS.json"] = json.dumps({
            "schema": "research-exam-submission/v1", "claims": [], "figures": [],
            "final_run_commands": [],
        })
        self.settings["candidate_command"] = [
            "{python}", "-c", "import os,pathlib; root=pathlib.Path(os.environ['PHYSICSBENCH_SUBMISSION']); "
            + "[(root/name).write_text(text) for name,text in " + repr(documents) + ".items()]",
        ]
        result = self.attempt()
        self.assertEqual(result["submission_requirements"]["status"], "files_present")
        self.assertEqual(result["submission_requirements"]["missing_files"], [])
        self.assertEqual(len(result["submission_files"]), 6)
        self.assertIsNone(result["grading"])

    def test_remaining_time_command_reads_the_controller_clock(self):
        result = self.attempt()
        clock = self.base / "attempt/exam_clock.json"
        before = clock.read_bytes()
        command = self.base / "attempt/workspace/exam-status"
        reply = subprocess.run([os.sys.executable, str(command)], check=True,
                               env=dict(os.environ, RESEARCH_EXAM_CLOCK_FILE=str(clock)),
                               capture_output=True, text=True)
        status = json.loads(reply.stdout)
        self.assertEqual(status["wall_seconds"], result["wall_seconds"])
        self.assertGreaterEqual(status["elapsed_seconds"], 0)
        self.assertGreaterEqual(status["remaining_seconds"], 0)
        self.assertLessEqual(status["remaining_seconds"], result["wall_seconds"])
        self.assertEqual(clock.read_bytes(), before)

    def test_zero_is_not_unlimited(self):
        with self.assertRaises(ValueError):
            positive(0, "timeout")
        self.settings["command_timeout_max_seconds"] = 0
        with self.assertRaises(ValueError):
            self.attempt()
        self.assertFalse((self.base / "attempt").exists())

    def test_reused_directory_is_rejected(self):
        self.attempt()
        with self.assertRaises(FileExistsError):
            self.attempt()

    def test_task_protected_marker_is_rejected(self):
        (self.case / "rubric.txt").write_text("fixture", encoding="utf-8")
        with self.assertRaises(ValueError):
            audit_task_inputs(self.case)

    def test_resource_contract_requires_offline_mode(self):
        contract = self.case / "resource_limits.json"
        value = json.loads(contract.read_text(encoding="utf-8"))
        value["network_access"] = "enabled"
        contract.write_text(json.dumps(value), encoding="utf-8")
        with self.assertRaises(ValueError):
            load_task(self.case)

    def test_evaluator_materials_are_not_staged(self):
        for name in ("grading_rubric.md", "grading_rubric.json", "sources.md"):
            (self.case / name).write_text("Evaluator-only synthetic fixture.", encoding="utf-8")
        result = self.attempt()
        root = self.base / "attempt/workspace/task"
        self.assertEqual({row["path"] for row in file_records(root)}, {
            "cases/case30/task.md", "cases/case30/resource_limits.json", "submission_requirements.md",
        })
        self.assertEqual(result["task_files"], file_records(root))
        self.assertEqual((root / "submission_requirements.md").read_bytes(),
                         (ROOT / "submission_requirements.md").read_bytes())

    def test_dataset_resource_units_are_converted_without_changing_inputs(self):
        path = self.case / "resource_limits.json"
        before = path.read_bytes()
        limits, _ = load_task(self.case)
        self.assertEqual(limits["cpu_cores"], 8)
        self.assertEqual(limits["candidate_active_wall_seconds"], 2700)
        self.assertEqual(limits["scratch_bytes"], 64 * 2**30)
        self.assertEqual(path.read_bytes(), before)

    def test_dataset_resource_limits_require_positive_integers(self):
        path = self.case / "resource_limits.json"
        limits = json.loads(path.read_text(encoding="utf-8"))
        for field in ("cpu_cores", "time_limit_minutes", "temporary_storage_gib"):
            for value in (0, -1, True, 1.5):
                with self.subTest(field=field, value=value):
                    path.write_text(json.dumps(dict(limits, **{field: value})), encoding="utf-8")
                    with self.assertRaises(ValueError):
                        load_task(self.case)

    def test_protected_text_in_selected_task_is_rejected(self):
        (self.case / "task.md").write_text("Hidden rubric: synthetic fixture.", encoding="utf-8")
        with self.assertRaises(ValueError):
            load_task(self.case)

    def test_missing_harness_records_failure_without_a_score(self):
        self.settings["candidate_command"] = ["physicsbench-nonexistent-test-command"]
        result = self.attempt()
        self.assertEqual(result["status"], "infrastructure_failure")
        self.assertIn("harness_start_or_termination_failure", result["findings"])
        self.assertIsNone(result["grading"])

    def test_forwarded_fixture_secret_is_redacted_and_not_sealed(self):
        self.settings["credential_env"] = ["PHYSICSBENCH_TEST_CREDENTIAL"]
        self.settings["candidate_command"] = [
            "{python}", "-c",
            "import os,pathlib; value=os.environ['PHYSICSBENCH_TEST_CREDENTIAL']; "
            "print(value); pathlib.Path(os.environ['PHYSICSBENCH_SUBMISSION'], "
            "'fixture.txt').write_text(value)",
        ]
        with patch.dict(os.environ, {"PHYSICSBENCH_TEST_CREDENTIAL": "synthetic-test-value-123"}):
            result = self.attempt()
        self.assertIsNone(result["archive_sha256"])
        self.assertEqual(result["status"], "infrastructure_failure")
        self.assertIn("submission_not_sealed", result["findings"])
        self.assertEqual(result["submission_requirements"]["status"], "not_checked")
        self.assertIsNone(result["submission_requirements"]["missing_files"])
        self.assertNotIn("synthetic-test-value-123",
                         (self.base / "attempt/harness.stdout.log").read_text())

    def test_symlink_submission_is_rejected(self):
        directory = self.base / "links"
        directory.mkdir()
        target = directory / "target"
        target.write_text("fixture", encoding="utf-8")
        try:
            (directory / "link").symlink_to(target)
        except OSError:
            self.skipTest("symlink creation unavailable on this platform")
        with self.assertRaises(ValueError):
            regular_files(directory)

    def test_overflow_warns_and_keeps_the_submission_by_default(self):
        self.settings["submission_max_bytes"] = 1
        self.settings.pop("submission_overflow_policy", None)
        result = self.attempt()
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["submission_overflow_policy"], "warn_and_seal")
        self.assertIn("submission_export_byte_limit_exceeded", result["warnings"])
        self.assertIsNotNone(result["archive_sha256"])

    def test_explicit_overflow_rejection_does_not_publish_an_archive(self):
        self.settings["submission_max_bytes"] = 1
        self.settings["submission_overflow_policy"] = "reject"
        result = self.attempt()
        self.assertEqual(result["status"], "infrastructure_failure")
        self.assertIsNone(result["archive_sha256"])
        self.assertFalse((self.base / "attempt/submission.tar.gz").exists())

    def test_changed_submission_does_not_leave_a_partial_archive(self):
        submission = self.base / "changing-smoke"
        submission.mkdir()
        artifact = submission / "fixture.txt"
        artifact.write_text("before", encoding="utf-8")
        original_records = file_records(submission)
        artifact.write_text("after!", encoding="utf-8")  # Same length, different bytes.
        archive = self.base / "changing-smoke.tar.gz"
        with patch("physicsbench.artifacts.file_records", return_value=original_records):
            with self.assertRaises(ValueError):
                seal(submission, archive, max_files=10, max_bytes=100)
        self.assertFalse(archive.exists())
        self.assertFalse(archive.with_name(archive.name + ".tmp").exists())

    def test_variant_effort_and_both_caps_reach_the_harness_configuration(self):
        # Synthetic provider registration; no API call or scientific result.
        config = {
            "model_id": "smoke-provider/smoke-model", "reasoning_effort": "xhigh",
            "harness_variant": "adaptive_xhigh",
            "harness_variant_options": {"thinking": {"type": "adaptive"},
                                        "output_config": {"effort": "xhigh"}},
            "harness_output_token_cap": 128000, "model_output_token_limit": 128000,
            "provider_configuration": {}, "credential_env": [],
        }
        effective = opencode_configuration(config)
        model = effective["provider"]["smoke-provider"]["models"]["smoke-model"]
        self.assertEqual(model["limit"]["output"], 128000)
        self.assertEqual(model["variants"]["adaptive_xhigh"]["output_config"]["effort"], "xhigh")
        command = opencode_command(config, "smoke prompt")
        self.assertEqual(command[command.index("--variant") + 1], "adaptive_xhigh")
        workspace = self.base / "parameter-smoke/workspace"
        workspace.mkdir(parents=True)
        env, _ = clean_environment(workspace, {"cpu_cores": 8}, config)
        self.assertEqual(env["OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"], "128000")
        config["reasoning_effort"] = "high"
        with self.assertRaises(ValueError):
            opencode_configuration(config)

    def test_provider_image_metadata_is_preserved_without_forcing_capabilities(self):
        config = json.loads((ROOT / "configs/run.example.json").read_text(encoding="utf-8"))
        config.update(model_id="synthetic/model", model_output_token_limit=65536)
        for modalities in (["text", "image"], ["text"]):
            metadata = {"modalities": {"input": modalities, "output": ["text"]}}
            config["provider_configuration"] = {"synthetic": {"models": {"model": metadata}}}
            model = opencode_configuration(config)["provider"]["synthetic"]["models"]["model"]
            self.assertEqual(model["modalities"]["input"], modalities)
            self.assertEqual(model["modalities"]["output"], ["text"])
        config["provider_configuration"] = {}
        config["model_output_token_limit"] = None
        model = opencode_configuration(config)["provider"]["synthetic"]["models"]["model"]
        self.assertNotIn("modalities", model)
        self.assertIsNone(model.get("limit", {}).get("output"))
        config["provider_configuration"] = {"synthetic": {"models": {"model": {
            "limit": {"output": 65536},
        }}}}
        self.assertEqual(opencode_configuration(config)["provider"]["synthetic"]["models"]["model"]
                         ["limit"]["output"], 65536)

    def test_unset_output_budget_does_not_override_harness_defaults(self):
        config = {"backend": "opencode", "harness_output_token_cap": None}
        workspace = self.base / "budget-workspace"
        workspace.mkdir()
        env, _ = clean_environment(workspace, {"cpu_cores": 8}, config)
        self.assertNotIn("OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX", env)
        self.assertIsNone(config["harness_output_token_cap"])
        baseline = json.loads((ROOT / "configs/opencode.json").read_text(encoding="utf-8"))
        self.assertEqual(baseline["permission"]["read"], "allow")
        # OpenCode's native write and apply_patch tools use the edit permission.
        self.assertEqual(baseline["permission"]["edit"], "allow")
        self.assertEqual(baseline["permission"]["external_directory"], "deny")

    def test_container_cleanup_is_scoped_and_failure_is_reported(self):
        directory = self.base / "container-smoke/shell-fixture"
        directory.mkdir(parents=True)
        name = "physicsbench-smoke-shell-fixture"
        (directory / "container.name").write_text(name, encoding="utf-8")
        env = {"RESEARCH_EXAM_CONTAINER_RECORDS": str(directory.parent),
               "RESEARCH_EXAM_CONTAINER_NAME_PREFIX": "physicsbench-smoke-",
               "RESEARCH_EXAM_PODMAN_WRAPPER": "podman"}
        with patch("physicsbench.runner.subprocess.run", return_value=subprocess.CompletedProcess([], 0)) as mocked:
            self.assertTrue(cleanup_containers(env))
            self.assertEqual(mocked.call_args.args[0], ["podman", "rm", "--force", "--ignore", name])
        with patch("physicsbench.runner.subprocess.run", return_value=subprocess.CompletedProcess([], 1)):
            self.assertFalse(cleanup_containers(env))

    def test_termination_failure_cannot_produce_a_sealed_success(self):
        with patch("physicsbench.runner.terminate", side_effect=OSError("synthetic smoke failure")):
            result = self.attempt()
        self.assertEqual(result["status"], "infrastructure_failure")
        self.assertIsNone(result["archive_sha256"])
        self.assertIn("harness_start_or_termination_failure", result["findings"])

    def test_malformed_parameters_fail_before_creating_an_attempt(self):
        for field, value in (("candidate_command", "not-an-array"),
                             ("credential_env", "NOT_AN_ARRAY"),
                             ("harness_output_token_cap", 0)):
            with self.subTest(field=field):
                original = self.settings.get(field)
                self.settings[field] = value
                with self.assertRaises(ValueError):
                    self.attempt()
                self.assertFalse((self.base / "attempt").exists())
                self.settings[field] = original

    def test_candidate_instructions_explain_both_path_views_and_timeouts(self):
        host_workspace = self.base / "candidate-host-workspace"
        instructions = candidate_instructions(1800, host_workspace)
        self.assertIn("host examination workspace", instructions)
        self.assertIn(str(host_workspace), instructions)
        self.assertIn(str(host_workspace / "submission/code.py"), instructions)
        self.assertIn("requires an absolute file path", instructions)
        self.assertNotIn("Use relative paths", instructions)
        self.assertIn("submission/code.py is /workspace/submission/code.py", instructions)
        self.assertIn("through bash under /workspace/submission/", instructions)
        self.assertIn("host submission directory is sealed", instructions)
        self.assertIn("Do not use the container's /workspace absolute path with host file tools", instructions)
        self.assertNotIn("SAME absolute workspace path", instructions)
        self.assertIn("120000 ms (120 seconds)", instructions)
        self.assertIn("native read", instructions)
        self.assertIn("Native write/edit", instructions)
        self.assertIn("1800 seconds per call", instructions)
        self.assertIn("remaining examination time", instructions)

    @unittest.skipUnless(os.name == "posix" and all(shutil.which(tool) for tool in
                        ("bash", "timeout", "realpath", "mktemp", "python3")),
                        "Linux shell smoke requires POSIX/GNU tools")
    def test_shell_timeout_cleans_container_immediately(self):
        # Synthetic Podman protocol fixture: no image, container, API, or physics.
        workspace = self.base / "shell-smoke-workspace"
        workspace.mkdir()
        records = self.base / "shell-smoke-records"
        records.mkdir()
        clock = self.base / "shell-smoke-clock.json"
        clock.write_text(json.dumps({"deadline_epoch_seconds": time.time() + 60}))
        state = self.base / "shell-smoke-state.txt"
        runtime = self.base / "fake-podman"
        runtime.write_text(
            "#!/usr/bin/env python3\n"
            "import os,pathlib,sys,time\n"
            "state=pathlib.Path(os.environ['FAKE_PODMAN_STATE'])\n"
            "if sys.argv[1]=='run':\n"
            " args=sys.argv[2:]; work=args[args.index('--workdir')+1]\n"
            " volumes=[args[i+1] for i,a in enumerate(args) if a=='--volume']\n"
            " assert work=='/workspace'\n"
            " assert any(v.endswith(':/workspace:rw') for v in volumes)\n"
            " assert any(v.endswith(':/workspace/task:ro') for v in volumes)\n"
            " assert len(volumes)==3\n"
            " state.write_text('running')\n"
            " pathlib.Path(sys.argv[sys.argv.index('--cidfile')+1]).write_text('f'*64)\n"
            " time.sleep(30)\n"
            "elif sys.argv[1]=='rm':\n"
            " state.write_text('removed')\n", encoding="utf-8")
        runtime.chmod(0o755)
        env = dict(os.environ, RESEARCH_EXAM_PODMAN_WRAPPER=str(runtime),
                   RESEARCH_EXAM_IMAGE="synthetic-smoke-image",
                   RESEARCH_EXAM_EXPECTED_WORKSPACE=str(workspace),
                   RESEARCH_EXAM_CLOCK_FILE=str(clock),
                   RESEARCH_EXAM_CONTAINER_RECORDS=str(records),
                   RESEARCH_EXAM_CONTAINER_NAME_PREFIX="physicsbench-smoke-",
                   RESEARCH_EXAM_CPU_CORES="1", FAKE_PODMAN_STATE=str(state))
        result = subprocess.run(
            ["bash", str(ROOT / "scripts/run_candidate_command.sh"), str(workspace), "1", "fixture"],
            env=env, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 124)
        self.assertEqual(state.read_text(), "removed")


if __name__ == "__main__":
    unittest.main()
