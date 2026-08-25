---
'nexus-agents': patch
---

fix the routing-audit budget line spilling out of its box, and a drift guard that could not fail

Two defects from the previous release, both mine.

The `[simulated — not evaluated against real cost or config]` label was appended
to the "Budget Filter" heading, giving an 82-character line inside a
63-character content area. `padEnd` silently no-ops past its target, so the
right border was pushed off every line of that section. Split across two lines.
The test that shipped with it asserted `toContain('simulated')`, which passes on
a broken render; it is now joined by one that measures the rendered width.

The accompanying anti-drift test was vacuous. It called the audit's context
builder and the production one and compared the outputs — but the audit side had
just become `return taskProfileToBanditContext(profile)`, so it compared a
one-line delegation to its own callee: true for every input, forever. The
wrapper is now a re-export of the production symbol, and the test asserts
function identity, which fails the moment anyone reintroduces a body. Divergence
is impossible rather than merely untested.

Also removes an orphaned doc comment left behind by a deleted constant.
