---
'nexus-agents': minor
---

When firewall sanitization is disabled, preserve author trust classifications by setting passthrough `trustTier` to the role-derived base tier and disclosing that it was not content-measured with `contentTierMeasured: false`; #5517 tracks making unmeasured tiers absent in the next major.
