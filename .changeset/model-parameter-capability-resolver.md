---
'nexus-agents': minor
---

Add a data-driven model-parameter capability resolver (#4067, epic #4066 layer 1).
Generalizes the ad-hoc `temperatureUnsupportedForModel` into a registry-first resolver
(`model-parameter-support.ts`): `unsupportedParametersForModel` / `modelSupportsParameter`
answer "does this model reject this request param?" and `getMaxTokensParamForModel`
answers `max_tokens` vs `max_completion_tokens` (OpenAI reasoning, #4049). `ModelCapability`
gains `unsupportedParameters` + `maxTokensParam`, encoded for the registered OpenAI codex
models; the existing regex predicate remains the fallback for unregistered ids (Claude
4.7/4.8, bare o-series). `temperatureUnsupportedForModel` is now a thin, behavior-preserving
shim over the resolver — the adapter call sites are unchanged (a parity test pins the
pre-refactor behavior). Data + resolver only; the adapter param-builders are wired in
layer 2 (#4068).
