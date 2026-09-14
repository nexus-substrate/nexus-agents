---
'nexus-agents': minor
---

Routing arm ids can now carry an endpoint identity (#4392 increment 1), shipped ADDITIVELY per the #6290 breaking-change panel: nothing exported is removed and no reader-facing signature widens; the removals are batched for 9.0 in #6291.

- `ApiArmId` is `api:<endpoint>` over a validated segment (lowercase alphanumerics plus `.`, `_`, `-`; 1–64 chars; no `:`, `/`, `@` or whitespace, so a base URL or credential can never become an arm id). The four existing ids (`api:anthropic`, `api:openai`, `api:google`, `api:custom-openai`) are unchanged and previously persisted outcome records keep parsing. New `isApiArmId()` and `isCliName()` runtime guards. `routingArmDisplaySlot()` collapses an `api:*` arm it does not recognise to the `opencode` slot explicitly instead of returning the raw id.
- `ApiVendor` stays exported as a `@deprecated` alias of the new `BuiltInApiVendor` (the same four literals), so every existing binding still compiles and still narrows the template.
- `CircuitBreakerRegistry` gains arm-typed `getArmBreaker()`, `isArmOpen()`, `resetArm()`, `getAllArmSnapshots()`, `getHealthyArms()`, `getUnhealthyArms()`. The existing `CliName`-typed methods keep their signatures and are now filtered views over the same arm-keyed map: a registered `api:*` arm is reported by `getHealthyArms()` / `getUnhealthyArms()` / `getAllArmSnapshots()` and never by `getHealthyClis()` / `getUnhealthyClis()` / `getAllSnapshots()`.
- `CircuitStateChangeEvent` and `CircuitError` gain `armId: RoutingArmId`; `cliName` keeps its `CliName` type and is always `routingArmDisplaySlot(armId)`. `CircuitError`'s constructor options take `armId` instead of `cliName` (the breaker is the only constructor in tree).
- `RegistrySnapshot` gains `cachedArms: RoutingArmId[]` (every cached arm); `cachedAdapters` keeps its `CliName[]` type and lists the CLI slots only.
- `UnifiedAdapterRegistry` gains `registerApiArm()` / `getAdapterForArm()`; an `api:*` arm is never synthesised, only returned when registered.

No routing behaviour changes: `createAllAdapters()` mints exactly the same arm ids as before in both billing modes.
