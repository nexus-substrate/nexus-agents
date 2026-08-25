---
'nexus-agents': patch
---

record a failed tool call as FAILED, so failedCount can be non-zero

`TaskStatus.FAILED` had exactly one occurrence in `src/` — the read in the stop
hook's session summary. Nothing wrote it, so `failedCount` was structurally
always 0 and an operator reviewing a session in which every tool errored saw
zero failures.

The error was already being detected on the line above the status that
contradicted it: `result: summarizeToolResponse(...)` returned `"Error: …"`
while `status:` was hardcoded `COMPLETED` in the same object literal.

`summarizeToolResponse` becomes `classifyToolResponse`, returning the status and
the summary together so "what counts as an error" stays in one place rather than
being duplicated at the call site.

Fixes #4842.
