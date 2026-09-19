---
'nexus-agents': patch
---

Refuse `custom-openai` as a gateway endpoint ID in `NEXUS_OPENAI_COMPAT_ENDPOINT` and validate endpoint keys in `NEXUS_GATEWAY_COST` (#6437). `custom-openai` is reserved for the single-model `NEXUS_CUSTOM_API_*` provider path (`api:custom-openai`); permitting it on the gateway path risked collisions where both mechanisms shared the same arm ID, circuit breaker, catalogue, and cost declarations. `parseGatewayCostEnv` now validates endpoint keys through `gatewayEndpointRejection` to reject vendor segments and `custom-openai`.
