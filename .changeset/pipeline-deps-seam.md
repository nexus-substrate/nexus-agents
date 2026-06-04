---
'nexus-agents': patch
---

Make the pipeline engine's PluginRegistry dependency explicit (#3175). `PipelineRunner.compile()` previously reached for the process-global `getPipelinePluginRegistry()` singleton inline — an implicit dependency. It now resolves through a small, tested seam: the new `resolvePipelineDeps(deps)` + `PipelineDeps` bundle (exported from the pipeline barrel), where an injected `pluginRegistry` wins and an omitted one falls back to the documented global default. Behavior is unchanged when nothing is injected; the seam is the extension point the injectable-OutcomeStore work (#3145) builds on. Verified scope note: the EventBus is already injected via `PipelineExecuteOptions.eventBus` (global fallback already centralized in `pipeline-observability.resolveBus`), and the ArtifactStore is unconsumed by the runner — so this pass intentionally covers only the one dependency the engine actually resolved implicitly.
