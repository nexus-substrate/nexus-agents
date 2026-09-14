# governance/ — committed governance ledgers

The two `.jsonl` files here are the committed, tamper-evident record sets the
governance gates read. Each line is a self-hashed record; the set is verified
by `verifyVoteRecordSet` / `verifyPrReviewRecordSet` (a hash-covered monotonic
`sequence`, not a linear chain — see `packages/nexus-agents/src/audit/`). Both
carry `merge=union` in `.gitattributes`, so two PRs that each append a record
merge without conflict; the duplicated sequence they leave behind is a benign
fork signal, not corruption. Two branches appending the same record `id` merge
the same way — two lines under one id, tolerated by the verifier and reported
as `already-present` by a later append. The ratification gate REFUSES that
state (#5130 step 2, `duplicate-id`): one id naming two contents is ambiguous,
and a resolver that accepted either would let a fabricated line shadow the
panel's. Byte-identical copies collapse to one record; different content is a
refusal until the line that is not the panel's is removed.

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

### How the gate reads it (#5130 step 2)

`scripts/check-governor-ratification.ts` prints a second evidence line for
every governor-path PR, computed by `scripts/governor-ledger-evidence.ts`:
`ratified` (a record binds this PR at `head` or, for a ledger-only tip,
`head^`; `decision === 'approved'`; `panelCoverage` present with
`errored === 0`; and the ledger is append-only against the base), or one of:

- `no-record` — nothing binds this PR; an empty ledger is this, never `ratified`.
- `sha-mismatch` — records bind this PR, none at an accepted head.
- `not-approved` — a bound record's decision is not `approved`.
- `unmeasured-panel` — a bound record has no `panelCoverage`, or one naming
  zero seats; the record cannot show the panel ran whole (#6213). A bound
  record written by `buildVoteRecord` always carries coverage, so this names
  a hand-typed or pre-#6213 line.
- `degraded-panel` — a bound record's `panelCoverage.errored > 0`.
- `ledger-invalid` — a line does not parse, or the set does not verify (a
  bad hash, a sequence hole).
- `ledger-rewritten` — the head ledger is not the base ledger plus appended
  lines (#6213). The workflow reads the ledger at the merge-base (empty when
  the file did not exist there) and the base's record lines must be a strict
  PREFIX of the head's: present, byte-identical, in order. This is what
  catches a dropped tail line with the new record re-sequenced into its
  slot, an edit-and-re-hash, or a reorder — shapes the set verifier accepts.
  Prefix, not subsequence, because it is the measured shape of every ledger
  git produces: for two branches that each append one line, the second
  branch un-rebased is compared to the old merge-base, and rebased it gets
  the union driver's upstream-first order (`base + A1 + B1`). An interleave
  is a hand edit; move the line. Outranks everything but `ledger-invalid`.
- `duplicate-id` — one id names two different records.

An unreadable ledger (a directory at the path, a permissions error) prints
`unmeasured` naming the error instead of crashing the gate (#6213). The
post-merge backstop keys on the PR number only — the squash commit is not the
head the panel saw — and says the sha was not checked; it does check
append-only against the landed commit's parent. **Warn-first:** the line is
an annotation and the exit code is still the label/approval verdict's; #5131
flips every non-`ratified` verdict above, and `unmeasured`, to a failure. The
record does not carry `errorPolicy`; an approved record with errored seats is
the only ledger-observable trace of a policy other than `absolute_quorum`,
which is why `degraded-panel` is the check and there is no separate policy
verdict.

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
