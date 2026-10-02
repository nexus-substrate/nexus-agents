---
'nexus-agents': patch
---

MCP clients no longer receive operator lifecycle events or debug heartbeats through `notifications/message`, and the server no longer advertises the Logging capability. These events now go through the existing logger to stderr in server mode, respecting log levels and secret redaction while keeping stdout reserved for JSON-RPC. Real `notifications/progress` heartbeats and existing trace/OTel telemetry remain available.

The server no longer advertises the MCP `logging` capability, so a client that calls `logging/setLevel` anyway now receives `-32601 Method not found`; spec-compliant clients check the capability first.
