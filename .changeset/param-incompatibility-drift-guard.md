---
'nexus-agents': patch
---

Add the model-parameter drift guard (#4070, epic #4066 layer 4): a single declarative,
exported `KNOWN_PARAMETER_INCOMPATIBILITIES` registry of the documented incidents
(#4061 Claude>4.6, #4062 OpenAI reasoning, #4049 max_completion_tokens), asserted in CI
against the resolver. The next param drift — a bumped Claude threshold, an edited regex,
a removed `unsupportedParameters` — now fails CI instead of 400-ing in production. The
registry is exported so it doubles as documentation and as the anchor for the deferred
provider-reality reconciliation. Part 2 (scheduled OpenRouter `supported_parameters`
reconciliation) is tracked separately.
