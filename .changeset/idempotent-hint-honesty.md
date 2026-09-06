---
'nexus-agents': patch
---

`delegate_to_model` no longer declares `idempotentHint: true`. Every call minted a fresh run id, so a retry after a lost response delegated to the model again — a second run directory, a second trace, a second bill — while the hint told gateways the retry was safe. The other four tools that pair `idempotentHint: true` with `readOnlyHint: false` were audited and each now records what absorbs a repeat call, enforced by a test so the claim cannot reappear without one.
