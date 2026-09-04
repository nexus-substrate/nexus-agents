---
'nexus-agents': minor
---

fix(security): honour the reputation gating mode in the firewall, and make the reconciliation observable (#5381, #5405)

Two issues that could not be fixed apart.

## What #5381 reported

Production gates reputation demotions through
`gateWithReputation(…, resolveReputationGatingMode())` — honouring
`off`/`audit`/`enforce` and reporting `demotionSuppressed`. The firewall called
`reconcileTrustTier(...)` **unconditionally**, so with
`NEXUS_REPUTATION_GATING=audit` production gated on the classifier tier and
reported a suppressed demotion, while the firewall silently enforced the demoted
tier. Same input, same configuration, opposite behaviour — and `audit` was not
audit-only for anyone using the published firewall, which is the one promise that
mode exists to make.

Fixed: `resolveReputationGatingMode()` is threaded through, resolved once at
construction (a mid-run env change cannot make two inputs in a batch answer to
different policies), with an injectable `env` and an explicit per-instance
`reputationGatingMode` — the shape #5382 established for `policyMode`.

**These are two different knobs and conflating them would be a bug.**
`NEXUS_REPUTATION_GATING` defaults to `enforce`; `NEXUS_FIREWALL_POLICY` defaults
to `off`. Nesting reputation gating under the firewall's own gate would have left
the divergence in place and added a second one.

## What blocked it: the check could not fire

Writing the failing test first did not produce a failing test, and the reason is
the more serious finding.

The obvious fixture — `CONTRIBUTOR` plus an injection body, borrowed from the
existing #3106 test — does not exercise reputation at all. The **classifier**
assigns tier 4 on an injection body, so reconciliation has nothing left to
demote and all three modes agree. A sweep of 6 `authorAssociation` values × 5
body shapes found **zero** inputs where `audit` and `enforce` reach different
tiers.

Structurally: `runReputation` gives the reputation engine only
`authorAssociation` and `injectionFlags` — the same two inputs the classifier
already consumed — deliberately omitting account-age/contribution data the
firewall does not have. So reputation is never _stricter_ than the classifier,
and `reconcileTrustTier`, which returns the stricter of the two, returns the
classifier tier every time.

Mutation-tested rather than argued. Replacing the reconciliation with
`const effectiveTrustTier = trust.trustTier;`:

```
src/security/firewall/    6 files,    97 tests   — all pass
src/security/            63 files,  1588 tests   — all pass
```

**No test anywhere detected the removal of reputation reconciliation.** That
included `firewall-pipeline.test.ts`'s "demotes on a hostile signal", whose
assertion the classifier satisfies alone — it named reputation as the cause of a
demotion reputation did not cause. Renamed to state what it actually pins.

## The seam

`FirewallConfig.reputationAssessor` makes the assessment injectable, for the
reason `env` is already injectable there: _without it the path is unreachable in
production with every unit test still passing_. Tests present an assessment
stricter than the classifier (classifier 2, reputation 4 — input deliberately
different from expected output) and prove the reconciliation can fire.

Three mutations, each run separately because redundant fixes mask each other:

| mutation                                    | tests failed |
| ------------------------------------------- | ------------ |
| drop the reconciliation                     | 3            |
| ignore the configured mode                  | 4            |
| always emit the gate (drop the stage guard) | 1            |

Plus a tripwire pinning that classifier and reputation currently **agree** on a
hostile input, so when the account/activity fetch lands at the wiring layer and
they diverge, that test fails and forces this to be re-examined with real inputs
rather than silently changing behaviour.

## Absence stays distinguishable

`FirewallResult.reputationGate` is **optional and absent when the stage did not
run**. `ReputationGateDecision.demotionSuppressed` is a required boolean, so
surfacing it unconditionally would report `false` — "nothing was suppressed" —
for a check that never happened. The stage defaults to off, so that unevaluated
case is the common one.

## Not changed, and why

#5381 also asked that an unrecognised mode "fail closed rather than falling
through to `enforce`". For this knob `enforce` **is** the closed direction, and
`resolveEnvMode` coerces an invalid value to it with a `warn` — so a typo'd
`enfroce` already lands on the strictest behaviour, loudly. The never-throw
property is a deliberate decision (#3130) and the same helper backs
`NEXUS_ACCESS_POLICY_MODE` and `NEXUS_FIREWALL_POLICY`; changing it would have
altered two other flags to satisfy a criterion this one already meets.

No behaviour change at the default: `enforce` is the default mode, so an
unconfigured firewall reconciles exactly as before.
