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
failed. The first record went in on 2026-09-14 (PR #6241), and from that
point a governor-path PR that carries no record is a gate FAILURE (#5131),
not an empty-ledger condition — the gate now refuses the empty ledger too.

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
every governor-path PR, computed by `scripts/governor-ledger-evidence.ts`,
and exits on it (#5131 — see "Fail-closed" below):
`ratified` (a record binds this PR at `head` or, for a ledger-only tip,
`head^`; `decision === 'approved'`; `strategy` is `supermajority` or
`unanimous`; `panelCoverage` present with `errored === 0`; and the ledger is
append-only against the base), or one of:

- `no-record` — nothing binds this PR; an empty ledger is this, never `ratified`.
- `sha-mismatch` — records bind this PR, none at an accepted head.
- `not-approved` — a bound record's decision is not `approved`.
- `wrong-error-policy` — a bound record records an `errorPolicy` other than
  `absolute_quorum` (#6211, schema tier 1.11). The record carries the
  EFFECTIVE policy the panel ran under; a pre-1.11 record has no such field
  and falls through to the panel-coverage inference below, and the
  `ratified` line then says `errorPolicy: unrecorded`.
- `wrong-strategy` — a bound record's `strategy` is below the governor bar:
  anything other than `supermajority` (0.667, the bar in CLAUDE.md
  "Consensus voting thresholds") or `unanimous` (1.0, above it) (#6235).
  `decision: approved` only says the tally cleared the strategy's own bar —
  a 4/7 whole panel under `absolute_quorum` is `approved` at
  `simple_majority`, and `higher_order` is a 0.5 tally (#5315). `strategy`
  is a required, hash-covered field on every record, so there is no
  unrecorded case; the `ratified` line names the strategy it read.
- `unmeasured-panel` — a bound record has no `panelCoverage`, or one naming
  zero seats; the record cannot show the panel ran whole (#6213). A bound
  record written by `buildVoteRecord` always carries coverage, so this names
  a hand-typed or pre-#6213 line.
- `degraded-panel` — a bound record's `panelCoverage.errored > 0`.
- `ledger-invalid` — a line does not parse, or the set does not verify (a
  bad hash, a sequence hole).
- `ledger-rewritten` — the head ledger is not the base ledger plus appended
  lines (#6213). The workflow reads the ledger at the merge-base (empty when
  the file did not exist there) and the base's record lines must be an
  ordered SUBSEQUENCE of the head's: present, byte-identical, in the same
  relative order, with insertions allowed anywhere. This is what catches a
  dropped tail line with the new record re-sequenced into its slot, an
  edit-and-re-hash, a reorder or a truncation — shapes the set verifier
  accepts, each of which deletes or alters a base line. Subsequence, not
  prefix, because the union driver writes OURS first: for two branches that
  each append one line (A merged first, merge-base now `base + A1`), a
  rebase or a merge into main yields `base + A1 + B1`, but merging main INTO
  the branch (GitHub's "Update branch") yields `base + B1 + A1` — a
  legitimate refresh that a prefix rule refused. Outranks everything but
  `ledger-invalid`.
- `duplicate-id` — one id names two different records.

An unreadable ledger (a directory at the path, a permissions error) prints
`unmeasured` naming the error instead of crashing the gate (#6213); so does a
run with no PR number (a direct push to `main`), or with no head sha. The
post-merge backstop binds to the merged PR's FINAL pre-squash head (#6249):
the squash commit is not the head the panel saw, so the job resolves
`pulls/{n}` → `head.sha`, fetches `refs/pull/{n}/head` so that commit's
parent and file list resolve for the ledger-only-tip rule, and passes the
same `PR_HEAD_SHA` / parent / files the pre-merge job does. It used to key
on the PR number alone, which accepted a record bound to sha1 for a PR whose
final head was sha2 (pushed past a red pre-merge gate and admin-merged) — the
#6249 panel's contrarian named that, and a backstop that cannot see it is not
a backstop. A PR whose head cannot be resolved is `unmeasured`, exit 1. The
backstop checks append-only against the tip before the push
(`github.event.before`, #6218).

**Fail-closed since 2026-09-14 (#5131).** The ledger verdict is part of the
gate's exit code: a governor-path PR passes only when the label/approval
verdict is `ratified` AND the ledger verdict is `ratified`. Every other
ledger kind above, and `unmeasured`, is a `::error::` and exit 1 — including
`no-record` over the empty ledger, which is the defect #5131 names (three
gates once read a 0-byte ledger, found nothing to refuse, and exited 0). The
same rule runs on the post-merge backstop, so a merge that bypassed the
pre-merge job turns `main` red. There is no bootstrap allowlist, by the
#5118 panel's decision: a PR that touches a governor path carries its own
record or it does not merge. The flip was measured against the first real
record (PR #6241, `vote-1789376500996-fxkw4uk`) before it landed, and
warn-first ended when it did.

Precedence (the verdict's `kind`): `ledger-invalid` → `ledger-rewritten` →
`duplicate-id` → `no-record` → `sha-mismatch` → `not-approved` →
`wrong-error-policy` → `wrong-strategy` → `unmeasured-panel` →
`degraded-panel` → `ratified`. **Report order differs from precedence** for
the per-record checks (the #6219 panel's note, applied at flip time): the
printed line lists EVERY failing check over the bound records, with the
misconfiguration kinds — `wrong-error-policy`, `wrong-strategy`,
`unmeasured-panel`, `degraded-panel` — named before `not-approved`, so a
run that was rejected under the wrong policy reads as a misconfigured run
rather than a plain rejection. The verdict's `kind` stays `not-approved` in
that case; its `failures` list carries the full set.

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
