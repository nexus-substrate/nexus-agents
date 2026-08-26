---
'nexus-agents': patch
---

test(adapters): pin the load-bearing half of the circuit-breaker recovery fix

The #5011 fix changed two lines and the test pinned only their conjunction:
each half is individually sufficient, so reverting either alone left the suite
green. The code comment asserted one half was "the operative fix" and the other
"redundant" — a ranking no test could falsify.

Two assertions now pin the early return directly: a failure recorded while the
circuit is open must not restamp `lastFailureTime`, and must not increment
`failureCount`. Dropping that return alone now fails both.

Reverting the `lastStateChange` change alone still fails nothing, and that is
the honest result rather than a gap: with `lastFailureTime` frozen, the two
fields are set microseconds apart at the open transition and never diverge. The
comment now says which half is pinned and admits the other cannot be.
