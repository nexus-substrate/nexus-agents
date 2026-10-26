---
'nexus-agents': patch
---

Reject interrupted AI SDK text, structured completions and streams as typed model errors. Preserve streamed partial output without emitting successful final stop markers. Fixes #7623.
