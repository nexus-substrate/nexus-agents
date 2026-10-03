---
'nexus-agents': patch
---

Vote records now carry `voters[].servedModel`: the model the adapter reported serving that seat, beside `model` (the one requested). The field is written only when the adapter reported a model; it is never copied from `model`. It is covered by the record hash, so editing it on disk fails verification. A reported value the reader would reject (empty, over 200 characters, or outside `[A-Za-z0-9._:/@+-]`) is left out with a warning, and the rest of the record is still written. Readers from before the reader-first change cannot parse records that carry the field.
