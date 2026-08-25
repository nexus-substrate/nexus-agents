---
'nexus-agents': patch
---

stop an undated research source scoring as well as a fresh one

`NEUTRAL_RECENCY` is 0.5, chosen when recency decayed linearly — where 0.5 was
the one-year point, comfortably mid-range. Switching to exponential decay moved
0.5 to the two-year point without moving the constant, so a source with **no
publication date at all** scored exactly as well as a real one-year-old source:
0.28 composite for both.

An unmeasured recency is now excluded from the composite and the remaining
weights renormalised, rather than filled in with a default. The undated source
is judged on its measured dimensions — neither credited for freshness it has
not demonstrated nor punished for a date nobody recorded.

This also gives `recencyMeasured` its first reader. The flag was added so a
consumer could tell a measurement from a default, and until now nothing read
it: two occurrences in the tree, both in the file that produces it.
