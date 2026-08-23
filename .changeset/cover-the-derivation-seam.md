---
'nexus-agents': patch
---

Test the seam where all three deploy-staleness bugs lived ([#4516](https://github.com/nexus-substrate/nexus-agents/issues/4516) follow-up).

This detector has now needed three fixes — an unreachable grace window (#4551), an input supplied from outside that was never supplied (#4557), and a version absent from the registry reported as unmeasured (#4575). Its unit tests were **green through all three**, because they exercise `assessDeployStaleness` with _supplied_ inputs and every bug was in what the input turned out to be.

The derivation was doing I/O with no test at all. `elapsedMinutesFrom(body, version, nowMs)` is now a pure function covering the three outcomes that must stay distinct:

- published → elapsed minutes
- **absent from the registry** → `0`, a deploy in flight; npm does not have the version, so the site cannot be serving it
- **no `time` map, or an unparseable date** → `NaN`, reported as unmeasured

Writing that test immediately found a fourth bug in the fix merged minutes earlier: a malformed response with no `time` map returned `0`, so an unreadable registry read as "just published" and passed. It now returns `NaN`. Collapsing "I could not understand this response" into "this was published just now" is the same laundering the detector exists to prevent, and it was one release away from shipping.

Also covers the clock-skew composition: a registry ahead of the runner yields a negative elapsed time, which the assessor rejects rather than granting an unbounded grace — the two halves now have a test proving they compose.
