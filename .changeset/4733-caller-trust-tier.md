---
'nexus-agents': minor
---

Pipeline stage-entry events now expose `callerTrustTier` for caller authentication, reporting `unmeasured` when no caller information is available. The new `inputSanitization` field records `unmeasured`, `unmodified`, or `modified`; modified observations include `inputSanitizationCounts` with tags removed, comments removed, and fields modified. These observations describe sanitizer changes to the handler input. The existing `trustTier` field is deprecated for removal in the next major and continues to carry the same caller-authentication value.
