---
'nexus-agents': minor
---

feat(models): universal model catalog resolution across adapters and observers

Eliminates conservative 8K default context window and hardcoded capability matching for catalog and frontier models:

- Bridges `ModelRegistry` catalog resolution into `expert-context-observer.ts` via `resolveExpertContextWindow(modelId)`, preventing premature context warnings on 1M+ context models.
- Updates provider adapters (`claude-adapter-helpers.ts`, `gemini-types.ts`, `openai-types.ts`) to inspect `ModelRegistry` entry metadata (`inputModalities` and `specialFeatures`), dynamically detecting vision and extended thinking capabilities.
- Maps `reasoning: true` from the `models.dev` catalog to `specialFeatures: ['extended_thinking']` in `model-catalog-admission.ts`.
