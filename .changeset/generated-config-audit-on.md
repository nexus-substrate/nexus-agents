---
'nexus-agents': patch
---

`config init` now writes an explicit `security.audit` block so a generated config has the tamper-evident audit chain on; the schema JSDoc states that the `enabled: true` default only applies when the block is present (#5632).
