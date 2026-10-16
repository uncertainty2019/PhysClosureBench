# Third-party components and licensing

Project-authored software, configuration examples, and documentation use the
root MIT license. Task materials have [separate licensing](cases/README.md).

Install OpenCode and `@opencode-ai/plugin` from their upstream distributions.
The Bash adapter targets OpenCode 1.18.17. Retain the dependencies' licenses
and notices when redistributing them.

The scientific image uses a Miniforge base and packages from conda-forge.
Their respective licenses remain applicable. Package versions are specified in
`environment/environment.requested.yml`.

The runner, Bash adapter, and common candidate instructions are portable
adaptations of the benchmark execution framework. Case 30 is the task example
in Appendix G of the paper.
