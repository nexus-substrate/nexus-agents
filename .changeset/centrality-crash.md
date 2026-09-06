---
'nexus-agents': patch
---

Degree centrality is a fraction again, and a progress bar no longer throws on an out-of-range value. `getDegreeCentrality` counted the edge list — one edge per interaction — against a denominator of distinct neighbour slots, so two agents talking three times scored 1.5. `renderBar` then computed a negative width and `'░'.repeat(-8)` threw a `RangeError` that killed the entire dashboard render. Centrality now counts distinct neighbours, and both bar renderers clamp.
