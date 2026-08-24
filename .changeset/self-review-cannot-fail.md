---
'nexus-agents': patch
---

fix(security): two checks I added yesterday that could not fail

Found by an adversarial review of my own self-merged commits.

The privileged-label denylist matched exactly, while the gate it protects
(`check-governor-ratification.ts`) compares `l.toLowerCase()`. So
`Owner-Ratified` would have slipped the guard and still satisfied ratification.
A guard must reject at least as broadly as its consumer accepts.

The envelope anti-vacuity assertion required an envelope to be at the widest
value in all four dimensions, including `vcs === 'push'` — and every envelope
declares `vcs: none`, so it could never fail. It was added specifically to
answer a warning that an unbounded envelope recreates the vacuous check one
level down, and it was itself vacuous. It now counts widest-value dimensions
and fails at 4 of 4, which is a value that varies.

Both mutation-verified.
