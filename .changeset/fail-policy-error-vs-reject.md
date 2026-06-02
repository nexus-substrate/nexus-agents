---
'nexus-agents': minor
---

fix(consensus): higher_order no longer fail-closes on a single voter error (#3138, #3304)

`getDefaultErrorPolicy` now returns `fail_closed` only for `unanimous` (where a
missing voter genuinely breaks the guarantee). `higher_order` and its
`opinion_wise` alias default to `reduce_denominator`: Bayesian/weighted
aggregation over the non-error voters is well-defined, so one voter's infra
timeout (e.g. the slow Security voter's adapter transport) no longer voids an
otherwise-unanimous result. The >50% `ERROR_FLOOR_FRACTION` hard floor still
voids any vote where most voters errored. Callers can still pass an explicit
`errorPolicy` override.
