---
'nexus-agents': minor
---

Outcome rows written by the dev pipeline stages, `orchestrate` workers and `consensus_vote` seats now record the model that served the call and what it cost. Before, these rows held only a marker in `model` (`pipeline`, `worker-<role>`, `consensus`), and the served model was visible only in the usage log.

- **New optional `TaskOutcome` fields.** `servedModel` is the model id the adapter reported. `costUsd` is present only when a price was found. `priceBasis` is `'list'` when a rate was found and `'unknown'` when a lookup found none. An absent `costUsd` means the cost is unknown, never $0. When the adapter reported no token usage, no lookup is made and `priceBasis` is absent too.
- **Priced like the usage log.** A call a gateway served is priced by that gateway's `NEXUS_GATEWAY_COST` declaration, and an undeclared gateway is recorded as unpriced. Every other call is priced at the registry rate for the served model. The `consensus_vote` cost rollup now makes this choice through the same helper.
- **`model` is unchanged.** The weather report and the `orchestrate` learnings group rows by these markers, so they stay as they are. Distiller eligibility, LinUCB warm start and the weather report read the same fields as before. Rows written without a served model are unchanged byte for byte.
- **`CliResponse.gatewayArm` and `ExpertBridgeResult.gatewayArm`** (new, optional) name the gateway arm that served a response, when a gateway model answered it.
