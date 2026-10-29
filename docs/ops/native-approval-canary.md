---
title: Native GitHub approval eligibility canary
description: Run one protected fixed-content experiment and distinguish native review eligibility from missing evidence.
diataxis: how-to
audience: project
tier: 3
keywords: [governance, github, approval, canary, review]
related_files:
  - .github/workflows/native-approval-canary.yml
  - .github/workflows/native-approval-preflight.yml
  - scripts/native-approval-canary.ts
  - packages/nexus-agents/src/governance/native-approval-canary.ts
---

# Native GitHub approval eligibility canary

Use this experiment to measure whether the existing GitHub Actions token's review satisfies the current native review requirement. It never merges a PR or authorizes general automated approval. The design and alternatives are tracked in [#7621](https://github.com/nexus-substrate/nexus-agents/issues/7621); the inactive delegated policy in [#7618](https://github.com/nexus-substrate/nexus-agents/pull/7618) remains deferred.

## Prepare the protected implementation

Before creating or dispatching the canary, finish artifact review, a whole-panel supermajority vote with `absolute_quorum`, committed head-bound ledger evidence, and all nonhuman gates. The owner must then ratify and personally merge the governor PR. Agents must not supply the owner's label, approval, signature, or merge. Landing the implementation does not dispatch the workflow.

Local test prerequisites are Node/pnpm, Git, Python 3 and `jq`; the workflow-filter tests execute real `jq`. CI already provides these tools.

### Confirm read access without spending the canary invocation

Run **Native approval eligibility preflight** on `main` with the prepared PR/head/base tuple. It is owner-gated and reads classic protection through GraphQL plus active branch rulesets. Any missing, malformed, incomplete, or unsupported protection response fails the preflight. It uploads a strict receipt bound to the repository, workflow, run and attempt, owner actor, PR/head/base, observed main, and query/response digests.

The preflight also attempts to read the repository Actions setting `can_approve_pull_request_reviews`. When the endpoint returns a valid response, the receipt records the value and response digest. An unavailable or malformed settings response is recorded as `unmeasured` with reason `api-read-unavailable`; this setting read is ancillary and does not block dispatch. The workflow does not change the setting. Interpret the canary result using the measured value when available, and do not infer a value from an unmeasured result.

Only after the artifact upload succeeds does the preflight use its narrowly scoped `actions: write` permission to dispatch **Native approval eligibility canary**. GitHub documents that `workflow_dispatch` events created with `GITHUB_TOKEN` start workflow runs ([triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)). The canary downloads the artifact by the exact preflight run ID and independently checks the run’s workflow, owner actor, event, ref, attempt, successful conclusion, and source SHA before proceeding. It polls the exact run up to 60 times, waiting 2 seconds between active states; an unsuccessful or still-active run fails closed. Caller-supplied inputs alone are not accepted as proof of a readable result.

An `UNMEASURED` protection read, skipped step, missing receipt, stale main SHA, or failed provenance check cannot dispatch the canary. Investigate the prerequisite; do not retrigger or expand permissions to force a preferred result. The owner-authenticated protection read alone does not satisfy the Actions-token capability check. A settings-read failure is different: it is retained as an unmeasured field in the receipt and does not stop the preflight. If a canary run fails before the launcher writes its result, the workflow retains an explicit `measurement-artifact-not-produced` fallback record.

### Author and verify the one-shot source freeze

The protected manifest freezes the entire tracked source tree for this experiment. It excludes exactly its own file, `governance/native-approval-canary-source-snapshot.json`, and the separately verified append-only ledger, `governance/vote-records.jsonl`. These are passive data; neither exclusion may become a runtime or loader configuration input.

Local `--write` and `--check` commands require `GH_TOKEN` and `GITHUB_TOKEN` to be unset; the checker refuses with `credentials-exposed-before-snapshot` when either variable is present. The manifest must already be tracked before either command runs.

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

## Start the experiment once from main

Dispatch **Native approval eligibility preflight** on `main`, supplying `pr_number`, `head_sha`, and `base_sha` from the prepared tuple. Do not dispatch the canary directly. Its job accepts only the trusted preflight artifact and run, requires the exact trusted workflow/checkout commit, and checks a clean tracked source tree. The preflight has only the Actions permission needed to trigger the canary; the canary keeps its existing bounded review-write token.

The collector reads classic protection through GraphQL and separately checks active branch rulesets. The [REST protection endpoint](https://docs.github.com/en/rest/branches/branch-protection#get-branch-protection) requires Administration read permission, which this workflow does not request. Inaccessible, null, malformed, incomplete, or unsupported protection evidence stops the experiment. An owner's successful read does not prove that the Actions token can read it.

Concurrency is fixed and reruns are refused. **Every invocation consumes the experiment**, including a transient failure or refusal. Retain run history and the fixed branch's PR history: the replay guard relies on GitHub retaining these records and does not claim tamper-proof storage. Do not delete history or choose another branch to reset it.

## Interpret the evidence and close the PR

Download `native-approval-eligibility-<run-id>`. Its `result.json` retains measured evidence and SHA256 digests, the known receipt when available, and `writeAttempted` separately from eligibility. The preflight attempts to record whether Actions may approve pull requests, but the repository endpoint requires Administration read, which the workflow token does not request; an unavailable or malformed response is explicitly recorded as `unmeasured` and does not block dispatch. The artifact also retains validated source-snapshot and manifest hashes. `source-snapshot.json` records the pre-install check, and `source-closure.json` lists the measured project runtime closure and governor-pattern count. If no result file is available, the artifact includes a separate fallback record; `writeAttempted` is `null` because missing output cannot establish whether the launcher posted a review before it stopped. Since the upload combines runner-temp and workspace paths, files retain subdirectories: find `fallback.json` under the runner-temp subtree and `result.json` under the `.nexus-agents/native-approval-canary` workspace subtree. Reports are created once in a fresh checkout and never overwritten.

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
