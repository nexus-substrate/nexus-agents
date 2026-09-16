---
'nexus-agents': patch
---

The `registry_import` MCP tool is now annotated `readOnlyHint: true`. Its manifest entry declared `readOnlyHint: false` while its own idempotency basis said the tool never persists — both could not be true (#6295). The tool derives a draft `ModelCapability` entry from its input and the in-memory registry and writes nothing, so the policy firewall's mutation rule (which reads `readOnlyHint` since #5114) no longer classifies it as a mutation, and the MCP_PROTOCOL annotations table no longer claims it reaches a vendor (`openWorldHint` is false).
