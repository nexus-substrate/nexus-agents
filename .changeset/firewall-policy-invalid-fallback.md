---
'nexus-agents': patch
---

fix(security): an invalid `NEXUS_FIREWALL_POLICY` no longer disables the firewall

`resolveEnvMode` answers two different questions with one value. "What does
absence mean" and "what does a typo mean" both resolved to `fallback` — and for
this flag those answers should differ, because its fallback is the permissive
end:

```
NEXUS_REPUTATION_GATING=enfroce  ->  enforce   (default 'enforce', the STRICT mode)
NEXUS_FIREWALL_POLICY=enfroce    ->  off       (default 'off',     the PERMISSIVE mode)
```

Verified by execution, not inspection. An operator who typed `enfroce` on the
firewall flag got `off` — a firewall that refuses nothing — having explicitly
asked for enforcement. The same typo on the sibling flag lands on the strict
side. Same shared helper; the difference is only which fallback each caller
supplies.

The helper already _detected_ the case: it returns early and silently for
unset/empty, and warns for a non-empty value that fails to parse. It then
discarded the distinction it had just computed by returning the same value for
both.

`resolveEnvMode` now takes an optional `invalidFallback`, and the firewall
passes `audit`. Unset still resolves to `off` — unchanged, and deliberately so:
`off` is the right answer for "the operator has not opted in", argued in #5382
because `HostileInputFirewall` is a published API with unknown external callers.
A typo means the operator _did_ opt in and mistyped how.

`audit` rather than `enforce` because it reports without refusing, so it cannot
break an external caller any more than `off` can — and it emits the
`wouldRefuse` telemetry the rollout exists to collect, which `off` does not. A
config error that yields zero data is otherwise indistinguishable from a healthy
disabled deployment.

**Ratified by a 7-voter panel** at the supermajority bar, 5 of 6 approvers
(`higher_order`, live voters, record persisted). Two voters — security and the
contrarian — argued instead for throwing at startup. That was rejected on #3130,
which is explicit that a security layer must not crash the process on a
misconfiguration, and because turning a typo in a gradual-rollout flag into a
process that will not start is the wrong blast radius. The contrarian's better
point, recorded for whoever revisits this: `resolveEnvMode` would be cleaner
returning a discriminated union (valid / unset / invalid) and forcing callers to
handle the states, rather than taking a second fallback.

Guards against `invalidFallback` becoming a general escape hatch, all from the
panel:

- typed as the same `T` as `fallback`, so it can only select among the flag's
  own modes and can never introduce a fourth behaviour;
- defaults to `fallback`, so the two callers that do not opt in
  (`NEXUS_REPUTATION_GATING`, `NEXUS_ACCESS_POLICY_MODE`) are byte-identical —
  pinned by a regression test;
- a documented invariant, asserted as an ordering rather than a literal so it
  survives a future default change: the invalid path is **never more permissive
  than** the unset path. A typo may tighten the gate, never loosen it;
- a caller whose unset default is already the strictest mode has nothing to
  correct and should not pass it.

The warning now names the mode actually applied, not just "the default" — with
the two differing, a line saying "coercing to default" would name a value the
process did not use.

One existing test was **pinning the defect**: `firewall-policy-mode.test.ts`
asserted `.toBe('off')` for a typo and recorded it as correct behaviour. Updated,
with the reason inline.

Mutation-tested, each row separately: the firewall dropping its opt-in fails 2
tests, the resolver ignoring `invalidFallback` fails 4, and routing unset/empty
through it as well fails 4. Never throws, still, on any input.

The 5th parameter changes from a positional `logger` to an options object
(`{ logger?, invalidFallback? }`). `resolveEnvMode` is not part of the published
API surface — the one production call site that passed a logger did so through a
conditional spread, which the object replaces.
