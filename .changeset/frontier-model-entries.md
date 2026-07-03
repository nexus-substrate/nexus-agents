---
'nexus-agents': minor
---

feat(registry): add frontier model entries — claude-fable-5, gpt-5.5, gemini-3.5-flash (#4176)

Adds in-tree registry entries (and MODEL_IDS tuple members) for the current
frontier models from the models.dev snapshot (2026-06-29): claude-fable-5
(1M context, $10/$50 per 1M, extended-thinking class, cliAlias `fable`),
gpt-5.5 (1.05M context, $5/$30, reasoning-class: rejects `temperature`,
expects `max_completion_tokens`, mirrors codex-5.3), and gemini-3.5-flash
(1M context, $1.5/$9, flash tier). Quality-first defaults bump: `claude` →
claude-fable-5 and `codex` → gpt-5.5; `gemini` stays on gemini-3-pro because
gemini-3.5-flash is flash-tier, not a pro successor. claude-fable-5 carries
explicit `unsupportedParameters: ['temperature']` (belt-and-braces over the
fable→5.0 regex fallback) and both new reasoning-class incompatibilities are
locked into KNOWN_PARAMETER_INCOMPATIBILITIES. The generated-catalog loader
now drops $0/$0 pricing rows (litellm placeholder artifacts, e.g. the
mythos-class bedrock entry) so `computeCostDetail` reports them as UNPRICED
(unmeasured) instead of a fake measured $0.
