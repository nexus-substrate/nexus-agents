---
'nexus-agents': minor
---

Dynamic API endpoints can now be registered and health-tracked as their own arm (#4392 increment 1). Shipped ADDITIVELY per the #6290 follow-up panel: NO published id type or reader type widens in this release. `ApiVendor`, `ApiArmId` (`api:anthropic` | `api:openai` | `api:google` | `api:custom-openai`), `RoutingArmId`, the persisted `OutcomeCli` union and its Zod schema are byte-identical to 8.x, and `ApiVendor` is not deprecated. The union of endpoint ids into `RoutingArmId` / `OutcomeCli`, and the removal of the `CliName`-typed readers, are batched for 9.0 in #6291 — until then an endpoint arm cannot enter an outcome record.

What is added:

- `EndpointArmId = api:<endpoint>` — a SEPARATE type over a validated endpoint identity (lowercase alphanumerics plus `.`, `_`, `-`; 1–64 chars; no `:`, `/`, `@` or whitespace, so a base URL or credential can never become an arm id). `isEndpointArmId()` is its runtime guard; every existing `ApiArmId` literal passes it. `isCliName()` is the runtime guard for the four CLI slots.
- `ObservedArmId = RoutingArmId | EndpointArmId` — the arm type the breaker and adapter registries observe. `observedArmDisplaySlot()` maps any observed arm to its `CliName` display slot; an endpoint it does not know collapses to `opencode` explicitly. `routingArmDisplaySlot()` is unchanged.
- `CircuitBreakerRegistry` gains `getArmBreaker()`, `isArmOpen()`, `resetArm()`, `getAllArmSnapshots()`, `getHealthyArms()`, `getUnhealthyArms()`, all typed over `ObservedArmId`. The existing `CliName`-typed methods keep their exact signatures and are now filtered views over the same arm-keyed map: a registered `api:*` arm appears in the `*Arms` readers and never in `getHealthyClis()` / `getUnhealthyClis()` / `getAllSnapshots()`.
- `CircuitStateChangeEvent` and `CircuitError` gain `armId: ObservedArmId`; `cliName` keeps its `CliName` type and is the display slot of `armId`. The `CircuitError` constructor still accepts the 8.x option shape — `armId` is an optional option that defaults to `cliName`. The breaker is the only producer of `CircuitStateChangeEvent` in tree; a listener that constructs one by hand must now supply `armId`.
- `RegistrySnapshot` gains `cachedArms: ObservedArmId[]` (every cached arm); `cachedAdapters` keeps its `CliName[]` type and lists the CLI slots only.
- `UnifiedAdapterRegistry` gains `registerApiArm(arm: EndpointArmId, adapter)` and `getAdapterForArm(arm: ObservedArmId)`; an `api:*` arm is never synthesised, only returned when registered, and an id that fails the endpoint validator is refused at runtime.

No routing behaviour changes: `createAllAdapters()` mints exactly the same arm ids as before in both billing modes, and a compile-time test pins `ApiArmId` to its four literals until #6291 removes that pin deliberately.
