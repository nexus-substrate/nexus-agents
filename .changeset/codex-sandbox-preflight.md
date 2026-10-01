---
'nexus-agents': patch
---

Check Codex's read-only filesystem sandbox before executing a CLI seat or routing arm. Hosts with a confirmed sandbox failure now return an attributed execution error before spending a model call, and `nexus-agents doctor` reports the cause as a warning. The model-free check runs once per process with a short timeout. Missing Codex, timeouts, and unrecognized probe failures are recorded as unknown; execution proceeds under the existing read-only sandbox without relaxing permissions. The verdict is cached for the process lifetime, so restart a running MCP server after repairing the host sandbox.
