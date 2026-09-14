# governance/ — committed governance ledgers

The two `.jsonl` files here are the committed, tamper-evident record sets the
governance gates read. Each line is a self-hashed record; the set is verified
by `verifyVoteRecordSet` / `verifyPrReviewRecordSet` (a hash-covered monotonic
`sequence`, not a linear chain — see `packages/nexus-agents/src/audit/`). Both
carry `merge=union` in `.gitattributes`, so two PRs that each append a record
merge without conflict; the duplicated sequence they leave behind is a benign
fork signal, not corruption. Two branches appending the same record `id` merge
the same way — two lines under one id, tolerated by the verifier today and
reported as `already-present` by a later append; whether that is a refusal is
step 2's decision.

A JSONL reader treats every non-blank line as a record and fails closed on one
it cannot parse, so the ledgers cannot carry a header comment. This file is
where their provenance is stated instead.

## vote-records.jsonl

**Starts on 2026-09-13.** The ledger was 0 bytes from its creation in #3897
and #3927 until #5130 step 1, because the `consensus_vote` tool writes its
record to the runtime store (`<repo>/.nexus-agents/governance/vote-records.jsonl`,
gitignored — #3991) and nothing copied records here. The first record is the
first one appended under the caller-commits path described below; records
land in the same PR they ratify.

**Earlier records are not here, by decision.** A quick panel on #5130
(2026-09-13, option B, 3 of 3) chose to start fresh rather than backfill: the
312 records in the operator's runtime store at cut-over come from one machine,
predate the `ratifiesPr` binding so no gate could have used them, and are
already evidenced where they were used — the tally comments on the PRs and
issues they decided (for example #5022, #5105, #5121, #5118 and #5130 itself).
They remain in that operator's runtime store, hash-verifiable there, and are
NOT part of this ledger's sequence. An auditor who needs one should ask for it
by its record id from the PR comment that cites it.

**An empty ledger and a broken transport must stay distinguishable** (#5130,
Q2 condition 3). This note is the anchor: the ledger is empty before the first
record because it was cut over on the date above, not because the transport
failed. Once the first record is in, a later governor-path PR that carries no
record is a gate finding (#5131), not an empty-ledger condition.

### How a record gets here (#5130 step 1)

1. The ratification panel runs through `consensus_vote` with
   `ratifiesPr: { pr, headSha }` — the PR number and the full head sha the
   panel reviewed. The binding is inside the record's self-hash. The result
   carries `voteRecordId`.
2. The caller runs, from the repo root,
   `pnpm exec tsx scripts/append-ratification-record.ts --record-id <voteRecordId>`
   (or `--job <jobId>` for an async vote). The script copies that one record
   from the runtime store into this ledger. It refuses a record that is not
   PR-bound, whose own hash does not verify, or whose decision is not
   `approved`, and it refuses to extend a ledger that does not verify. The
   hash check refuses a record edited WITHOUT re-hashing; a record edited and
   re-hashed, or fabricated, passes it — this path trusts the operator's
   store, as the threat model states for author-typed records. Provenance is
   step 2's job (cross-check against the job sidecar and the PR tally
   comment) or signing (#3927 item 4).
3. The copy is re-sequenced to this ledger's next `sequence` and re-hashed;
   every content field is carried verbatim, and `id` is preserved so the two
   copies can be matched. `sequence` is hash-covered by design (#3927), so a
   verbatim copy at the runtime store's sequence would fail verification here.
4. The caller commits the ledger in the ratified PR. The ledger-only tip
   commit is expected; the gate (step 2, #5779 / #5131) treats
   `headSha ∈ {head, head^}` as bound when `head` touches only the ledger.

## pr-review-records.jsonl

The diff-bound `pr_review` ledger (#3831), read by the warn-first
governor-review gate (`scripts/check-governor-review.ts`). Unlike the vote
ledger it has no runtime-store detour: `persistReviewRecord` (#4031) writes to
`<repo-root>/governance/pr-review-records.jsonl` directly, but only when the
caller supplies `prNumber` and `baseSha` and the server's cwd resolves to this
checkout. It is 0 bytes as of 2026-09-13 because no call has met both
conditions; its caller-commits path is not part of #5130 step 1.
`governor-review-genesis.txt` lists the PRs exempt from that gate because they
pre-date the record convention.

## The other files

`authority-tier-evidence.yaml`, `claims-registry.yaml`, `loop-tiers.yaml` and
`strategy-manifests.yaml` are hand-maintained governance inputs checked by
their own drift gates (`scripts/check-authority-tier-drift.ts`,
`scripts/check-strategy-manifest-drift.ts`, `scripts/claims-check.ts`).
