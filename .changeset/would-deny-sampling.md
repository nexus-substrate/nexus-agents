---
'nexus-agents': patch
---

fix(audit): sample repeated warn-mode near-misses so the chain cannot grow unbounded

Answers the review dissent on the `would_deny` change. #4991 makes a warn-mode
near-miss durable, which is what #4988's enforce decision needs to read — but in
warn mode the call _proceeds_, so an agent looping against the same rule wrote
one chain record per iteration. A real `deny` halts the call and is
self-limiting; a near-miss is not.

Both obvious remedies fail, and the shape here is chosen because they do:

- **Suppressing silently** reproduces the very defect #4991 fixed — the chain
  would again under-report what happened.
- **Time-windowing** loses the trailing count. A loop that fires ten thousand
  times and then stops leaves its final window unreported, because the emit that
  would have carried the count never arrives.

So near-misses are sampled on **occurrence**, not time: the 1st, 2nd, 4th, 8th …
of each `{tool, rule}` pair, with every written record naming its own ordinal.
Three properties follow:

1. **The first is always recorded** — a near-miss is never invisible, which is
   the property #4991 exists to provide.
2. **Growth is logarithmic** — ten thousand occurrences produce fourteen
   records.
3. **No trailing loss** — the last record written establishes "fired at least N
   times" with no later flush needed, which is what ruled out time-windowing.

`deny` is never sampled. Dropping one would lose the record of an action that
was actually blocked, and it is already self-limiting.

The key is `{tool, rule}`, not tool alone, so a noisy rule cannot suppress a
different rule's first occurrence on the same tool. The counter map is bounded
at 500 pairs and clears wholesale on overflow — the ordinals are a floor
("at least N"), so a reset understates rather than fabricating.

The ordinal rides in the existing `reason` string rather than a new field:
widening the audit record again would be a second breaking change for something
prose already carries.

`policy-audit-emit.ts` is split out of `secure-handler.ts`, which the added code
pushed past its line cap; the two functions are one concern.
