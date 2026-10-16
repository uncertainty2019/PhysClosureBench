"""File inventory and submission sealing for independent evaluation attempts.

See LICENSE and THIRD_PARTY_NOTICES.md for licensing and provenance.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import tarfile

FORBIDDEN_PATH_TOKENS = (
    "private", "rubric", "grading_manual", "answer_key", "solution_key",
    "source_mapping", "examiner",
)
FORBIDDEN_TEXT_MARKERS = (
    "private / examiner", "private/examiner", "examiner only",
    "grading manual", "answer key", "hidden rubric",
)
TEXT_EXTENSIONS = {
    ".md", ".txt", ".json", ".jsonl", ".yaml", ".yml", ".toml", ".csv",
    ".tsv", ".py", ".m", ".jl", ".c", ".cc", ".cpp", ".h", ".hpp",
    ".f", ".f90", ".sh", ".tex",
}


def regular_files(root: Path) -> list[Path]:
    if root.is_symlink() or not root.is_dir():
        raise ValueError("artifact directory not found")
    result = []
    for path in sorted(root.rglob("*"), key=lambda item: item.as_posix()):
        if path.is_symlink():
            raise ValueError("symbolic links are not permitted")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError("special files are not permitted")
        result.append(path)
    return result


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_records(root: Path) -> list[dict]:
    return [{"path": path.relative_to(root).as_posix(),
             "bytes": path.stat().st_size, "sha256": sha256_file(path)}
            for path in regular_files(root)]


def audit_task_inputs(root: Path, filenames=None) -> None:
    paths = regular_files(root) if filenames is None else [root / name for name in filenames]
    if root.is_symlink() or not root.is_dir():
        raise ValueError("task directory not found")
    for path in paths:
        if path.is_symlink() or not path.is_file():
            raise ValueError("task inputs must be regular files, not symbolic links")
        relative = path.relative_to(root).as_posix().lower()
        if any(token in relative for token in FORBIDDEN_PATH_TOKENS):
            raise ValueError("task input path contains a protected-material marker")
        if path.suffix.lower() in TEXT_EXTENSIONS:
            if path.stat().st_size > 8 * 1024 * 1024:
                raise ValueError("task input text exceeds validation size limit")
            text = path.read_text(encoding="utf-8", errors="strict").lower()
            if any(marker in text for marker in FORBIDDEN_TEXT_MARKERS):
                raise ValueError("task input text contains a protected-material marker")


def write_json(path: Path, value: dict) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n",
                         encoding="utf-8")
    temporary.replace(path)


def seal(root: Path, destination: Path, *, max_files: int, max_bytes: int,
         overflow_policy: str = "warn_and_seal") -> tuple[list[dict], list[str]]:
    if overflow_policy not in ("warn_and_seal", "reject"):
        raise ValueError("unsupported submission overflow policy")
    records = file_records(root)
    warnings = []
    if len(records) > max_files:
        warnings.append("submission_export_file_limit_exceeded")
    if sum(row["bytes"] for row in records) > max_bytes:
        warnings.append("submission_export_byte_limit_exceeded")
    if warnings and overflow_policy == "reject":
        raise ValueError("submission exceeds configured export limits")
    temporary = destination.with_name(destination.name + ".tmp")
    created = False
    try:
        output = temporary.open("xb")
        created = True
        with output, tarfile.open(fileobj=output, mode="w:gz") as archive:
            for row in records:
                source = root / row["path"]
                if source.is_symlink():
                    raise ValueError("submission changed before sealing")
                with source.open("rb") as handle:
                    if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                        raise ValueError("submission is not a regular file")
                    info = archive.gettarinfo(fileobj=handle, arcname="submission/" + row["path"])
                    if info.size != row["bytes"]:
                        raise ValueError("submission changed before sealing")
                    info.uid = info.gid = 0
                    info.uname = info.gname = ""
                    reader = _DigestReader(handle)
                    archive.addfile(info, reader)
                    if reader.digest.hexdigest() != row["sha256"] or handle.read(1):
                        raise ValueError("submission changed during sealing")
        temporary.replace(destination)
    except BaseException:
        if created:
            temporary.unlink(missing_ok=True)
        raise
    return records, warnings


class _DigestReader:
    """Hash the exact bytes written into the archive, not a second path read."""

    def __init__(self, handle):
        self.handle = handle
        self.digest = hashlib.sha256()

    def read(self, size):
        data = self.handle.read(size)
        self.digest.update(data)
        return data
