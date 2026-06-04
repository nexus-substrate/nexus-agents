---
'nexus-agents': patch
---

Extend the security `AuditQuery` interface with post-mortem dimensions (#3197): `actionType` (PolicyGate/Corroboration events), `actor` (username on Trust/Reputation events), and `violationRule` (PolicyGate `violationRules` membership). These enable security forensics like "which Tier-3 events tripped RULE_OF_TWO?" and combine with the existing `trustTier`/`type`/time filters. The new filters narrow to events that actually carry the field (events lacking it are excluded). The original ask's `resource` and `policyName` were intentionally dropped — no `AuditEvent` records them, so those filters would be dead config; the policy-rule intent is served by `violationRule`.
