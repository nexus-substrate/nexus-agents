---
'nexus-agents': minor
---

feat(security): add a per-action corroboration surface, making stages.corroboration readable (#5382)

`stages.corroboration` was declared in `firewall-types.ts` and read **nowhere**
in the pipeline. A caller could set it and setting it did nothing — the
"configuration flag that cannot change behaviour" defect epic #5281 exists to
fix, in its sharpest form: a consumer who set `corroboration: true` believed
they had a stage they did not have.

**The issue's stated fix does not work as written**, which is worth recording
rather than quietly working around. It asked to wire the stage to
`validateActionCorroboration`. But `validateCorroboration` takes an
`AgentAction`, while `process()` is input-shaped and constructs no action — it
sanitizes, classifies and labels untrusted content, and the action is decided
later by the consumer. There is nothing to pass the validator at the point the
stage would have run.

That is the same structural gap that makes #5380 not a drop-in `evaluatePolicy`
swap, and it reframes part of the epic: the firewall and the production policy
surface are not merely running _different numbers of checks_, they operate at
**different points in the lifecycle**.

So the flag is wired to a new per-action entry point, `validateAction(action)`.
That is also the shape #5383 needs — production validates corroboration per
action (`issue-triage.ts:391`), so those callers cannot migrate onto the
firewall unless it offers one.

**A disabled stage reports `evaluated: false`, never `satisfied: true`.**
Modelled as a discriminated union, so a caller cannot reach `satisfied` without
first narrowing on `evaluated` — "not checked" is structurally unable to
masquerade as "checked and fine". Since the stage defaults to `false`, that
unevaluated branch is the _common_ case, which is exactly where a silent
satisfied verdict would do the most damage.

Refusal is gated on the same `NEXUS_FIREWALL_POLICY` rollout mode: `off`
surfaces the failure, `audit` reports `wouldRefuse` without refusing, `enforce`
returns `POLICY_REFUSED`. The mode gates the response and never manufactures a
finding — `enforce` with corroboration disabled refuses nothing, and a
corroborated action is served under `enforce`. Both are tested, because "refuse
everything" would otherwise pass every attack-shaped assertion.

Mutation-tested: making a disabled stage report `satisfied` fails 2 tests. That
mutation also exposed **5 of my own assertions passing vacuously** behind
`if (!result.value.evaluated) return` — the discriminant is now asserted before
it is narrowed on, so the tests fail rather than skip.
