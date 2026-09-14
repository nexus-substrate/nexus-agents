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
   A head that later moves to pick up another PR's ledger line — a rebase,
   or GitHub's "Update branch" merge from main — keeps its record under the
   moved-head rule (`ratified-rebased`, #6256) as long as the non-ledger
   patch is byte-identical; see below.

### How the gate reads it (#5130 step 2)

`scripts/check-governor-ratification.ts` prints a second evidence line for
every governor-path PR, computed by `scripts/governor-ledger-evidence.ts`,
and exits on it (#5131 — see "Fail-closed" below):
`ratified` (a record binds this PR at `head` or, for a ledger-only tip,
`head^`; `decision === 'approved'`; `strategy` is `supermajority` or
`unanimous`; `panelCoverage` present with `errored === 0`; and the ledger is
append-only against the base), or one of:

- `ratified-rebased` — passes like `ratified` (#6256, tightened by the
  #6301 review): no record binds `head` or `head^`, but one binds an
  EARLIER head of this PR and all four hold: (1) the ratified sha is
  related to THIS PR — an ancestor of the head (a merge from main kept it),
  or a head the workflow measured this PR had (`PR_PRIOR_HEADS`: the
  `synchronize` event's `before` plus the head shas of the workflow's own
  runs on the PR branch since the PR opened, bounded to this repository),
  or the first parent of such a head when it touched only the ledger (the
  tip a force-push replaces is the ledger-only A1; the record binds A =
  A1^). Only a prior head a rebase orphaned is fetched from `origin` by sha
  (GitHub serves any object by sha — measured on #6252's rebased-away
  heads); nothing else is fetched, because that fetch reaches the whole
  fork network; (2) the non-ledger patch identity is non-empty and equal —
  `sha256` over
  `git diff --text -U0 <merge-base(sha, PR base)> <sha> -- . ':!governance/vote-records.jsonl'`
  with `index` lines and `@@` hunk headers removed, hashed byte-for-byte,
  for the ratified sha and for the head. `--text`, because without it a
  binary-detected file (a `.bin`, a `.ts` holding a NUL byte, a path under a
  `.gitattributes` `-diff` rule) diffs as `Binary files … differ` plus the
  `index` line the identity strips, so two contents were one patch. The
  empty identity (a ledger-only PR) is refused on either side: it equals
  itself and binds the record to no patch — a ledger-only PR binds to
  `head`/`head^` only; (3) the order-sensitive files — `CODEOWNERS` and
  `.rules/*.md` (`ORDER_SENSITIVE_FILES` in `governor-patch-identity.ts`,
  with the reason per entry) — are byte-equal at both shas, because their
  meaning is which section a line sits in and the identity is
  position-insensitive within a file; (4) the ledger at the ratified sha is
  an ordered subsequence of the head ledger. The notice names the ratified
  sha, the head, whether the relation is a merge (`ancestor`) or a rebase
  (`prior-head`), and the shared identity. Why `-U0` and not `git
patch-id`: #6282's SKILL.md hunk differs at the default 3 lines of context
  only in a trailing context line (main's newer PIPELINE NOTE — every
  workflow PR appends there), and `git patch-id` strips whitespace before
  hashing, so a whitespace-only edit inside a string literal would count as
  the same patch. Disclosed limit: outside the order-sensitive files the
  identity is position-insensitive within a file — the same added/removed
  lines at another location in the same file hash the same. Everything
  else (a changed byte, binary or text, a file added or dropped, a mode
  change) changes it and the verdict is `sha-mismatch`. Cost of the
  order-sensitive set: a change to one of those files merged in from main
  between the ratified sha and the head also sends the PR back to the
  panel. Both incidents that motivated the rule (2026-09-14): #6252
  ratified 7-0 at `fca64e9ea8`, rebased to `cce938eec2` for #6249's ledger
  line, re-paneled; #6282 ratified at `43cb8bec`, merged from main to
  `8618d18d`, re-paneled.
- `no-record` — nothing binds this PR; an empty ledger is this, never `ratified`.
- `sha-mismatch` — records bind this PR, none at an accepted head, and none
  passes the moved-head rule; the line names, per recorded sha, why —
  `object not found`, `not an ancestor of the head … not a head this PR
had`, the patch identity `differs`, `empty non-ledger patch`, an
  order-sensitive file that `differs`, or `not measured` (no
  `PR_BASE_SHA`).
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
  `ledger-invalid`. The moved-head rule applies the same subsequence test
  between the ledger at the ratified sha and the head ledger; a failure
  there is this kind too, naming the ratified sha it was compared against.
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
`degraded-panel` → `ratified` / `ratified-rebased` (the per-record checks
run over the records bound at the moved sha exactly as over a head-bound
set, so a dissent there is `not-approved`). **Report order differs from precedence** for
the per-record checks (the #6219 panel's note, applied at flip time): the
printed line lists EVERY failing check over the bound records, with the
misconfiguration kinds — `wrong-error-policy`, `wrong-strategy`,
`unmeasured-panel`, `degraded-panel` — named before `not-approved`, so a
run that was rejected under the wrong policy reads as a misconfigured run
rather than a plain rejection. The verdict's `kind` stays `not-approved` in
that case; its `failures` list carries the full set.

### How the gate becomes a required status context (#4802)

Branch protection on `main` requires one context, `CI Success`, so the gate
above can go red without blocking a merge (#4802). Making it required has two
parts; only the first is code.

**Part 1 (landed): the gate reports on every PR.** A required context must
appear on every pull request, or the PR can never merge — GitHub shows it as
`expected` and waits. `governor-review.yml` used to be path-filtered to the
governor set, so its jobs never reported on an ordinary PR. The workflow-level
`paths:` filter is gone: the `Governor-path ratification gate` job runs on
every `pull_request`, computes the governor-path verdict itself from the one
parse of `CODEOWNERS`, and exits 0 with `not-applicable` when no governor path
is touched. The detector runs before any GitHub API call, and the evidence
and gate steps are gated on its output (#6260): an ordinary PR performs one
`git diff` and one `CODEOWNERS` parse and never reaches the API, so a
transient `gh api` failure cannot block a PR the gate has nothing to say
about. On an ordinary PR that costs about 60 s of runner time, ~35 s of
it the full-history checkout and ~5 s the injector spawn (#6250). The
post-merge backstop runs on every push to `main` the same way. The pr_review
audit gate and the CODEOWNERS parse do not run on an ordinary PR: they read a
`governor_touched` output the ratification jobs compute
(`scripts/governor-paths-touched.ts`, same parser and matcher as the gate)
and are skipped otherwise. The `paths:` blocks were a second, hand-maintained
copy of the governor set; nothing is copied now.

**Part 2 (owner-visible settings change, by panel): require the context.**
Add the status context named exactly `Governor-path ratification gate` to
`main`'s required status checks
(`gh api -X PATCH repos/{owner}/{repo}/branches/main/protection/required_status_checks`
with the context appended to `contexts`, or the branch-protection UI). The
name is pinned by `scripts/check-governor-review.test.ts`: renaming the job
does not fail CI, it makes the required context stop reporting, which blocks
every PR until the setting or the name is fixed. `enforce_admins` is a
separate decision: while it is off, `gh pr merge --admin` still bypasses the
required set, and the post-merge backstop is what turns that into a red
`main`.

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
