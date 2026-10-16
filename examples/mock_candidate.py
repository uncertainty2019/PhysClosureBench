"""Transport smoke fixture, not an answer or a scientific baseline."""
from pathlib import Path
import os
import sys
import time

submission = Path(os.environ["PHYSICSBENCH_SUBMISSION"])
(submission / "SMOKE.txt").write_text(
    "Synthetic transport smoke artifact. No scientific claim or score.\n", encoding="utf-8")
if "--sleep" in sys.argv:
    time.sleep(30)
