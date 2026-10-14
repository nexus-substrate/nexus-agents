---
'nexus-agents': patch
---

Remove the data-directory initializer's runtime import cycle through doctor and the MCP server by sharing its unchanged directory inventory from the canonical data-directory resolver. Preserve the doctor and CLI exports, directory paths, and permissions.
