---
'nexus-agents': major
---

Remove the deprecated gateway environment aliases and pipeline event bridge in 10.0 ([#6291, B1](https://github.com/nexus-substrate/nexus-agents/issues/6291)).

`NEXUS_CUSTOM_API_BASE_URL` and `NEXUS_CUSTOM_API_KEY` no longer configure an adapter. Rename them to `NEXUS_OPENAI_COMPAT_URL` and `NEXUS_OPENAI_COMPAT_KEY`, respectively. Setting an old name is ignored and reported as an unknown variable by `validateNexusEnv`; normal startup environment validation warns about it. The canonical pair configures both the single-model `custom-openai` path and the gateway path (model discovery, in-process voter transport, and the `api:<endpoint>` arm). Both canonical values must be non-empty after trimming to enable the gateway path.

```diff
-export NEXUS_CUSTOM_API_BASE_URL="https://your-gateway.example.com/v1"
-export NEXUS_CUSTOM_API_KEY="your-gateway-key"
+export NEXUS_OPENAI_COMPAT_URL="https://your-gateway.example.com/v1"
+export NEXUS_OPENAI_COMPAT_KEY="your-gateway-key"
```

Other `NEXUS_CUSTOM_*` settings, including `NEXUS_CUSTOM_MODEL`, `NEXUS_CUSTOM_API_ALLOW_PRIVATE`, and `NEXUS_CUSTOM_API_SURFACE`, remain supported.

Remove `createEventBusBridge` and its bridge-only `EventBusBridgeOptions` and `PipelineBridgeResult` types from the pipeline exports. Subscribe directly through `IEventBus.subscribe(filter, handler)` and invoke the returned unsubscribe function during cleanup. An empty filter (`{}`) receives every pipeline event; use a typed filter to narrow the subscription. Handlers receive the full typed `PipelineEvent`, including `type` and `timestamp`, rather than a collaboration `DomainEvent` payload. The automatic `pipeline.*` topic forwarding and bridge forwarding counter are removed; there is no replacement bridge factory.

```diff
-import { createEventBusBridge } from 'nexus-agents';
+import type { IEventBus, PipelineEvent } from 'nexus-agents';

 // pipelineBus is the application's pipeline event bus.
-const bridge = createEventBusBridge({ source: pipelineBus });
+const source: IEventBus = pipelineBus;
+const unsubscribe = source.subscribe({}, (event: PipelineEvent) => {
+  handlePipelineEvent(event);
+});

 // During cleanup:
-bridge.dispose();
+unsubscribe();
```

The collaboration event bus, the MCP-to-observer bridge, and the `adapter.failover` signal subscription remain available. Widening outcome readers and `OutcomeCli` to routing arm IDs is outside this B1 change.
