---
'nexus-agents': minor
---

Stratified runtime-outcome report ([#2662](https://github.com/williamzujkowski/nexus-agents/issues/2662), Epic E).

`fitness-audit` is static source-tree analysis — it never sees runtime data. This adds the **separate** runtime-outcome report (the #2662 design vote kept the concerns apart): `scripts/stratify-outcomes.ts` reads the OutcomeStore JSONL and breaks task outcomes down per stratum — `adapter` × `task-type` × `voter-role` — because an aggregate success rate hides where failures live (the v1 snapshot shows `architecture` tasks at 21.5% while the aggregate stays high).

- `TaskOutcomeSchema` gains an optional `voterRole` field; `recordVoteOutcomes` now threads `vote.role` through, so the voter-role dimension populates as consensus votes accumulate.
- The `self-dogfood` workflow — which actually exercises the agents and accumulates OutcomeStore data — uploads a `fitness-stratified.json` artifact. (Per the design vote, this is wired where runtime data exists, not onto the static `fitness-audit` CI job which would see an empty store.)
- Novel/uncategorized failures (`generic`/`unknown` failure category) are surfaced separately for triage. v1 snapshot at `docs/research/fitness-stratified-v1.md`.
