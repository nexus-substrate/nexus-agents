---
'nexus-agents': patch
---

fix(routing): validate a serialized store before clearing the live one

`RoutingContextStore.fromJSON` did `JSON.parse(json) as SerializedStoreData` and
then called `this.clear()` **before inspecting any field**. A payload that was
JSON but not a store therefore destroyed the existing store and returned a clean
`INVALID_DATA` — an error a caller reads as "nothing happened". Confirmed by
test: a store holding one preference was left holding none.

The envelope is now validated first, so a bad payload leaves the store
untouched. Two consequences of the old order are fixed together:

- `cacheHits`/`cacheMisses` were assigned straight onto the instance, so a
  string survived and turned the next `this.cacheHits++` into concatenation.
  They are now required to be numbers.
- When the envelope is well-formed but an element is not, the store _has_
  already been cleared by the time loading throws. The error message now says
  so rather than implying the previous contents survived.

The schema validates the envelope only — the eight top-level containers and the
two counters — and the loaders still own element shapes. Duplicating the six
nested record types would be a second definition of shapes that already have
one. The split is deliberate: the envelope is what decides whether it is safe to
clear, so that is what must be checked first.

Note this path has no in-tree caller outside its tests; `fromJSON` is public API
reached only by an external embedder. The defect is real but latent.
