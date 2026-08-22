---
'nexus-agents': patch
---

Every gate script must now be reachable from CI, and six that were not are wired ([#4562](https://github.com/nexus-substrate/nexus-agents/issues/4562)).

Option B from the panel that chose #4561. `check-schema-fanout.ts` sat unwired for over three months while two documents said it ran in CI (#4553). An audit for the same shape found **six more**:

| script                          | state                                  |
| ------------------------------- | -------------------------------------- |
| `check-authority-tier-drift`    | npm script existed, no workflow ran it |
| `check-catalogue-drift`         | npm script existed, no workflow ran it |
| `check-strategy-manifest-drift` | npm script existed, no workflow ran it |
| `check-memory-contract`         | neither                                |
| `check-tool-distinctness`       | neither                                |
| `check-tool-output-consistency` | neither                                |

The first calls itself _"the CI half of the authority-ladder enforcement layer"_ in its own header. It was not in CI.

All six **pass today** — verified before wiring, because an unrun gate rots: `lint:arch` had existed since #570, was wired into nothing, and had drifted red with nine false positives by the time #4490 found it.

`check-script-wiring.ts` asserts each `scripts/check-*.ts` is reachable, counting both a direct workflow reference and an npm-script hop where a workflow runs that script by name. It lives in the existing blocking `lint` job rather than a new workflow, so there is no separate thing to drop.

**It checks itself first.** The panel that chose this option named the recursion as the reason it scored worst on immunity — a wiring gate that is not wired proves nothing — so the first assertion is its own reachability. Verified by removing its own CI line and watching it fail.

**A false positive found by running it.** The first pattern required the script name immediately after `pnpm`, and `ci.yml` invokes `pnpm --silent check:model-drift`, so a genuinely-wired gate reported as unwired. False positives are what teach people to ignore a gate, so the matcher now tolerates flags and a test pins that exact case.
