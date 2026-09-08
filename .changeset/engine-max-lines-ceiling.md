---
'nexus-agents': patch
---

Replace `eslint-disable max-lines` in the consensus engine with an enforceable ceiling (#5766)

`consensus/engine.ts` opened with a blanket `/* eslint-disable max-lines */` and
a hand-written note about how long the file was. The note said 711 lines and
concluded the file "sits well past" the "400-600 lines if cohesive" band in
`.rules/governance.md:67`.

It does not. 711 was `wc -l`; the rule counts with `skipBlankLines` and
`skipComments`, and by that measure the file is **499** — inside the band its
own justification cites. Two numbers in different units, compared as if they
were the same.

The blanket disable is why that went unnoticed: it silenced the one check that
knows the real count, leaving a hand-maintained comment as the only record, and
that number drifted 426 → 711 → 715 without anything failing.

Now bounded at 600 — the top of the governance band — so the file is measured
against the same band it invokes, and growing out of it fails the build. No
behaviour change; the engine is untouched.
