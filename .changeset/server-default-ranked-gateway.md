---
'nexus-agents': patch
---

The MCP server's default model adapter now follows the same ranked rule as the registry's unpinned default when a gateway catalogue is registered: `NEXUS_CUSTOM_MODEL` when the catalogue lists it, otherwise the highest-tier family model. Before, the server took the first model in the gateway's listing order, so a gateway listing a mini model first made that mini the default for orchestrator and expert tools while the registry default named a flagship. With no gateway, or a catalogue with no chat model, behaviour is unchanged.
