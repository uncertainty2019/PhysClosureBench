# Common examination and submission rules

## Examination boundary

- `task/` contains the task specification, resource limits, and common submission requirements. No target paper, solution, previous submission, reference reproduction, or confidential grading material is supplied.
- Work independently. Network search, network package installation, external agents, subagents, and interactive help are forbidden. Follow the task's offline reference and integrity policy; do not invent citations or missing task-specific parameters.
- Read `CANDIDATE_ENVIRONMENT.md` for workspace paths and tool instructions. Use `scratch/` for compilation and temporary calculations. Tools do not prescribe a scientific method.
- Use the provided Bash tool for computation. Do not submit scheduler jobs, request another allocation, use SSH, or detach work beyond the examination. Each Bash call runs in a separate container: files in the workspace persist, but background processes are not a supported continuation mechanism. Use saved checkpoints or bounded foreground runs if needed.
- Choose and defend your derivation, numerical strategy, diagnostics, evidence, physical interpretation, and applicable scope, except where the task fixes a boundary.
- Through Bash, run `./exam-status` to query elapsed and remaining time. This is a read-only clock, not scientific progress advice. The controller enforces the total work deadline independently of this query.
- All scientific work and submission writing must finish within the active limit. Any collection reserve is only for shutdown and collection. Timeout still collects available partial work.

## Submission

Follow `task/submission_requirements.md`. The six required entry points and the artifact-inventory format are defined there. Write final materials under `submission/`; no separate submit command is required. Incomplete work is collected without inventing missing files or scientific results.
