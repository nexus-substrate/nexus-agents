---
'nexus-agents': minor
---

`listModels()` across direct-API and CLI adapters (#2540 PR 5 of 8).

Anthropic and Google direct-API adapters (`ClaudeAdapter`, `GeminiAdapter`) gain `listModels()` that wraps the SDKs' `client.models.list()` surface — 5-min cache, in-flight promise sharing, throws on probe failure so the harness-side identity resolver can fall back. The OpenCode CLI adapter (`OpenCodeCliAdapter`) gains a `listModels()` that reshapes the existing `opencode models` probe into `CliModelInfo` rows, splitting `provider/model` ids when present.

`ICliAdapter` gains an optional `listModels?(): Promise<readonly CliModelInfo[]>` slot mirroring the one on `IModelAdapter`. The new `CliModelInfo` type is exported from `cli-adapters/types`. The custom-OpenAI gateway wrapper (`openai-compat-adapter.ts`) now forwards `listModels` from the inner adapter when the inner adapter exposes one — so a multi-vendor gateway (Claude/Gemini/OpenAI/etc behind one base URL) reports its inventory honestly.

Subprocess CLI adapters whose CLIs have no native list surface (`claude`, `codex`, `gemini`) intentionally leave `listModels` undefined. Identity for those falls back to `modelId` parse via `ModelRegistry`.
