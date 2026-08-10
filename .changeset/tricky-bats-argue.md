---
'nexus-agents': patch
---

fix(consensus): compare canonical model identity in panel diversity checks (#4390)

The consensus panel's diversity check built a `Set` of raw `modelId` strings. The
same weights arrive under different strings from different gateways —
`claude-sonnet-4-6` via the claude CLI, `anthropic/claude-sonnet-4-6` via
opencode, `custom/claude-sonnet-4-6` via an OpenAI-compatible endpoint — so one
model counted as three and the warning never fired for a collapsed panel.

`config/model-equivalence.ts` adds `canonicalModelKey` and `countDistinctModels`,
built on the existing `resolveModelIdentitySync`, which already normalises gateway
prefixes. An unidentifiable model returns `null` and is counted by its raw string
rather than sharing a placeholder key — otherwise two genuinely different models
would compare equal, which is the inverse error and the worse one, since it would
silence a warning that should fire.

Also adds the check the CLI round-robin path never had: distinct CLIs do not imply
distinct models, and a panel spread across two arms fronting the same weights is no
more independent than one on a single arm.

Scope note: these checks are `logger.warn` only — nothing gates on them — so this
fixes observability rather than a live consensus hole. The same string comparison
also affects cost attribution in `decision-cost-recording`, which is tracked
separately.
