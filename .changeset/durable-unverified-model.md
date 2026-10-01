---
'nexus-agents': minor
---

Record gateway model verification in adapter selection, resilient adapter health, and per-call usage rows. `modelVerified: true` means discovery matched the selected model; `false` means discovery failed and the configured model was sent unverified. An absent field means verification was not measured, including non-gateway adapters and legacy rows. An SDK transport using deprecated configuration stays unmeasured even when a separate gateway has a discovered catalogue.

Reuse gateway usage recording for the single-model SDK fallback so both successful calls with reported usage and failed calls leave durable verification evidence. Streaming and successful calls without reported token usage retain the existing recording limits. Malformed verification metadata is dropped without discarding valid spend history. The optional fields on exported types are an additive minor API change.

The single-model custom-openai SDK fallback is now always a gateway-priced call: with or without measured verification, its usage and outcome cost come from the `NEXUS_GATEWAY_COST` declaration, as discovered gateway models already do. Previously it was priced at the model id's vendor list price. An undeclared gateway therefore records `priced: false` instead of a list-price figure.
