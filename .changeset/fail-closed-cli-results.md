---
'nexus-agents': minor
---

Use each CLI adapter's result parser as the single authority for success. OpenCode plaintext output, unrecognized event streams, missing terminal reasons, and `content-filter`, `error`, `tool-calls`, `other`, `unknown`, or unrecognized finish reasons now fail closed. `stop` succeeds; `length` succeeds only when text was produced. Apply the same terminal checks to legacy OpenCode events. Codex deterministic terminal failures now report the CLI's error message with a specific classification instead of a parse error and retry. Reject agy output without its explicit success marker, including output previously accepted by the shared plaintext fallback.
