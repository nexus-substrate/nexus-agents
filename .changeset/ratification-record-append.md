---
'nexus-agents': minor
---

Ratification vote records can now bind to a PR at its head, and a script copies
them into the committed governance ledger (#5130 step 1).

`consensus_vote` accepts an optional `ratifiesPr: { pr, headSha }` — the PR
number and the full 40-hex head commit the panel reviewed. The binding is
written into the authentic vote record as a new present-only field (schema
1.10) and is covered by the record's self-hash, so a persisted record cannot be
repointed at a different PR or a later push without failing verification.
Records without it hash exactly as before; every earlier record still
verifies. The vote result now also carries `voteRecordId`, the id of the
persisted record.

A new operator script, `scripts/append-ratification-record.ts --record-id <id>`
(or `--job <jobId>`), copies one record from the runtime store
(`.nexus-agents/governance/vote-records.jsonl`) into the committed
`governance/vote-records.jsonl` so the caller can commit it in the PR it
ratifies. It refuses a record that carries no `ratifiesPr`, whose own hash does
not verify, or whose decision is not `approved`, and it refuses to extend a
committed ledger that fails verification. The hash check catches a record
edited without re-hashing; a re-hashed edit passes, because this path trusts
the operator's runtime store — provenance is the gate's job (step 2) or
record signing. The committed copy is re-sequenced
to the ledger's next `sequence` and re-hashed; every content field and the
record `id` are carried verbatim. Two branches appending concurrently merge
under the existing `merge=union` attribute, tested with real git.

The committed ledger starts fresh on 2026-09-13 by panel decision;
`governance/README.md` records where earlier records live. Reading the ledger
from the governor gate is the next step (#5779, #5131).
