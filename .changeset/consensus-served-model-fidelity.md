---
'nexus-agents': minor
---

fix(consensus): record the model that answered a vote, and count seats whose model never resolved (#6660).

- Consensus outcome rows now take `servedModel` and its cost from the model the adapter reported answering, not the alias the seat requested. A seat whose CLI fell back to another model (for example claude after an out-of-credits response) used to be named and priced as the requested model. `AgentVoteResult` gains an optional `servedModel` field carrying that reported model.
- `PanelDiversity` gains an optional `unresolvedSeats` count: answering seats whose model never resolved, which no other count included. `panelDiversityOf` always sets it, and the models line prints it, e.g. `Models: 1 distinct, 1 family (6 seats unresolved), 0 fallbacks`.
- `priceBasis` has no `declared` member yet, because adding one would be a breaking change to published types (#6664). A rate declared in `NEXUS_GATEWAY_COST` is still labelled `'list'`. The mapping for each declaration form is documented in `core/price-basis.ts`.
