"""Check the computation bridge without model access or scientific scoring."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import uuid


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", required=True, help="Podman or the deployment's runtime wrapper")
    parser.add_argument("--image", required=True, help="An existing local image; no pull is performed")
    parser.add_argument("--image-timeout", type=int, default=600,
                        help="Image initialization/inspection timeout in seconds (default: 600)")
    args = parser.parse_args()
    if args.image_timeout <= 0:
        parser.error("--image-timeout must be positive")
    bridge = Path(__file__).resolve().with_name("run_candidate_command.sh")
    # Inspect through the same runtime/storage that will execute the command.
    inspected = subprocess.run(
        [args.runtime, "image", "inspect", args.image, "--format", "{{.Id}}"],
        check=True, capture_output=True, text=True, timeout=args.image_timeout)
    image_id = inspected.stdout.strip().splitlines()[-1]
    if re.fullmatch(r"[a-f0-9]{64}", image_id):
        image_id = "sha256:" + image_id
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", image_id):
        raise ValueError("runtime did not return a valid image ID")
    with tempfile.TemporaryDirectory(prefix="physicsbench-container-check-") as temporary:
        root = Path(temporary)
        workspace = root / "workspace"
        task = workspace / "task"
        task.mkdir(parents=True)
        (workspace / "submission").mkdir()
        (workspace / "submission/host-write.txt").write_text("host-ok", encoding="utf-8")
        (task / "sentinel.txt").write_text("task fixture\n", encoding="utf-8")
        records = root / "containers"
        records.mkdir()
        clock = root / "clock.json"
        clock.write_text(json.dumps({"deadline_epoch_seconds": time.time() + 90}), encoding="utf-8")
        env = {key: value for key, value in os.environ.items()
               if key in {"PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "XDG_RUNTIME_DIR"}
               or key.startswith("SLURM_")}
        env.update({
            "RESEARCH_EXAM_PODMAN_WRAPPER": args.runtime,
            "RESEARCH_EXAM_IMAGE": image_id,
            "RESEARCH_EXAM_EXPECTED_WORKSPACE": str(workspace),
            "RESEARCH_EXAM_CLOCK_FILE": str(clock),
            "RESEARCH_EXAM_CONTAINER_RECORDS": str(records),
            "RESEARCH_EXAM_CONTAINER_NAME_PREFIX": "physicsbench-check-" + uuid.uuid4().hex + "-",
            "RESEARCH_EXAM_CPU_CORES": "1",
        })
        command = (
            "set -eu; test \"$(pwd)\" = /workspace; "
            "test \"$(ls /sys/class/net)\" = lo; "
            "test \"$(cat submission/host-write.txt)\" = host-ok; "
            "if printf forbidden >> task/sentinel.txt 2>/dev/null; then exit 1; fi; "
            "if printf forbidden >> /workspace/task/sentinel.txt 2>/dev/null; then exit 1; fi; "
            "printf container-ok > submission/check.txt; "
            "test \"$(cat /workspace/submission/check.txt)\" = container-ok"
        )
        subprocess.run(["bash", str(bridge), str(workspace), "30", command],
                       env=env, check=True, timeout=55)
        if (workspace / "submission/check.txt").read_text() != "container-ok":
            raise ValueError("container submission mount failed")
        if (task / "sentinel.txt").read_text() != "task fixture\n":
            raise ValueError("task mount was modified")
        timed = subprocess.run(["bash", str(bridge), str(workspace), "1", "sleep 10"],
                               env=env, check=False, timeout=25)
        if timed.returncode != 124:
            raise ValueError("shell timeout did not return 124")
        for record in records.glob("*/container.name"):
            name = record.read_text().strip()
            exists = subprocess.run([args.runtime, "container", "exists", name],
                                    capture_output=True, check=False, timeout=15)
            if exists.returncode != 1:
                raise ValueError("a command container remains or cleanup cannot be verified")
    print(json.dumps({"container_checks": "passed", "image_id": image_id,
                      "model_requests": 0, "scientific_score": None}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
