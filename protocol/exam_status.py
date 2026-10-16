#!/usr/bin/env python3
"""Read the controller clock without changing the examination deadline."""

import json
import os
from pathlib import Path
import time


def main():
    path = Path(os.environ.get("RESEARCH_EXAM_CLOCK_FILE", "/exam_runtime/exam_clock.json"))
    clock = json.loads(path.read_text(encoding="utf-8"))
    now = time.time()
    print(json.dumps({
        "elapsed_seconds": round(max(0, now - clock["started_epoch_seconds"]), 3),
        "remaining_seconds": round(max(0, clock["deadline_epoch_seconds"] - now), 3),
        "wall_seconds": clock["wall_seconds"],
    }))


if __name__ == "__main__":
    main()
