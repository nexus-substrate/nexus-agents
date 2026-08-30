---
'nexus-agents': patch
---

fix(security): replace the backtracking hidden_instruction detector with a linear scan

The `hidden_instruction` detector backtracked catastrophically on adversarial
input, and the containment fix in #5262 made it roughly **3x worse**. Measured on
Node 22 with a repeated-prefix body:

| input | before #5262 | after #5262 |
| --- | --- | --- |
| 8.8 KB | 203 ms | 699 ms |
| 17.6 KB | — | 5,743 ms |

Growth is cubic, so a body at GitHub's 65,536-character PR-body cap runs for
minutes.

This was reachable. `sanitizeToolInput` runs in `secure-handler`'s
`runPreChecks` for **every** secure-handled tool, ahead of the tier check, behind
only a 10 MB size gate. `wrapToolWithTimeout` cannot mitigate it — backtracking
blocks the event loop synchronously, so the timer never fires. A single crafted
PR body to `pr_review` would wedge the entire stdio MCP server, every unrelated
tool call included.

Detection is now a linear `indexOf` scan over comment spans: walk to `<!--`, find
the matching `-->`, test the interior once against an alternation of literals, and
never revisit a character. Behaviour is unchanged — all 37 existing correctness
tests pass untouched, including the #5258 containment cases.

Three cost regression tests now pin the property that was missing. Reintroducing
the regex does not merely fail them; it **hangs the test runner past two
minutes**.

Both the pre-#5262 and post-#5262 regexes were exploitable. #5262 worsened an
existing hazard rather than creating one, but it put it on an attacker-reachable
path by giving `pr_review` a tier that made the detector load-bearing.
