---
'nexus-agents': patch
---

The `api:custom-openai` routing arm is now priced at the model it actually sends. In gateway mode that arm sends the gateway's ranked default model, which is not `NEXUS_CUSTOM_MODEL` when the catalogue does not list it. Under `NEXUS_GATEWAY_COST=priced` the budget filter and the task-class cost ceiling priced the arm at `NEXUS_CUSTOM_MODEL`'s registry rate anyway. They now use the model the arm sends. When the registry has no price for that model, the arm is unpriced and fails closed, and the reason names the model.

Removed four internal helpers that nothing called: `tryWireGatewayAdapter` (use `tryWireGatewayAdapters`), `getAvailableAdapters`, `createOpenCodeAdapter` (use `new OpenCodeCliAdapter()`), and the unused `cli-adapters` response cache (`InMemoryResponseCache`, `createResponseCache`, `withCache` and their types). None of them was part of the published API surface.
