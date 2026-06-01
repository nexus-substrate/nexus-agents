---
'nexus-agents': patch
---

feat(security): firewall policyEnforcement stage surfaces Rule-of-Two (#3198, #3144 P0)

The firewall's `policyEnforcement` stage was declared (default on) but never read — Rule-of-Two was only checked in `policy-gate`, not during firewall composition. `HostileInputFirewall.process()` now evaluates Rule-of-Two against the effective (reputation-reconciled) trust tier + the configured `context` (write/secret access) and **surfaces** a `ruleOfTwoViolation` on `FirewallResult` (signal-only — the firewall is a library; the consumer enforces; no hard block, so no breaking behavior). `checkRuleOfTwo` is exported from `policy-gate` to avoid duplicating the predicate. Tier-1/allowlisted authors are immune.
