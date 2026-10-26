---
title: Native GitHub approval eligibility canary
description: Run one protected fixed-content experiment and distinguish native review eligibility from missing evidence.
diataxis: how-to
audience: project
tier: 3
keywords: [governance, github, approval, canary, review]
related_files:
  - .github/workflows/native-approval-canary.yml
  - scripts/native-approval-canary.ts
  - packages/nexus-agents/src/governance/native-approval-canary.ts
---

# Native GitHub approval eligibility canary

Use this experiment to measure whether the existing GitHub Actions token's review satisfies the current native review requirement. It never merges a PR or authorizes general automated approval. The design and alternatives are tracked in [#7621](https://github.com/nexus-substrate/nexus-agents/issues/7621); the inactive delegated policy in [#7618](https://github.com/nexus-substrate/nexus-agents/pull/7618) remains deferred.

## Prepare the protected implementation

Before creating or dispatching the canary, finish artifact review, a whole-panel supermajority vote with `absolute_quorum`, committed head-bound ledger evidence, and all nonhuman gates. The owner must then ratify and personally merge the governor PR. Agents must not supply the owner's label, approval, signature, or merge. Landing the implementation does not dispatch the workflow.

Local test prerequisites are Node/pnpm, Git, Python 3 and `jq`; the workflow-filter tests execute real `jq`. CI already provides these tools.

### Confirm read access without spending the canary invocation

The implementation PR's existing governor job performs a bounded, read-only GraphQL preflight using its Actions token with declared `contents: read` and `pull-requests: read`. It runs only for the same-repository implementation branch, after the ratification gate even when that gate fails. It neither changes that verdict nor counts as a canary dispatch. The fixed query is tested against the canary's exact query; no PR source is imported or executed by this step.

Before dispatch, retain a live `READABLE` receipt from that step for the final implementation head. The receipt binds the repository, workflow SHA, run/attempt, head, observed main, query/response digests and declared token permissions. Verify that the reviewed tree became trusted main. This lower-privilege read is capability evidence, not token-identity attestation or approval eligibility. The canary's fresh in-run checks remain authoritative.

`UNMEASURED`, a skipped step, or a missing receipt prohibits dispatch. Hold the experiment inactive and investigate the prerequisite; do not retrigger workflows or expand permissions to force a preferred result. The older required-jobs REST read and an owner-authenticated read do not satisfy this GraphQL Actions-token condition. Expected read failures are classified and exit cleanly; unexpected script faults fail visibly. No `continue-on-error` flag masks them.

### Author and verify the one-shot source freeze

The protected manifest freezes the entire tracked source tree for this experiment. It excludes exactly its own file, `governance/native-approval-canary-source-snapshot.json`, and the separately verified append-only ledger, `governance/vote-records.jsonl`. These are passive data; neither exclusion may become a runtime or loader configuration input.

After staging the complete candidate implementation, author the manifest locally with:

```sh
python3 -I -S scripts/check-native-canary-snapshot.py --write
git add governance/native-approval-canary-source-snapshot.json
```

Authoring refuses when `CI` or `GITHUB_ACTIONS` is set. It produces a candidate for the normal governor review and owner ratification process. It cannot ratify itself. The source digest must describe the final reviewed tree; regenerate and repeat review if tracked source changes. The final ratification ledger append does not change that digest.

Verify the committed candidate in a fresh checkout without dependencies, ignored files, or untracked files:

```sh
python3 -I -S scripts/check-native-canary-snapshot.py --check
```

The workflow performs this isolated Python check immediately after pinned clean checkout, before pnpm/Node setup or installation. Git checks literal file bytes without filters, executable modes, index/HEAD agreement, complete path sets, and the absence of extra files. Symlinks, gitlinks, unsupported paths, malformed or empty measurements, and exhausted resource bounds refuse readiness. Linux byte-exact checkout is required; line-ending conversion is not accepted. Host Git, isolated Python, the runner, pinned actions, and the locked external toolchain remain trusted. Snapshot equality does not prove that source or dependencies are safe.

After installation without lifecycle scripts, `pnpm exec tsx scripts/check-native-canary-source.ts` separately checks the governed runtime import closure against its committed path snapshot. It runs before either GitHub token environment variable is set. The minimal review writer shares the existing canonical transport, token cache and single POST implementation with the legacy SCM interface. Node, tsx, TypeScript, gh and locked Zod are explicit external trust, outside that import measurement.

Any ordinary source merge after manifest ratification invalidates **only canary readiness**, never ordinary CI. Dispatch before the next source merge. A stale-manifest dispatch is a measured refusal that consumes the experiment; it is not permission to regenerate in CI or rerun the workflow. The refusal artifact includes the authored base tree for diagnosis. This source freeze is restricted to #7629; reuse elsewhere requires a fresh panel decision.

The workflow, launcher, canonical SCM write/receipt ingress, and governance modules are governor-owned. Both governor review collectors explicitly exclude Bot, App, missing-type, and bot-login actors from human owner approvals. A canary bot approval cannot ratify governor changes.

