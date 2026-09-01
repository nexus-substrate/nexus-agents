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

The ordinal is carried as a **typed, queryable field** (`policyOccurrence`) on
the audit record, alongside a human-readable note in `reason`.

The first version put it in `reason` alone, to avoid "a second schema widening".
Two reviewers rejected that and were right on both counts. A machine consumer
counting records would read 14 records as 14 near-misses when 10,000 occurred —
so the record did not structurally represent its own partial coverage, which is
the exact defect this PR exists to fix, reintroduced one field over. And the
stated justification did not hold: an **additive optional** field is a minor
change, not a second break, so nothing was being saved by omitting it.

`policy-audit-emit.ts` is split out of `secure-handler.ts`, which the added code
pushed past its line cap; the two functions are one concern.

**An executed near-miss is marked on its invocation record, always.** The review
raised the sharpest version of the sampling objection: a `would_deny` lets the
call _execute_, so sampling the policy record would leave the actions that
actually ran indistinguishable from calls no rule touched — restoring the
silent-allow inference this change exists to break.

Verified before acting: the action itself is never lost — `emitToolAudit` fires
unconditionally for every completed invocation. What was missing is that the
invocation record carried no policy annotation.

The two facts are now separated. The **policy** record carries the detail and is
sampled, because that is what grows. The **invocation** record carries
`policyDecision: 'would_deny'` on every single occurrence, because that is the
fact that must never be suppressed. Growth stays bounded — the flag rides on a
record emitted regardless — and no executed near-miss is ever falsely clean.

Only `would_deny` reaches an invocation record: a real `deny` returns before the
handler runs, so it produces none. `ToolInvocationAuditOpts.policyDecision` is
additive optional — minor, not a further break.
