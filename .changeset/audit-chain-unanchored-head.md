---
'nexus-agents': patch
---

fix(audit): report an unanchored chain head instead of verifying it clean

`verifyEvent` guarded the `previousHash` comparison with `index > 0`, so
`verifyChain` never asserted that a chain STARTS at a genesis. Deleting the
first n lines needed no rehash — the remainder returned `{ ok: true }` while its
new head still carried a live 64-hex pointer to the deleted predecessor. The
evidence was present and discarded.

This is a gap against what the threat model claims, not accepted risk: the
document says the chain reliably detects naive deletions by an adversary who
does not recompute it, and front-deletion is exactly that class. Tail truncation
and the empty chain remain documented and accepted, and are unchanged.

`verifyChain` now reports `unanchoredHead: { previousHash, detail }`.
Deliberately not `ok: false` — routine log rotation produces an identical shape
and the verifier cannot distinguish the two, so reporting tamper would flag
every rotated deployment and teach operators to dismiss it. The honest verdict
is: links verified, origin unverified.

Threat-model T6 moves from "Detected? No / HIGH" to partial / MEDIUM, naming
what is still undetected — a fabricated genesis with recomputed hashes remains
indistinguishable, and needs an external anchor.
