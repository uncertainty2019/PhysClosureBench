# Usage

This guide is for users preparing and running model evaluations. Section 4
describes the environment and instructions delivered to the candidate.

## 1. Prepare the execution environment

Local smoke tests require only Python 3.10 or later. Real model runs require
Linux, OpenCode **1.18.17**, Podman, and a prepared scientific container image.
The Bash adapter targets this OpenCode version. Check adapter compatibility
when upgrading, and install the provider adapter required by your connection.

Build the scientific image from the repository root:

```console
podman build -f environment/Containerfile -t physclosurebench-science environment
```

The recipe specifies Python 3.11, numerical and plotting libraries, scientific
compilers, MPI, and build tools. Package requests are in
[`environment.requested.yml`](../environment/environment.requested.yml). Build
and retain the image for your experiment, use it across compared models, and
record its digest in the run config.

Before calling a model, check an existing image and the computation bridge:

```console
python scripts/check_container.py --runtime podman --image physclosurebench-science
```

This check tests offline computation, read-only task inputs, submission writing,
command timeout, and container cleanup without an API request.

## 2. Prepare task inputs

The complete 50-case materials are on
[Hugging Face](https://huggingface.co/datasets/Tauben/PhysClosureBench/tree/main/cases).
The example uses the same filenames:

```text
cases/case30/
  task.md
  resource_limits.json
submission_requirements.md
```

The dataset additionally contains `grading_rubric.md`, `grading_rubric.json`, and
`sources.md` for evaluators. The runner selects only `task.md` and
`resource_limits.json` from the specified case directory and adds the common
submission requirements supplied with this repository. Display identifiers use `Case01` through `Case50`;
directory names use `case01` through `case50`.

Prepare a dedicated model host with the agent inputs and runtime dependencies.
Keep rubrics, source references, source papers, previous answers, and unrelated
agent settings off that host. When using the full dataset, separate agent inputs
from evaluator materials before deployment.

## 3. Configure and run a model

Copy `configs/run.example.json` to `configs/run.local.json`. Replace the template
placeholders with your provider/model identifier, reasoning options, image digest,
and credential environment variable names. Output-token budgets may be left unset.
See [configuration](configuration.md) for field definitions.

Allocate the task's CPU cores and enforce its scratch quota using the host
resource manager, then enable the two deployment confirmations.

Supply the API key through the launch environment. In Linux Bash, enter it without
echoing it or including its value in shell history:

```bash
read -r -s -p "API key: " OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
```

In `configs/run.local.json`, include `"credential_env": ["OPENAI_API_KEY"]` and
set the provider's `options.apiKey` under `provider_configuration` to
`"{env:OPENAI_API_KEY}"`. The variable name can be used with other compatible
providers; configure their endpoint and model separately. Keep the key out of
the JSON configuration. The runner does not automatically load `.env` files.

Run the following commands from the same terminal:

```console
python -m physicsbench validate-task --case cases/case30
python -m physicsbench run --case cases/case30 --case-id Case30 --config configs/run.local.json --output state/Case30-r1-a01
```

Use a new output directory for every attempt. Each invocation is independent.
Before measurements, run a short integration test covering model access,
reasoning options, and retrieval restrictions. Have the agent create a file with
its native write/patch tool and read it through Bash. For a vision endpoint,
also generate a PNG and read its contents through native `read`. Native tools
use host absolute paths; Bash uses the corresponding `/workspace` paths.

## 4. Candidate environment and submission

The candidate receives the initial prompt, examination rules, environment/tool
instructions, task specification, resource limits, and common submission
requirements. The workspace is arranged as follows:

```text
workspace/
  CANDIDATE_PROMPT.txt
  EXAM_INSTRUCTIONS.md
  CANDIDATE_ENVIRONMENT.md
  exam-status
  task/
    submission_requirements.md
    cases/case30/
      task.md
      resource_limits.json
  scratch/
  submission/
```

This preserves relative links in the dataset. Bash runs inside the offline
container at `/workspace`; native file tools use the absolute host workspace
path shown to the candidate. These are two views of the same files, not
interchangeable absolute paths. Final materials go under `submission/`. Candidates
can repeatedly query remaining time with `./exam-status` through Bash.

Computation containers receive no model credential and cannot access the network.
The OpenCode process must still reach the model endpoint. Each Bash call uses a
separate container: workspace files persist, but background processes are not a
continuation mechanism. The candidate is instructed to use saved checkpoints
and bounded foreground runs when needed.
An omitted Bash timeout defaults to 120 seconds; the agent can explicitly request
longer calls. The example per-command maximum is 1200 seconds and can be adjusted
for the task. The overall task deadline still applies; see [configuration](configuration.md).

The six required entry points are `REPORT.md`, `DERIVATION.md`, `RUN_LOG.md`,
`REFERENCES.md`, `INTEGRITY.md`, and `ARTIFACTS.json`. Their definitions are in
[`submission_requirements.md`](../submission_requirements.md).

## 5. Inspect results

After execution, the runner retains `result.json`, the workspace, and harness
logs, plus `submission.tar.gz` when submission export succeeds. If export fails,
the summary's `archive` field is `null`. Model runs also retain the effective
OpenCode configuration. The run summary records identity, elapsed time, applied
settings, file inventories, and warnings.
Its schema is [`result.schema.json`](../schemas/result.schema.json).

`status` reports process completion, and `submission_requirements` reports
required-file presence. Timeout and nonzero exits retain available partial work.
Grade the archived work separately using the task-specific rubric and the paper's
Appendix H; `grading` in the run summary remains `null`.

Supply credentials through environment variables and review outputs before
sharing. The runner redacts exact forwarded credential values from logs and
rejects them in submission exports.

## Batch execution

Each invocation runs one independent single-node attempt. Use your cluster
scheduler to run attempts concurrently, assigning the CPU, storage, and time
allocation specified for each task. Configure batch dispatch and credential
routing for your deployment.
