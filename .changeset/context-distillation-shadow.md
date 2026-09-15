---
'nexus-agents': patch
---

Wire `context-distillation` into the prior-wave context path, shadow-first
(#5974, item 1 of #5771). `buildPriorWaveContextBlock` still emits exactly what
it emitted before — per-worker truncation decides what a downstream worker
receives. Alongside it, distillation now runs on the same sanitized output and a
`Prior-wave distillation shadow (#5974)` record is logged at info: per worker,
the sanitized / truncated / distilled sizes, both compression ratios, pattern
hits per category, and whether no pattern matched (the case where distillation
would degenerate to a 200-char head and the candidate falls back to
truncation); per block, how many predecessors truncation kept under the 6000-char
budget versus how many distillation would have kept. That last pair is the flip
criterion the panel set. The module and the pure `shadowDistillPriorWave` are
now exported from the `orchestration/aorchestra` barrel.
