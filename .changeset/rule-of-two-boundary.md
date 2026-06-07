---
'nexus-agents': patch
---

feat(capability-loop): Rule-of-Two capability boundary primitives for auto-remediation (#3613)

Condition 2 (the load-bearing security hole) of the #3540 auto-invoke gate;
design ratified 7/7. Ships the fail-closed boundary primitives:

- a typed phase machine (`PHASE_CAPABILITIES`) where RESEARCH holds
  {untrusted-input, secrets} (no write) and IMPLEMENT holds {repo-write, secrets}
  (no fresh untrusted input) — neither phase holds all three Rule-of-Two legs;
- `CapabilityLedger.assertCapability`, a fail-closed chokepoint guard that throws
  `RuleOfTwoViolation` if a capability isn't granted by the active phase (and
  denies everything before any phase is entered);
- a strict typed `RemediationPlanSchema` (`.strict()`, allowlisted action kinds,
  bounded inert fields) — the ONLY artifact allowed across RESEARCH→IMPLEMENT, so
  untrusted content can't smuggle into the write-capable phase.

The enforce capstone (#3618) wires these at every chokepoint, physically
surrenders capabilities at the boundary (per-phase adapter lifecycle), and
reconciles with ClawGuard; OS process isolation is tracked follow-up.
