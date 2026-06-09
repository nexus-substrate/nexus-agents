---
'nexus-agents': patch
---

test(capability-loop): end-to-end enforce-path integration test against a throwaway repo (#3777)

Adds the integration-layer coverage the #3770 security/QA review flagged as a blocker
for the #3769 enforce flip. The unit tests beside each module cover the orchestrator
control flow and adapters against fakes; this test drives the REAL deps-assembly and the
REAL git worktree/commit/push chain against a throwaway local repo with a local bare
remote (no GitHub), asserting: (1) buildAutoRemediationDeps wires the real proposal-PR
implement + real git-ref lease when repo/repoRoot are present and stays fail-closed
(rejecting stub + null lease) when absent; (2) the real worktree chain commits and pushes
ONLY the one plan doc to `auto-remediation/<slug>` and removes the worktree in `finally`;
(3) the real git-ref lease RELEASE (ref DELETE) still fires when implement rejects mid-run
(no stale lock, #3646); (4) the audit soak-wrap is NOT applied to the enforce branch.
Only the smallest external seams are faked (the `gh` runner + PrCreator); no live GitHub
calls and no `simulateVotes`.
