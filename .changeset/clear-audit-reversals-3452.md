---
'nexus-agents': patch
---

fix(tune): audit routing reversals on TuneAdjustmentStore.clear() (#3452)

`clear()` dropped all active demotions — a routing-state restore — without
emitting `onReversal`, so a bulk clear left no `tune.reversal` audit entry. It now
emits a `cleared`-cause reversal for each active adjustment before dropping it, so
the "every routing mutation is on the immutable audit chain" invariant
(#3323 criterion 1) holds unconditionally, not just for decay/supersede. `clear()`
is currently test-only, so this is hardening against a future production reset
path rather than a live gap.
