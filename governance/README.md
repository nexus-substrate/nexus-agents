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
   moved-head rule (`ratified-rebased`, #6256) as long as the moved head's
   tree is the ratified patch replayed onto its base; see below.

### Redacting a voter's reasoning

From the repository root, name the record and each voter role whose reasoning
must be removed:

```bash
pnpm exec tsx scripts/redact-vote-record.ts \
  --ledger governance/vote-records.jsonl \
  --record-id <voteRecordId> \
  --role architect --role security \
  --by <actor> --reason "reason for removal"
```

At least one `--role` is required. The script deletes only `reasoning` and
`reasoningNonce` from those voter entries. Their `reasoningDigest`, tally,
decision, truncation marker, record hash and any existing signature stay intact.
It preserves the target line's key order and every other line's bytes; if the
target is not already canonical `JSON.stringify` output, it refuses to reformat
it. It appends a self-hashed redaction record naming the roles, actor, time and
reason at the next sequence across both record kinds.

Unknown or ambiguous record ids, missing roles, absent openings, invalid ledgers
and unsafe sequences are refused without replacing the ledger. Pre-digest-tier
records are refused with “redaction here is a history rewrite; not performed.”
The proposed ledger must verify with the target reported as `redacted` and other
records' states unchanged before a temporary file replaces the ledger atomically.

The appended redaction record is **signed the way a ratification record is**
(#6372): `--signing-key <path>`, else `NEXUS_VOTE_SIGNING_KEY`, else the agent
key at `<dataDir>/auth/vote-record-signing.key`; an owner-principal signature
needs `--as-owner` and `--as-owner` refuses the agent key, exactly as
`append-ratification-record.ts`. The signature sits outside the redaction's
hash (a signed and an unsigned redaction hash the same) and is verified at the
record's `at`; the gate reports it beside the target record's own line
(`signed:agent by …` / `unsigned-record`). With no key configured the record
is appended UNSIGNED and the command says so. The `by` field is
operator-supplied attribution; the signature is the authenticated identity.

Review and commit the ledger diff in a PR. **The PR carrying the redaction is
a governor-path PR and needs its own panel and owner ratification.** Purging
plaintext from Git history is a **separate history rewrite**; this script does
not perform it. Earlier commits still contain the original text and nonce.

### How a record is signed (#3927 item 4, phase 2)

After step 3 — never before, because the signed message is the COMMITTED
hash — the script signs that hash with `ssh-keygen -Y sign -n
nexus-vote-record` when a key is configured: `--signing-key <path>`, else
`NEXUS_VOTE_SIGNING_KEY`, else the agent key at
`~/.nexus-agents/auth/vote-record-signing.key` when it exists (see "Which
key" below). The result lands on the record as
`signature: { keyId, namespace, sig }`, OUTSIDE the self-hash (it is made
over the hash, so it cannot be inside it; a record hashes identically with
or without it, and no schema tier changes). `keyId` is the principal
`allowed_signers` lists the key under — the file names the signer, not the
caller. A configured key the file does not list is `signing-failed` and
nothing is written. With no key configured the record is appended UNSIGNED
and the script says so in one line: phase 2 is opt-in until phase 3.

The signed message is the `hash` string — 64 hex characters, no newline —
never a re-serialised form of the record. The re-vote's contrarian objected
that JSON canonicalisation is brittle across runtimes; signing the hash makes
that moot, and a verifier in any language checks the signature over that
string. Because the hash covers `sequence`, the chain position is signed too.

**What a signature proves.** Access to the listed private key from the
environment that ran the append — not a human's presence. Measured: on
2026-09-14 the agent process signed ledger commit `4a5acd562f` with the
operator's cached GPG key with no prompt, and the agent implementing this
signed a probe with the operator's ssh-agent-loaded ed25519 key the same
way. A signature made like that is a stronger hash, not a ratification.
The #6257 panel's answer (below) is attribution, not custody; a
hardware-backed key was rejected (option A re-humanizes every governor
merge), and CI/OIDC-issued keys for a CI-run append are #6350. The threat
model says the same.

### Which key: `signed:agent` and `signed:owner` (#6257 increment 1)

The #6257 panel (2026-09-15, option B, 5 of 7, `supermajority`,
`absolute_quorum`) gave the autonomous loop its own signing identity so
that a signature says WHICH PROCESS appended — instead of one key that
both the human and the agent could use, which made `signed` mean only "the
key was readable".

- **The agent key.** `pnpm exec tsx scripts/vote-record-keygen.ts`
  generates an ed25519 key with no passphrase at
  `~/.nexus-agents/auth/vote-record-signing.key` (`<dataDir>/auth/…`; mode
  600; never inside a checkout; refuses to overwrite) and prints — public
  material only — the fingerprint and the ready-to-paste `allowed_signers`
  line under the principal `nexus-agent@<hostname>`. The line lands in
  `governance/allowed_signers` through a ratified PR. When the key exists
  and neither `--signing-key` nor `NEXUS_VOTE_SIGNING_KEY` names another,
  `append-ratification-record.ts` signs with it; an automated run needs no
  configuration to sign as itself.
- **The owner's key is reserved for human-made records.** A signature that
  resolves to a principal WITHOUT the `nexus-agent@` prefix is refused by
  the append script unless `--as-owner` was passed — the flag is the
  human's attestation, and without it a run that happened to inherit the
  operator's key (an exported `NEXUS_VOTE_SIGNING_KEY`, a copied shell
  profile) cannot claim human presence by accident. `--as-owner` with the
  agent key, or with no key at all, is refused as a misconfiguration.
- **The verifier returns the principal, never a bare boolean.** `signed`
  carries `principal` and `signerKind` (`agent` when the principal starts
  with `nexus-agent@`, else `owner`), and the gate prints
  `signed:agent by nexus-agent@framework` / `signed:owner by
williamzujkowski@nexus-agents` on `ratified` and `ratified-rebased` lines.
  The kind is read from the FILE's principal for the signing key, not from
  the record's claim: the agent key signing under the owner's name is
  `unknown-signer`.

**What this is, stated plainly.** Honest attribution of which process
appended a record. It is NOT host isolation and adds no non-repudiation
against a compromise of the operator's host: both keys live there, the
agent process can read both, and the `--as-owner` refusal guards against an
accidental owner claim, not a deliberate one (the panel's contrarian and
pm; adopted as binding). Phase 3 (#6279) can require every base-ref record
past a grandfather cutover to carry a valid signature from a known
principal, and a record that claims human ratification to carry the owner
principal — that is where the split becomes an enforced invariant.

### allowed_signers

`governance/allowed_signers` is the OpenSSH allowed_signers file the gate
verifies against (`ssh-keygen -Y verify -f`): one line per principal, with
`namespaces="nexus-vote-record"` so a commit or file signature by the same
key cannot be replayed as a ratification, and a validity window
(`valid-after`/`valid-before`, one comma-joined options token) that is how a
key is rotated — add `valid-before` to the old line rather than deleting it.
Governor path: a change here is ratified like the ledger it vouches for. It
holds the operator's current GitHub key
(`SHA256:6lUiTo0SwQSY2XFa8wIkrBXR2SQLr3uNo6Q9HSSnwgk`, ed25519) as
`williamzujkowski@nexus-agents`, and the agent key on the operator's host
(`SHA256:gJ6ieQNe0mmhQoFHST3GOrMS4qpNNpW0Bg3v2Cg/iVc`, ed25519, generated
2026-09-15) as `nexus-agent@framework`.

### How the gate reads it (#5130 step 2)

`scripts/check-governor-ratification.ts` prints a second evidence line for
every governor-path PR, computed by `scripts/governor-ledger-evidence.ts`,
and exits on it (#5131 — see "Fail-closed" below):
`ratified` (a record binds this PR at `head` or, for a ledger-only tip,
`head^`; `decision === 'approved'`; `strategy` is `supermajority` or
`unanimous`; `panelCoverage` present with `errored === 0`; and the ledger is
append-only against the base), or one of:

- `ratified-rebased` — passes like `ratified` (#6256; redesigned by the
  #6301 panel 1 review, which rejected a position-insensitive patch-identity
  hash): no record binds `head` or `head^`, but one binds an EARLIER head
  `A` of this PR and all four hold: (1) `A` is related to THIS PR — an
  ancestor of the head (a merge from main kept it), or an ancestor of any
  prior head the workflow measured this PR had (`PR_PRIOR_HEADS`: the `synchronize` event's `before`
  plus the `beforeCommit`/`afterCommit` of every `HeadRefForcePushedEvent`
  on the PR's own timeline, keyed on the PR NUMBER — never a branch name,
  which a fork PR can share with a base-repo branch; and never the
  workflow-run list, whose `pull_requests` empties once a PR merges, which
  would have reddened the backstop). The prior head itself and its first
  parent when it touched only the ledger remain an explicit fast path;
  ancestry also covers a ratified sha below a merge and a ledger-only tip.
  Only a prior head a rebase
  orphaned is fetched from `origin` by sha (GitHub serves any object by sha
  — measured on #6252's rebased-away heads); nothing else is fetched,
  because that fetch reaches the whole fork network; (2) `A` carries a
  non-ledger change — `git diff-tree -r <merge-base(A, PR base)> A -- .
':!governance/vote-records.jsonl'` lists a path. A ledger-only PR is
  refused by name: its head replays to its own base, so its record would
  match any commit at or before the fork point — a ledger-only PR binds to
  `head`/`head^` only; (3) the head's TREE equals `A` replayed onto the
  head's base: with `B_H = merge-base(head, PR base)`,
  `T = git merge-tree --write-tree B_H A` (git's own contextual three-way
  merge; a CONFLICT is `sha-mismatch` naming `conflict resolving <path> —
content the panel never saw`, never accepted — a hand-resolved conflict
  is what #6282 had), and
  `git diff-tree -r T head^{tree} -- . ':!governance/vote-records.jsonl'`
  is EMPTY; a path listed is `sha-mismatch` naming it. A clean rebase and
  a clean merge from main produce the same tree, so one rule covers both.
  Blob ids, not a rendered diff: position-sensitive by construction (the
  same lines moved to another function are another blob), binary-safe, and
  blind to `.gitattributes` — no `--text`, no order-sensitive-file list;
  (4) the ledger at `A` is an ordered subsequence of the head ledger. The
  notice names the ratified sha, the head, whether the relation is a merge
  (`ancestor`) or a rebase (`prior-head`), and the replayed tree id, which
  `git merge-tree --write-tree` reproduces from the checkout. What the rule
  does NOT verify, disclosed: that `B_H` is the true base branch —
  `PR_BASE_SHA` is taken from the workflow (`merge-base origin/<base>
  <head>` pre-merge, `main~1` in the backstop), and everything main gained
  between `A`'s fork point and `B_H` was never before THIS panel; it landed
  through its own PRs and gates. The rule proves `head ≡ B_H ⊕ patch(A)`,
  nothing about `B_H`. Both incidents that motivated the rule (2026-09-14):
  #6252 ratified 7-0 at `fca64e9ea8`, rebased to `cce938eec2` for #6249's
  ledger line, re-paneled (passes under the rule); #6282 ratified at
  `43cb8bec`, merged from main to `8618d18d` with a hand-resolved SKILL.md
  conflict, re-paneled (refused under the rule, naming the path — the
  re-panel was right).
- `no-record` — nothing binds this PR; an empty ledger is this, never `ratified`.
- `sha-mismatch` — records bind this PR, none at an accepted head, and none
  passes the moved-head rule; the line names, per recorded sha, why —
  `object not found`, `not an ancestor of the head … not a head this PR
had`, `no non-ledger change`, `conflict resolving <path>`, the head's
  `tree differs … at <path>`, or `not measured` (no `PR_BASE_SHA`).
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

**Signature, reported per bound record, not yet enforced (#3927 item 4,
phases 1-2).** The line also carries the signature verifier's code for every
bound record, verified against `governance/allowed_signers` — distinct,
never collapsed:

- `signed:agent by <principal>` / `signed:owner by <principal>` — a key the
  file lists for `keyId`, inside its window, signed this record's committed
  hash in the `nexus-vote-record` namespace; the kind is the principal's
  prefix (`nexus-agent@` ⇒ agent, else owner — #6257 increment 1, above).
- `unsigned-record` — the record carries no `signature`: every record
  appended before phase 2, and any appended with no key configured.
- `unknown-signer` — there is a signature, but not by a key the file lists
  for `keyId` right now: unlisted, listed under another principal, outside
  its window (`key has expired: …`), or `keyId` has no entry at all.
- `bad-signature` — the key is the right one and the signature does not
  hold: made over another message (an edited-and-re-hashed record,
  re-serialised JSON), under another namespace, or not an armored block.
- `signature-not-measured` — the verifier could not run: `ssh-keygen`
  missing, or `allowed_signers` unreadable (the path is named).

**Phase 3 is live (#6279).** The exit code depends on the signature from
`SIGNATURE_CUTOVER_SEQUENCE` = 15 on — a committed constant in
`scripts/governor-ledger-evidence.ts`, not an env knob, chosen after
measuring the ledger on 2026-09-16 (sequences 0–14 unsigned, every record
from 15 signed by `nexus-agent@framework`). A bound record at or past the
cutover whose verdict is not `signed` is refused as `signature-required`,
naming the verdict's code and ssh-keygen's reason; sequences 0–14 are
grandfathered and the ratified line says so. The signature is verified
against the GATE checkout's `allowed_signers` (#6381), so a PR that lists a
new key must carry a record signed under the previous file. A local call of
the pure function that supplies no verifier prints `signature: unmeasured
(no verifier supplied)` for a grandfathered record and refuses a record past
the cutover — absence is not measured as signed.

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

Precedence (the verdict's `kind`): `ledger-rewritten` → `ledger-invalid` →
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
that case; its `failures` list carries the full set. Since #6348 `ledger-rewritten` is checked FIRST: a changed base line is a rewrite even when the head ledger is also invalid, and the append-only scan admits exactly one difference — a base line whose head counterpart lacks only the `reasoning`/`reasoningNonce` openings of roles named by a redaction record that is present in head and absent from base.

### How the gate becomes a required status context (#4802)

The #6369 rollout landed in two increments (#6373, #6375). The stable
`scripts/governor-gate.ts` dispatcher runs from a `gate` checkout of the BASE
ref with the base's toolchain, and takes the PR head as a sibling `head`
checkout through `--target`. The rule that decides which checkout a read comes
from is **policy from the gate, data from the target**: the CODEOWNERS governor
section and ratifier list, `governance/required-jobs.json`,
`governance/allowed_signers` and the genesis allowlist are POLICY and are read
from the gate's own tree, so a PR that narrows the governor section, edits the
manifest or lists a new signing key is judged by the base's copy — a new key is
admitted by a record signed under the previous file, a governor-section change
by the set it changes; the changed-file list, the vote ledger, workflows,
`package.json` and git history are DATA and come from `--target`. Gate changes
take effect after they merge. Ledger formats evolve reader-first in one
ratified PR, writer-second in another, so main accepts every format a head may
carry; there is no bypass for an unreadable format.

Branch protection on `main` requires `CI Success` and
`Governor-path ratification gate` (#4802). Making the gate required took two
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
`git diff` and one `CODEOWNERS` parse without fetching ratification evidence,
so a transient evidence API failure cannot block an ordinary PR. The separate
required-jobs check below also runs on ordinary PRs. Before this additional
check, an ordinary PR cost about 60 s of runner time, ~35 s of it the
full-history checkout and ~5 s the injector spawn (#6250). The
post-merge backstop runs on every push to `main` the same way. The pr_review
audit gate and the CODEOWNERS parse do not run on an ordinary PR: they read a
`governor_touched` output the ratification jobs compute
(`scripts/governor-paths-touched.ts`, same parser and matcher as the gate)
and are skipped otherwise. The `paths:` blocks were a second, hand-maintained
copy of the governor set; nothing is copied now.

**Coordinated checker + workflow changes take two hops (#6395).** Because the
gate judges the head's workflow with the BASE checker, a PR that changes a
checker and the workflow it reads together can never pass — main's checker
does not know the new shape. Hop 1: teach main's checker to accept the new
shape as well (loosen nothing; the old shape stays accepted), workflow
unchanged. Hop 2: the strict checker and the new workflow together, judged by
the hop-1 checker. Do not admin-merge past the red gate; it is the mechanism.

The governor-owned `required-jobs.json` manifest (#6343) pins every
`ci-success.needs` job ID, the jobs that may legitimately `skipped`
(`skip_allowed`), the required contexts `CI Success` and
`Governor-path ratification gate`, and the absence of `pnpm.auditConfig`.
Each required context is bound to the ONE job that may report it
(`required_contexts["CI Success"] = { workflow: "ci.yml", job: "ci-success" }`,
#6390): branch protection requires a context by job _name_ while the shape
lock below judges a job by _ID_, so without the binding a renamed aggregator
plus a trivial twin named `CI Success` satisfied both. The checker now fails
when the pinned job is absent or carries another name, and when any other job
in any workflow reports a required context. Two more are drift, not a
downgrade to `unmeasured` (#6401 panel): a workflow file that does not parse
(author-controlled tree state — the twin's junk sibling), and a job whose
`name` is an expression whose literal parts could evaluate to a required
context (`${{ 'CI ' }}Success`; `Build (${{ matrix.os }})` cannot). Only an
unlistable workflows directory is unmeasured.
Since #6382 the aggregator reads `NEEDS_JSON: ${{ toJSON(needs) }}` and runs
`AGGREGATOR_RUN`, a run body that is POLICY in `scripts/check-required-jobs.ts`
and must match byte for byte — there is no per-job line to comment out. The
`ci-success` job is held to ONE accepted shape rather than a denylist (#6387,
`scripts/aggregator-shape.ts`): workflow root keys exactly
`name, on, permissions, concurrency, jobs` (a root `defaults.run.shell` or
`env` reaches the step, which the lock forbids from overriding it); job keys exactly `name, needs, runs-on, timeout-minutes, if, steps` with
`if: always()`, exactly one step of keys `name, env, run`, env keys exactly
`NEEDS_JSON, SKIP_ALLOWED`. Any other key (`shell:`, `continue-on-error`,
`container:`, an env `PATH`), a sibling step, or a missing `if:` is drift —
each was a way the pinned script could run, or not run, without deciding
the job. A NEEDED job carrying `continue-on-error` (job or step) is drift
too: GitHub reports its result as `success` after it fails; so is a need
that calls a reusable workflow (`uses:` hides the same knob), and a
`skip_allowed` need whose `if:` is anything but
`github.event_name == 'pull_request'` (the one licensed reason to skip), or
that `needs:` another job (a skipped dependency skips it on every PR). `scripts/check-required-jobs.ts` runs inside
`Governor-path ratification gate` on every PR, so weakening CI wiring is
checked by a governor-owned job. Measured drift fails the job (exit 1);
unreadable branch protection leaves only protection membership `unmeasured`;
local producers are still checked, and missing producers remain drift. Exit 0
means all checks passed; exit 2 means at least one check was unmeasured and
none drifted. Unmeasured diagnostics use `::warning::`, drift diagnostics use
`::error::`, and the workflow step warns on exit 2 while failing on exit 1. The manifest's
empty needs list is drift, and its exact match to the live CI needs list is
covered by an integration test.

**Part 2 (landed, owner-visible settings change): require the context.**
The status context named exactly `Governor-path ratification gate` is in
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
