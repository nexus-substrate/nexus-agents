---
'nexus-agents': patch
---

Run the Codex read-only sandbox preflight asynchronously so the first Codex call does not block the MCP server event loop while other voter seats are running. Concurrent callers share one process-lifetime probe promise, and both Codex transports await its verdict before initialization. The sandbox command, timeout limits, failure classification, and host-unavailable refusal message remain unchanged; healthy or unknown probes continue to allow execution.
