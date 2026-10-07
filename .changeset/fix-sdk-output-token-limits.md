---
'nexus-agents': patch
---

Fix ignored output-token limits in AI SDK adapters. Requests with `maxTokens` now pass the limit as `maxOutputTokens` to the SDK for text completions, structured completions, and streaming.
