# PhysClosureBench

An execution framework for evaluating language models on research tasks in
computational physics. It provides an isolated computation environment,
time-limited independent attempts, and submission archiving.

[Paper](https://arxiv.org/abs/2610.21767) ·
[Dataset](https://huggingface.co/datasets/Tauben/PhysClosureBench) ·
[Usage](docs/usage.md) · [Configuration](docs/configuration.md)

## Task materials and grading

This repository includes **Case 30 Task Specification**, the example in Appendix G
of the paper. The complete 50-case materials are available on
[Hugging Face](https://huggingface.co/datasets/Tauben/PhysClosureBench).
Under [`cases/case01/` through `cases/case50/`](https://huggingface.co/datasets/Tauben/PhysClosureBench/tree/main/cases),
each case contains `task.md`, `resource_limits.json`, `grading_rubric.md`,
`grading_rubric.json`, and `sources.md`. Common submission requirements are in
[`submission_requirements.md`](https://huggingface.co/datasets/Tauben/PhysClosureBench/blob/main/submission_requirements.md).

Agent inputs consist of the task specification, resource limits, and common
submission requirements. Evaluator materials include task-specific grading
rubrics and scientific source references; do not expose them to the agent.
Scientific grading is performed separately using the task-specific rubrics and
the common instructions in Appendix H of the paper.

## Quick start

Python 3.10 or later is sufficient for the following local test. No API key,
container, or additional Python package is required.

```console
python -m physicsbench validate-task --case cases/case30
python -m physicsbench run --case cases/case30 --case-id Case30 --config configs/smoke.json --output state/smoke-01 --smoke-wall-seconds 10
python -m unittest discover -s tests -v
```

The smoke test checks execution and archiving with synthetic output. For a model run,
prepare Linux, OpenCode, Podman, a scientific image, and your model connection as
described in the [usage guide](docs/usage.md).

## Contents

| Location | Contents |
| --- | --- |
| `cases/case30/` | Example task specification and resource limits |
| `submission_requirements.md` | Six required submission files and artifact inventory |
| `protocol/` | Initial prompt, examination rules, and remaining-time query |
| `environment/` | Scientific environment and container recipe |
| `configs/` | Run configuration examples and OpenCode permissions |
| `physicsbench/`, `adapters/`, `scripts/` | Runner and isolated computation tools |
| `schemas/`, `tests/` | Run-summary schema and tests |

## Models evaluated in the paper

The paper reports three independent runs per model and task. When configuring
a run, use the API identifier supplied by your provider.

| Model | Reasoning effort |
| --- | --- |
| Claude-Opus-5 | xhigh |
| GPT-5.6-Sol | xhigh |
| Kimi-K3 | high |
| DeepSeek-V4.1-Flash | high |
| Qwen-3.8-Max | xhigh |
| GLM-5.3-Flash | high |
| Gemini-3.1-Pro | high |

To evaluate another model, configure its provider, API identifier, and supported
reasoning options. See [configuration](docs/configuration.md) for provider-specific
settings.

## Resources

Each task specifies CPU cores, total work time, scratch space, and the offline
boundary. All submission preparation must finish within the task deadline.
Deployment-specific allocation and batch scheduling are left to the operator.
The command timeout is configurable, and vision-capable endpoints can explicitly
register image input; see
[configuration](docs/configuration.md).

## License

Code, configuration examples, and documentation: [MIT](LICENSE).
Task materials: [separate licensing notice](cases/README.md).
Dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
