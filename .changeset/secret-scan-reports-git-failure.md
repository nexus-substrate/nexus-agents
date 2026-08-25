---
'nexus-agents': patch
---

let the release secret scan report that it did not run

The hardcoded-secret scan in `validateSecurity` piped `git diff` through
`grep | head`. A shell pipeline's exit status is its _last_ command's, and
`head` succeeds essentially always — so a `git diff` failure (a shallow clone,
or any branch with fewer than ten commits) exited 0 with empty output, which is
indistinguishable from a clean tree.

The catch block that records `Secret scan did not run` therefore could not fire
for the case its own remediation names ("re-run with a full git history
available"); only a timeout reached it. Release validation reported the security
expert as passed having scanned nothing.

`scanRecentCommitsForSecrets` now runs `git diff` on its own and filters in JS,
returning either the matches or the reason it could not scan, and the git error
is carried into the finding's description.

Fixes #4839.
