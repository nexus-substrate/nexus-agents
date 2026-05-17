---
'nexus-agents': patch
---

**Closes one bullet of #2824.** fix(routing): cold-start LinUCB warmStart ingests e2e-eval outcomes

`CompositeRouter.initializeLinucbBandit` has two `getOutcomeStore().query()` paths:

- 30-day lookback (composite-router.ts:353) — already filters `excludeQualitySignals: ['e2e-eval']` to keep synthetic test outcomes out of the routing learner
- Cold-start fallback (composite-router.ts:374) — pre-fix queried with **no filter**, replaying any e2e-eval outcomes that survived from prior test runs into LinUCB

The cold-start path activated on fresh checkouts against an existing `nexus-data/` directory, or after restarts where the 30-day window happened to be empty. A handful of e2e-eval rows could measurably skew early routing decisions.

One-line fix: mirror the 30-day filter on line 374. No new tests — existing 248 composite-router tests still pass.
