---
'nexus-agents': major
---

BREAKING: worker dispatch now requires explicit access-mode evidence from the actual selected adapter. A previously usable custom content-only adapter without `supportsAccessMode` can now return `UNSUPPORTED` with zero worker completion attempts when no measured compatible alternative exists. The method remains optional for structural compatibility; direct `complete` and `stream` calls retain their existing contract.

Known incompatible selections no longer consume a completion slot when an eligible fallback exists; late unsupported refusals do not repeat through refinement. Unknown support remains distinct from explicit `false`. Completion budgets, native permissions, and the final enforcement checks are unchanged. Concrete built-in API subclasses must declare their own behavior and may return `false`.

Migration: forward the query from the actual transport rather than asserting blanket `true`. These before/after wrappers retain the transport's normal completion behavior. The after wrapper preserves unknown support when the transport has no query; it does not make an unsupported transport eligible.

Before:

```typescript
import type { IModelAdapter } from 'nexus-agents';

export function wrapTransport(transport: IModelAdapter): IModelAdapter {
  return {
    get providerId() {
      return transport.providerId;
    },
    get modelId() {
      return transport.modelId;
    },
    get capabilities() {
      return transport.capabilities;
    },
    complete: (request) => transport.complete(request),
    stream: (request) => transport.stream(request),
    countTokens: (text) => transport.countTokens(text),
    validateConfig: () => transport.validateConfig(),
  };
}
```

After:

```typescript
import type { IModelAdapter } from 'nexus-agents';

export function wrapTransport(transport: IModelAdapter): IModelAdapter {
  return {
    get providerId() {
      return transport.providerId;
    },
    get modelId() {
      return transport.modelId;
    },
    get capabilities() {
      return transport.capabilities;
    },
    complete: (request) => transport.complete(request),
    stream: (request) => transport.stream(request),
    countTokens: (text) => transport.countTokens(text),
    validateConfig: () => transport.validateConfig(),
    supportsAccessMode: (mode, signal) =>
      transport.supportsAccessMode?.(mode, signal) ?? Promise.resolve(undefined),
  };
}
```

See `docs/interfaces/model-adapter.md` for the worker eligibility and subclass contract. A custom transport must implement truthful enforcement evidence before forwarding can return support; neither the wrapper nor the query grants host permissions.