## Prepare exactly one fixed-content PR

1. Start from the current trusted `main` commit after the protected implementation lands. Record its full SHA as the base.
2. As the owner, create `probe/native-approval-eligibility-v1` in this repository. Add exactly one commit directly atop that base.
3. Add only `docs/fixtures/native-approval-canary.txt`, as a regular nonexecutable file (`100644`), with these exact bytes, including the final newline:

   ```text
   Nexus native approval eligibility canary v1.
   ```

4. Open an owner-authored, nondraft PR against `main`. Keep auto-merge disabled. Do not add another approval or a change request. Wait for all checks to finish successfully; the two required contexts must come from the expected GitHub Actions App.
5. Record the PR number and full head SHA. If `main`, the PR, protection, or required checks change, stop: the recorded tuple is stale.

The guard verifies repository and actor IDs, the full one-commit comparison, direct parent, git tree mode, exact blob bytes and SHA, canonical governor coverage, complete check and legacy-status coverage, current protection, and prior workflow/branch-PR/review history. It does not execute PR code or install PR dependencies.

## Dispatch once from main

Dispatch **Native approval eligibility canary** on `main`, supplying `pr_number`, `head_sha`, and `base_sha` from the prepared tuple. The launcher requires the exact trusted workflow/checkout commit and a clean tracked source tree. Credentials are the workflow's existing token; no personal token, new App, repository-setting change, or extra privilege is part of this experiment.

The collector reads classic protection through GraphQL and separately checks active branch rulesets. The [REST protection endpoint](https://docs.github.com/en/rest/branches/branch-protection#get-branch-protection) requires Administration read permission, which this workflow does not request. Inaccessible, null, malformed, incomplete, or unsupported protection evidence stops the experiment. An owner's successful read does not prove that the Actions token can read it.

Concurrency is fixed and reruns are refused. **Every invocation consumes the experiment**, including a transient failure or refusal. Retain run history and the fixed branch's PR history: the replay guard relies on GitHub retaining these records and does not claim tamper-proof storage. Do not delete history or choose another branch to reset it.

## Interpret the evidence and close the PR

Download `native-approval-eligibility-<run-id>`. Its `result.json` retains measured evidence and SHA256 digests, the known receipt when available, and `writeAttempted` separately from eligibility. It also retains validated source-snapshot and manifest hashes. `source-snapshot.json` records the pre-install check, and `source-closure.json` lists the measured project runtime closure and governor-pattern count. An early refusal may leave only the snapshot report. Reports are created once in a fresh checkout and never overwritten.

The current CLI transport does not supply structured HTTP status. That value is unmeasured and omitted, rather than inferred from raw stderr. Fixed receipt-validation causes and stage names are retained without raw error messages or credential values.

| Result       | Meaning                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------- |
| `refused`    | Measured evidence failed policy before a write.                                                   |
| `unmeasured` | A prerequisite, write, or readback was unavailable, malformed, changed, or inconclusive.          |
| `eligible`   | The exact bot review was read back; native state was `APPROVED` and `CLEAN` for the pinned tuple. |
| `ineligible` | The exact bot review was read back; native state remained `REVIEW_REQUIRED` and `BLOCKED`.        |

Before posting, the native baseline must be `REVIEW_REQUIRED` and `BLOCKED` for the same tuple. Both the baseline and subsequent native states are retained. An HTTP success or review receipt alone is not eligibility. Reads and the review POST are not one GitHub transaction; fresh reads detect observed races but do not exclude concurrent repository writers. Keep the experiment quiescent. The POST always includes the reviewed commit SHA, and fresh evidence is collected again after the write.

Close the canary PR **unmerged**, including after a negative or inconclusive measurement. Record the artifact and conclusion on #7621. Do not rerun, retry with another identity, or change settings to obtain a preferred result. Any broader approval workflow requires a fresh full-panel decision and separate governor implementation, review, owner ratification, and human merge.

## Use the additive SCM method

`IScmReviewer.createReview(prNumber, body, decision)` retains its existing three-argument `Result<void, ScmError>` contract. Implementers may omit the new optional `createReviewAtCommit` method. GitHub's implementation accepts a full lowercase commit SHA and returns a validated `ScmReviewReceipt` containing review ID, commit, state, and reviewer identity. Callers must handle capability absence and errors explicitly; the canary never falls back to the unbound method.

Legacy reviews retain the CLI's inherited authentication, including [GH_TOKEN precedence over GITHUB_TOKEN](https://cli.github.com/manual/gh_help_environment), without introducing a resolver lookup. Commit-bound reviews and existing API reads retain the shared cached resolver's behavior. The canary requires both variables to contain the same nonempty token. This compatibility distinction is internal; there is no public authentication option. The legacy failure-message prefix is preserved while structured transport context remains available; canary artifacts retain only bounded, sanitized diagnostics.
