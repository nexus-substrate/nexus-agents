---
'nexus-agents': minor
---

Add `IAgenticAdapter` primitive for multi-turn tool-use agent loops (#2529). Counterpart to `IModelAdapter`'s single-shot `complete()` — eval harnesses (and any other consumer driving an agent loop) own their toolset + tool execution while the adapter handles model orchestration.

**Public API additions** (re-exported from the package root):

- `createAgenticAdapter(modelAdapter, options)` factory + `AgenticAdapter` class
- `IAgenticAdapter` / `RunAgentArgs` / `AgentRunResult` / `AgentTurn` / `ToolCall` / `ToolResult` / `AgentStopReason` / `AgentError` types
- `resolveModelIdentity(adapter, options)` + `resolveModelIdentitySync` + `parseModelId`
- `ResolvedModelIdentity` / `ModelHints` / `ModelVendor` / `IdentitySource` types
- `lookupModelProfile(identity)` + `lookupProfileFromModelId(modelId)` + `DEFAULT_PROFILE`
- `ModelBehaviorProfile` / `ToolDefinitionFormat` / `PromptCachingMode` types
- `IModelAdapter.listModels?()` optional method + `ModelMetadata` type

**What it does**: handles the model-orchestration loop for tool-using agents — call → tool_use blocks → harness routes calls → tool_result blocks back → repeat until the model stops, hits the turn budget, errors, or is cancelled.

Per-model behaviour is profile-driven: a custom OpenAI gateway fronting Claude gets Anthropic's profile (parallel tool execution + ephemeral prompt-caching markers) automatically based on the resolved `modelId`, not the `IModelAdapter.providerId`. Operators override via `modelHints`.

**Key invariants**:

- `runAgent` returns `Result<AgentRunResult, AgentError>`; `Result.ok` includes `stopReason ∈ {agent-stopped, turn-budget, tool-error, cancelled}` so partial-progress runs are gradable
- `onTurn` callback fires after each turn for operator visibility
- `AbortSignal` cancels between turns
- `maxConcurrent` semaphore caps concurrent model API calls (released during tool execution)
- Refuses to construct for embedding models (e.g., `text-embedding-3-large`)
- `turnBudget` defaults to `profile.maxRecommendedTurnBudget` when omitted
- `cache_control: ephemeral` marker added to the last tool definition for Anthropic vendors

**Identity resolution** stacks: `modelHints` (operator force) > `/v1/models` probe (`OpenAIAdapter` implements `listModels`) > `modelId`-string parse > `'unknown'`.

Lands in PRs #2530/#2531/#2532/#2533. Pre-work for the eval-repo v0.3 promotions ([nexus-eval-aider-polyglot#9](https://github.com/williamzujkowski/nexus-eval-aider-polyglot/issues/9), [nexus-eval-livecodebench#7](https://github.com/williamzujkowski/nexus-eval-livecodebench/issues/7), [nexus-eval-tau-bench#4](https://github.com/williamzujkowski/nexus-eval-tau-bench/issues/4)) which build on the new primitive.
