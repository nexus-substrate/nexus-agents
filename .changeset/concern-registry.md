---
'nexus-agents': patch
---

feat(governance): concern registry ratchet — one canonical implementation per operation (#5123)

Epic #5121 found six new parallel implementations beyond the two already
tracked, and named the root cause: CLAUDE.md's canonical table lists **symbols**,
so it could bless both `createAllAdapters()` and `UnifiedAdapterRegistry` — two
entries for one question. This registry is keyed on the **operation**, and each
entry answers exactly one.

Cleaning up eleven cost paths is worth little if a twelfth lands next week. On
its first run this gate found exactly that: `QualityConstraintStage` prices every
token at the input rate against a cost ceiling, so the ceiling fails open
(#5186). The #5122 audit — a fan-out grep across the tree — had missed it. An
inventory is a snapshot; a gate is a ratchet.

Per the epic's constraints: detection is **declared per concern** rather than
being a bespoke general duplicate-detector, and alternates are tracked by
**presence, not counts**. Counts were the contrarian's strongest objection —
two unrelated PRs touching the same alternate would both mutate the number and
the second would hit a merge conflict, and a gate that punishes uninvolved
developers gets disabled. `merge=union` was the alternative considered and was
rejected because union-merging a JSON array produces invalid JSON, unlike the
JSONL ledgers it works for.

Two failure modes, both real: a new unregistered implementation, and a registered
alternate that no longer matches — so the debt count shrinks as work lands rather
than drifting upward forever. A concern whose pattern matches nothing is also a
failure, because it could not detect a new implementation either.

Seeded with the cost concern and its three outstanding alternates (#5186, #5180,
#5122).
