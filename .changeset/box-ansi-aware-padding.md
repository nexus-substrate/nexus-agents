---
'nexus-agents': patch
---

measure box padding in display columns, not bytes

`boxLine` padded with `String.prototype.length`, which counts ANSI escape
bytes — an escape occupies zero columns — so every coloured line was padded
short by however many escapes it happened to contain and its right border
landed in the wrong place. Three call sites in the routing audit had grown
hand-tuned `BOX_WIDTH + 8` / `+ 11` / `+ 7` compensations, each correct only
for that line's exact colours and all of them over-padding under `NO_COLOR`.

`visibleWidth` strips SGR escapes before measuring, and the five fudge factors
are gone.

One line overflowed for a different reason: the task-analysis summary is a
single pipe-joined string that reached 78 display columns in a 63-column box.
No padding scheme fixes content that does not fit, so `formatTaskAnalysis`
wraps it on the `|` separators. A single segment wider than the box is still
emitted whole and still overflows — visibly, rather than silently truncated.

The regression test that found these now covers the whole rendered report
rather than one section.
