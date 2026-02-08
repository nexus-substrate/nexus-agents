# ADR-0005: Unified Adapter Interface Boundary (Even If Transports Differ)

**Status:** Proposed
**Date:** 2026-02-08
**Deciders:** Architect, DevEx

---

## Context

The system has two adapter layers:

1. **API adapters** (`src/adapters/`) — Call model APIs directly via HTTP. Used by `ResilientAdapter`. Not routed by `CompositeRouter`.
2. **CLI adapters** (`src/cli-adapters/`) — Invoke model CLIs as subprocesses. Routed by `CompositeRouter`. Production primary.

Both ultimately serve the same purpose: send a prompt to a model, get a response. But they share no interface above the transport level. A consumer must know which layer it's using.

## Decision

**Define a unified `IModelAdapter` interface that both layers implement.** This does NOT merge the implementations — transports stay separate. It provides a common boundary for consumers.

```typescript
interface IModelAdapter {
  readonly id: string;
  readonly provider: string;
  readonly transport: 'api' | 'cli' | 'mcp';

  execute(request: ModelRequest): Promise<ModelResponse>;
  getModelInfo(): ModelInfo;
  isAvailable(): Promise<boolean>;
}
```

**V2 timeline:** This is a Phase 3+ consideration. Not part of MVP. The interface is defined now for future alignment. Actual implementation is deferred.

**Why now:** Plugins that call models (`nexus:cli-executor`, expert plugins) should program against `IModelAdapter`, not against specific adapter classes. This enables future transport swapping without plugin changes.

## Consequences

**Positive:**

- Plugins decouple from transport mechanism
- CompositeRouter could eventually route across both transport layers
- Testing: mock one interface instead of two

**Negative:**

- Another interface in a codebase with many interfaces
- Implementation deferred — risk of becoming stale before adoption

## Alternatives Considered

1. **Merge adapter layers now:** Rejected. Too large for V2 scope. Transport differences are real.
2. **Keep separate forever:** Rejected. The duplication (resilience logic in both layers) will compound.
3. **Deprecate API adapters entirely:** Considered. CLI adapters are the production path. But API adapters serve direct-integration use cases (embedding nexus-agents in a Node.js app without CLI tools installed).
