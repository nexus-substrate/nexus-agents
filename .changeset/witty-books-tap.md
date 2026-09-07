---
'nexus-agents': patch
---

pipeline: a registered skeleton plugin is marked in the run record (#5863)

Every core plugin is a lazy skeleton — `noopStageResult()` returns `{ success: true, outputArtifacts: [], metadata: { stub: true } }` — and the default registry is the only registration for the `analyze`, `route` and `execute` stage types. So `registry.resolve()` succeeds, the real-plugin branch is taken, and a stage that did nothing recorded a bare `completed`: more confidently than an *absent* plugin, which the placeholder path already marks with `placeholder: true` "so an inspector can tell a real execution from a skipped one".

`metadata.stub` was the one truthful field the producer emitted, and it was discarded on the line that built the record. It now travels with the status.

Not fixed here, and worth naming: a stage that declares `outputArtifacts` and produces none still records `completed` with no reconciliation. That is a separate decision.
