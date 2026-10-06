---
'nexus-agents': major
---

Remove the deprecated CLI-only circuit-breaker readers and adapter-cache view in 10.0 (#6291 B2). Migrate to the existing arm readers, which include registered gateway endpoints:

```diff
-registry.getHealthyClis()
+registry.getHealthyArms()
-registry.getUnhealthyClis()
+registry.getUnhealthyArms()
-registry.getAllSnapshots()
+registry.getAllArmSnapshots()
-adapterRegistry.getSnapshot().cachedAdapters
+adapterRegistry.getSnapshot().cachedArms
```

`RoutingArmId` and `OutcomeCli` now include validated `EndpointArmId` gateway identities (`api:<endpoint>`). `CircuitStateChangeEvent.cliName`, `CircuitError.cliName`, and its constructor option now accept routing arm ids; breaker-produced events and errors carry the guarded arm id, matching `armId`. Consumers needing a CLI display slot should call `routingArmDisplaySlot(cliName)`. Built-in API vendor display mappings remain intact; other gateway arms display under `opencode`. `ApiVendor` remains the live vendor union.

The `cli:` log/event fields in `cli-circuit-breaker.ts` and `resilient-adapter.ts` now carry raw arm ids such as `api:<endpoint>` instead of the `opencode` display slot. Dashboards keyed on the four CLI names will see new labels; update their filters and grouping, or explicitly map arm ids through `routingArmDisplaySlot` for CLI-slot views.

`CircuitBreakerRegistry.getBreaker`, `isOpen`, and `reset` parameters intentionally remain `CliName`-typed. Use `getArmBreaker`, `isArmOpen`, and `resetArm` for gateway arm ids.

Persisted outcome compatibility: existing unversioned JSONL stores remain readable without migration, remapping, or rewriting user data. CLI slots, built-in API arms, and `unknown` retain their original attribution, and their histories continue feeding routing through LinUCB warm-start with unchanged arm statistics. Gateway outcomes persist and replay under their own endpoint ids. The widened schema reuses endpoint identity validation (1–64 lowercase alphanumeric, `.`, `_`, or `-` characters, starting alphanumeric), so URLs, userinfo, whitespace and malformed ids remain rejected.

Rollback hazard: a 9.x reader that predates #7146 rejects gateway outcome lines and drops them when it rewrites the store. Before running mixed versions against a shared store, upgrade 9.x to a release containing #7146; otherwise avoid rollback to a reader without that fix.
