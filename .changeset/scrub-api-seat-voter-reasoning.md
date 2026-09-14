---
'nexus-agents': patch
---

Voter reasoning from seats routed to an API adapter (OpenAI-compatible gateway, OpenRouter, SDK, Claude) now has API-key-shaped tokens replaced with `[REDACTED_KEY]` before it becomes the `reasoning` of a vote record, matching what CLI subprocess seats already did. A voter that quotes a key from the artifact it reviewed no longer writes it verbatim into `governance/vote-records.jsonl` (#6267). Already-scrubbed text is unchanged.
