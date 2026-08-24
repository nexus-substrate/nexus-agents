---
'nexus-agents': patch
---

fix(agents): correct the token-provenance count, and carry it where a failure is visible

Follow-up to an adversarial review of #4762/#4764, which found two real defects
and three overstated claims in my own merged work.

**The count treated legacy zeros as measured.** `unmeasuredResults` was computed
with `!== false`, so a contributor from a producer that sets no flag — the
majority of them — landed in the measured set. Absent then meant both "all
measured" and "all legacy", contradicting the field's documented meaning. It
tests `=== false` now.

The sum and the count genuinely need different predicates: the sum excludes
known-unmeasured, the count includes only known-unmeasured. `result-aggregator`
and `session-helpers` held duplicate expressions that agreed by coincidence and
would have diverged the moment one was corrected — extracted to
`summarizeTokenUsage` so there is one answer.

**A failed trinity phase never recorded provenance.** The branch that set
`tokensMeasured: false` on failure was unreachable: each phase returns `err`
before pushing to history, so a failed phase never becomes a
`TrinityPhaseResult`. The failure IS observable through
`protocol.trinity.phase_completed`, which fires either way and carried a bare
`tokensUsed: 0`. The flag now rides on that event, and the test asserts it there
rather than on a record that cannot exist.
