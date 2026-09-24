---
'nexus-agents': minor
---

The MCP server's default model adapter (`resolveDefaultModelAdapter` in `cli-server-gateway.ts`) now resolves using `resolveGatewayDefault` when a gateway catalogue is registered, rather than returning the first model in arbitrary gateway listing order. When a catalogue is registered, it picks the top-ranked chat model across families (or `NEXUS_CUSTOM_MODEL` when present in the catalogue), aligning MCP server startup with the registry default. When no catalogue is registered, it falls back to the primary gateway adapter or registry default as before.
