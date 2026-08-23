---
'nexus-agents': patch
---

A version that is not published yet reports as deploying, not unmeasured ([#4516](https://github.com/nexus-substrate/nexus-agents/issues/4516) follow-up).

Caught by the detector false-alarming on `main` immediately after a release, which is precisely the failure the previous two fixes were meant to remove.

The chain: the grace window was unreachable because its input was never supplied (#4551), then the script was given ownership of that input so it could not be forgotten (#4557). Both correct. Neither noticed that between a version PR merging and npm publishing, the repo version is **absent from the registry** — so the lookup returned `NaN`, which the assessor honestly reported as `unmeasured` and failed on.

Every release therefore had a window in which the check failed for a reason that was not a problem.

An absent version is not an unreadable input. The site cannot be serving a version npm does not have yet, so that window is a deploy in flight — `deploying`, elapsed time zero. A registry that could not be **fetched** is still `unmeasured`; those are different facts and neither should be laundered into the other.

Verified against the live registry: a lookup for `99.99.99` returns absent → `deploying ok=true`, while an unreadable publish time still returns `unmeasured ok=false`. And on the real transition — 3.6.10 published at 00:14:44Z — the detector now reports `[deploying] Site at 3.6.9, repo at 3.6.10, within the 45-minute deploy window.`
