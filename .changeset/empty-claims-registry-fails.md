---
'nexus-agents': patch
---

`verifyClaims` no longer passes an empty claims registry. A `ClaimsRegistry` with zero claims used to verify as `passed: true` (`[].every(...)` is `true`); it now returns `passed: false` with a new optional `VerifyReport.unmeasured` string naming the reason (`registry holds 0 claims — nothing was verified`), and `pnpm claims:check` prints that reason instead of `0 of 0 claims drifted`. A registry with at least one claim is reported exactly as before and `unmeasured` is absent. The YAML loader already rejected an empty list; this closes the same gap for callers that build the registry object themselves (#4586).
