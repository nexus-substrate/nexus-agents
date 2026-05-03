---
'nexus-agents': patch
---

README accuracy: hash-chained audit storage is shipped, not "in flight" (#2289 follow-up to second-pass audit).

- The `verify_audit_chain` MCP tool wraps `verifyChain()` over `FileAuditStorage`, both shipped since 2026-04-29 (PR #2289). README's two "(in flight)" qualifiers were stale; now describe the storage as available and point at the verification tool.
- Capability table's `pr_review` row was inconsistent with the lead bullet: PR #2332 added the 50% raw false-positive rate + n=10 + source link to the bullet but missed the table row. Both surfaces now agree.
