---
'nexus-agents': patch
---

The aorchestra prior-wave context block now says which worker results the
context budget left out (#5956). Both budget guards in `cross-wave-context.ts`
— the per-block cap on successes and the remaining-budget cap on the failed-
worker list — used to `break` out of their loop with no marker, no count and no
log, under a header reading "The following results were produced by prior wave
workers". A downstream worker could not tell its context was partial. The block
now ends with a notice naming the omitted roles, and a `logger.warn` records
them; a block that omits nothing is unchanged.
