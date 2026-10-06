---
'nexus-agents': patch
---

Deprecate the CLI-slot circuit readers and cache snapshot field ahead of removal in 10.0 (#6291). Use the existing arm-typed replacements, which include CLI slots and `api:*` arms:

- `getHealthyClis()` → `getHealthyArms()`
- `getUnhealthyClis()` → `getUnhealthyArms()`
- `getAllSnapshots()` → `getAllArmSnapshots()`
- `RegistrySnapshot.cachedAdapters` → `RegistrySnapshot.cachedArms`

The deprecated `createEventBusBridge` and its `EventBusBridgeOptions` / `PipelineBridgeResult` types are also scheduled for removal in 10.0. No replacement forwarding factory exists; subscribe to the pipeline EventBus directly via `IEventBus.subscribe(filter, handler)`.

All existing exports, signatures, and runtime behavior remain unchanged. The internal CLI snapshot reader now uses `getAllArmSnapshots().get(cliName)`.
