---
'nexus-agents': patch
---

fix(learning): an unmeasured run no longer earns a maximal routing reward

`Math.min(1, targetTokenUsage / outcome.tokenUsage)` with `tokenUsage: 0` is
`Math.min(1, Infinity)` — which is `1`, the full efficiency bonus. The only
production caller passes `tokenUsage: 0` deliberately, because
`delegate-to-model` recommends rather than executes and genuinely has no token
count. So every routed decision collected a maximal efficiency bonus, and
`efficiencyWeight` was a tuning knob attached to a constant.

`durationMs` has identical arithmetic and the same trap, so both now go through
one helper that names the empty case: a non-positive or non-finite measurement
earns zero, not everything. Zero is the conservative direction — an unmeasured
run earns nothing rather than out-scoring a measured one.

This is the vacuous-pass shape in arithmetic rather than in a boolean: a
missing measurement entering an expression as the best possible value.
