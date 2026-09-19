---
'nexus-agents': patch
---

Apply strict Tier 1 floor for unlisted action types in corroboration validator (#6419). Fixes docs/code drift where `.rules/untrusted-input.md` mandates that an action type absent from the corroboration table receives the strict Tier 1 floor, preventing `TypeError` on unlisted types.
