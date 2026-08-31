---
'nexus-agents': patch
---

docs(governance): split the adapter row into the two operations it conflated (#5191)

The canonical-paths table said adapter acquisition is `getGlobalRegistry()` and
"NOT `createAllAdapters()` in new code". A panel ratified 5/6 that this is wrong:
they answer different questions.

- **Acquire an adapter for a model or task** → `getGlobalRegistry()`. One
  resilient adapter with shared circuit-breaker state (#4330).
- **Build the CLI routing arm set** → `createAllAdapters()`. The router is the
  failover layer, so its arms must not be resilient-wrapped — wrapping would nest
  two failover mechanisms and let shared breaker state mark an arm unavailable
  without the router testing it. The registry also cannot serve it: it returns
  `IResilientAdapter`, not the `ICliAdapter` the router needs, and cannot express
  transport (#5211).

Also corrects the prose beneath the table, which cited this exact pair as its
example of a symbol-keyed table "blessing two entries for one question". That
example became wrong when the pair turned out to be two operations. It now
carries the more useful lesson: a 7-to-1 call-site count looked like drift and
was actually a wrong row, so when call sites keep disobeying a row, check the row
is asking one question before assuming the authors are wrong.

Governance-path change: requires owner ratification, not self-merge.
