---
'nexus-agents': minor
---

Implement provider × model catalog with gateway-reachability admission (#7072, epic #4391 increment C).

- Add SSRF URL validation, payload size ceiling (25 MiB), and strict schema validation for models.dev catalog sync.
- Preserve provider × model coverage in snapshot (`gatewaysByModel` and `entry.gateways`).
- Enforce gateway-reachability admission: admit models only if covered by a configured gateway's `serves()` or explicit pins, preventing catalog sprawl.
- Add `whichGatewaysServe(modelId)` helper to answer which configured gateways serve a model.
