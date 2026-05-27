---
'nexus-agents': patch
---

**security(deps):** bump `brace-expansion` to ≥5.0.6 to patch CVE-2026-45149 (GHSA-jxxr-4gwj-5jf2).

Scorecard alert #85 (severity error, CVSS 6.5) flagged the existing pnpm override `brace-expansion@>=4.0.0 <5.0.5: '>=5.0.5'` as still permitting the vulnerable `5.0.5`. The CVE is a DoS — `max` option protection is defeated by large numeric ranges like `{1..10000000}`, generating all 10M intermediate elements (~505 MB allocation) before the cap is applied.

Override tightened to `brace-expansion@>=4.0.0 <5.0.6: '>=5.0.6'`. Verified: `pnpm install` removes all `5.0.5` entries from the lockfile; only `5.0.6` remains.

No app code change required — pnpm override forces the transitive resolution. Patch bump appropriate.
