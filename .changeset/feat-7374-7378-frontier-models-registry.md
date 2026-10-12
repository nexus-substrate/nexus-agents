---
'nexus-agents': patch
---

feat(models): register newly discovered frontier models in canonical matrix (#7374, #7375, #7376, #7377, #7378)

Registers 5 newly released frontier models discovered via live `models-dev` and OpenRouter drift detection into the canonical in-tree model matrix:

- `claude-opus-5` (Issue #7374 / #6625): Anthropic flagship, 1M context, 128K maxOutput, $5/$25 pricing.
- `gemini-3.7-flash` (Issue #7375 / #6625): Google flash tier, 1M context, 65K maxOutput, $0.75/$3.75 pricing, extended thinking.
- `nemotron-3.5-content-safety` (Issue #7376 / #6625): NVIDIA OpenRouter safety guardrail model, 131K context, 16K maxOutput, $0.20/$0.20 pricing.
- `gpt-6-luna-pro` (Issue #7377 / #6625): OpenAI flagship, 1.05M context, 65K maxOutput, $0.10/$0.50 pricing, citations and streaming.
- `claude-opus-4.8` (Issue #7378 / #6625): Anthropic flagship, 1M context, 128K maxOutput, $5/$25 pricing.

Updates `MODEL_IDS` tuple, `DEFAULT_MODEL_CAPABILITIES.models` matrix, and test coverage in `model-config-helpers.test.ts`.
