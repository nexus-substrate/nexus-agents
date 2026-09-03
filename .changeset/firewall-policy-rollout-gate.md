---
'nexus-agents': minor
---

feat(security): add the firewall policy rollout gate, defaulting to off (#5382)

First child of epic #5281, selected to go first by a 7-voter supermajority panel
(6 approve / 1 reject; leading option 4 of 6 approvers; the lone rejection argued
the gate binds more firmly than proposed, not less).

`HostileInputFirewall` is a **published** API — re-exported through
`src/exports/security.ts`, carried in `api-surface.txt`, pinned by an
export-contract test. Epic #5281 established it is not dead scaffolding but has
fallen _behind_ the hand-composed production path, and its sibling children
change what `process()` decides: #5380 raises one policy check to seven, #5381
makes reputation gating mode-aware. Landing either on a patch release would
change behaviour for consumers this repo cannot see.

`NEXUS_FIREWALL_POLICY` (`off` | `audit` | `enforce`, default **`off`**) is that
gate, also settable per instance via `FirewallConfig.policyMode` because the
firewall is a library and an embedding consumer should not need a process-wide
variable.

**The default is the feature.** Under `off`, behaviour is byte-identical to
before. The mutation test for this is the informative one: flipping the default
to `enforce` fails six tests, one of them a _pre-existing_ Rule-of-Two test —
direct evidence that a stricter default is a breaking change rather than an
assertion that it would be.

`audit` is what makes the rollout measurable. It computes whether `enforce`
would have refused and reports it as `wouldRefuse` while still allowing the
input through, so the impact of a flip can be sized before flipping. Without
that field `audit` would be indistinguishable from `off`, which is the
"configuration flag that cannot change behaviour" defect this epic exists to fix.

The gate ships **with its consumer**, deliberately. A flag with no reader would
reproduce exactly the `stages.corroboration` defect (#5382's other half) —
declared in the type, never read by the pipeline. So the fail-closed refusal
lands with it: under `enforce`, a blocking Rule-of-Two violation returns
`POLICY_REFUSED` instead of an `ok()` result carrying a signal a caller checking
only `result.ok` would walk straight past.

The mode gates the _response_, never the detection: `enforce` with
`policyEnforcement` disabled still refuses nothing, and an allowlisted
maintainer with write+secret access is still served under `enforce` — tested,
because "refuse everything" would otherwise pass every attack-shaped assertion.

Not a new mechanism: this is the third flag of this exact shape, after
`NEXUS_ACCESS_POLICY_MODE` (#1977) and `NEXUS_REPUTATION_GATING` (#3122), and it
delegates to the shared `resolveEnvMode` helper (#3130) so all three coerce a
typo identically — to the default, with one warning, never throwing.

**Semver note, flagged rather than buried.** Classified `minor`: the new symbols
and the two `FirewallConfig` fields are additive and optional, and behaviour is
unchanged by default. The one thing a reader could trip on is that
`FirewallErrorCode` gains `POLICY_REFUSED` — a consumer exhaustively switching on
that union with no `default:` case would no longer compile. The api-surface gate
flags a widened union as breaking-for-readers and explicitly declines to
classify; recording the call here so it is reviewable rather than implicit.

**Deliberately NOT in this change:** wiring `stages.corroboration`.
`validateCorroboration` takes an `AgentAction`, while `process()` is input-shaped
and constructs no action, so #5382's "wire the stage to `validateActionCorroboration`"
is not directly possible — the same structural gap that makes #5380 not a
drop-in `evaluatePolicy` swap. That needs a design decision (add a per-action
surface, or delete the flag) and is recorded on the issue rather than guessed at.
