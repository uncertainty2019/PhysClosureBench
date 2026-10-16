# Submission Requirements

Put all final materials under `submission/`. The following six top-level files are required for every task, with the filenames listed below. You choose the structure of the task-specific report and the organization and filenames of supporting figures, data, and code, subject to the task's scientific requirements:

1. `REPORT.md` — integrated scientific report: question, approach, results, physical interpretation, validity threats, and conclusion.
2. `DERIVATION.md` — model construction and derivation in enough detail to reconstruct the implemented equations and conventions.
3. `RUN_LOG.md` — chronological record of important commands/runs, parameter changes, failed attempts, convergence checks, and the final producing run.
4. `REFERENCES.md` — every consulted source with title/author or identifier, date, access route, and purpose. State `None` if no external reference was consulted.
5. `INTEGRITY.md` — declaration of tools, model/harness, network or external assistance, prior code/data, unexpected visible files, and any suspected integrity issue.
6. `ARTIFACTS.json` — machine-readable inventory linking claims and figures to producing code and retained data.

Use these optional subdirectories as needed:

```text
submission/
  code/       producing source code and scripts
  data/       raw and processed arrays/tables needed to verify the results
  figures/    final figures in lossless or vector form where practical
  logs/       program stdout, timing, convergence and resource logs
```

`ARTIFACTS.json` must be valid JSON and should have this minimum shape:

```json
{
  "schema": "research-exam-submission/v1",
  "claims": [
    {
      "claim_id": "C1",
      "statement": "A concise scientific claim",
      "evidence_files": ["figures/result.png", "data/result.npz"],
      "producing_code": ["code/run.py"],
      "limitations": "What this evidence does not establish"
    }
  ],
  "figures": [
    {
      "path": "figures/result.png",
      "data_files": ["data/result.npz"],
      "producing_code": ["code/run.py"]
    }
  ],
  "final_run_commands": ["python code/run.py"]
}
```

Filenames inside `ARTIFACTS.json` are relative to `submission/`. Include actual data behind plotted conclusions when feasible; a picture alone may be insufficient for numerical audit. Do not include credentials, caches, virtual environments, package downloads, or symlinks.

Complete derivation, implementation, computation, interpretation, checks, and final-file preparation within the candidate-active deadline in the case's resource limits. Network retrieval, external agents, interactive examiner guidance, target-study solutions, and previous submissions are prohibited. The collection reserve is not additional candidate work time.

If blocked, preserve derivation, code, run records, partial data, error diagnostics, and a precise statement of which conclusions remain unsupported; do not fabricate completion.
