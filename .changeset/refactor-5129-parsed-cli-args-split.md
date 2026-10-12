---
'nexus-agents': patch
---

refactor(cli): split ParsedCliArgs into per-command option types and encapsulate CustomApiConfig (#5129 item 2)

Refactors the monolithic `ParsedCliArgs` interface and encapsulates custom gateway options as approved by consensus panel (Option A):

- Introduces `CustomApiConfig` in `cli/command-options-types.ts` to encapsulate OpenAI-compatible gateway options (`baseUrl`, optional `apiKey`, optional `model`) so setting partial or uncoordinated flags is unrepresentable.
- Defines typed per-command option interfaces (`SetupCliOptions`, `VoteCliOptions`, `OrchestrateCliOptions`, `DoctorCliOptions`, `InitCliOptions`, `ImprovementReviewCliOptions`, `RemediationReviewCliOptions`, `LearningMetricsCliOptions`, `ModelDriftCliOptions`, `HealthCliOptions`, `JobsCliOptions`) and `CommandArgs<TCommand, TOptions>` container.
- Wires `buildCustomApiConfig` in `cli/cli-options-builders.ts` to automatically construct `customApiConfig` whenever `--custom-api` is supplied.
- Decomposes `cli-commands-handlers-setup.ts` into focused helper functions adhering to cyclomatic complexity $\le 4$ and `exactOptionalPropertyTypes: true`.
- Updates `health-command.ts`, `jobs-command.ts`, and setup handlers to accept typed command arguments while preserving 100% backward compatibility for existing callers of `ParsedCliArgs`.
