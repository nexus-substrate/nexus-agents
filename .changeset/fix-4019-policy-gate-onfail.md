---
'nexus-agents': patch
---

Remove the inert `onFail` field from PolicyGateSpec (#4019)

`PolicyGateSpec.onFail` was a required field authorable as `block`/`warn`/`escalate`, but it was consumed nowhere — the gate's enforcement mode is resolved solely by the runtime bundle (`GatePolicyEnforcement.mode` / `NEXUS_POLICY_GATE_MODE`, warn-by-default per #3177). Authoring `onFail:'block'` gave a false sense of enforcement (it silently ran in warn). Removed the field (and the dead `ON_FAIL_ACTIONS` enum) so the contract can't promise enforcement the runtime won't deliver, with a JSDoc on the schema naming the real enforcement knob. Ratified 7/0 (higher_order). Zero runtime change (policy-evaluator behavior unchanged); the non-strict schema ignores a stray legacy `onFail` key, so external plans stay backward-compatible.
