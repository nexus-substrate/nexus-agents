---
'nexus-agents': patch
---

**fix(adapters):** `withModelNotFoundFallbackResilient` no longer silently drops future methods on `T`. Closes #2945.

Pre-fix `Object.assign(wrapped, { 5 bound methods }) as unknown as T` silently dropped any methods on a concrete `T` (e.g. a future `IResilientAdapter` subtype with `getMetrics()`) beyond the 5 explicitly re-attached. The type system claimed they were present; callers hit `TypeError: x.getMetrics is not a function` at runtime.

Fix: wrap the explicit-binding object in a `Proxy` that forwards unknown property access to `inner`. The five explicit bindings are kept so existing health/lifecycle methods are pre-bound (avoids losing `this` if the caller destructures), matching prior semantics for the existing surface. New methods on `T` are now transparently available without the wrapper needing to know about them.

19 tests pass against the new implementation; tsc + eslint clean.
