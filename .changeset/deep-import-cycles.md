---
'nexus-agents': patch
---

Fix a crash when a script imports one of 16 internal adapter modules directly from source instead of through the package entry point. Examples are `cli-adapters/types.ts`, `cli-adapters/factory.ts` and `cli-adapters/cli-timeout-profiles.ts`. The crash was `ReferenceError: Cannot access 'FALLBACK_CONTEXT_WINDOW' before initialization` or `ReferenceError: Cannot access 'TRACE_ID_MAX_LENGTH' before initialization`. Four low-level modules loaded their logger through the `core` index, and that index pulls in the router, which forms an import cycle. They now import the logger module directly. The published package entry point was never affected.
