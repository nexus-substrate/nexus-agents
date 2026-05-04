---
'nexus-agents': patch
---

Fix `DEFAULT_EXPERTS` missing 3 of 12 built-in expert types (#2341).

`BuiltInExpertType` declared 12 valid types (code, architecture, security, documentation, testing, devops, research, pm, ux, infrastructure, qa, data-visualization), but `DEFAULT_EXPERTS` only listed 9. Calls to `createDefaultRegistry()` silently omitted research, qa, and data-visualization experts. Added the three missing entries plus a contract test that walks every `BuiltInExpertType` literal and asserts a matching `DEFAULT_EXPERTS` row exists.
