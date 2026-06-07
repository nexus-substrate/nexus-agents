---
'nexus-agents': patch
---

Propagate model-registry / overlay updates to routing without a process restart (#3185).

Two freezes are closed:

- `UnifiedAdapterRegistry` no longer caches its task→CLI routing at construction. Routing is re-resolved on every `getRouting` / `getAdapter` / `getSnapshot` read (~10 categories — negligible cost), so a post-startup registry/overlay change takes effect immediately.
- `getDefaultModelForCli` and `getInTreeCapabilitiesMatrix` now resolve through the overlay-bearing default registry (via a non-constructing `peekDefaultRegistry()` guard) instead of the frozen in-tree constants, so operator/user manifest overrides participate at runtime. A static fallback preserves the early-bootstrap path (no recursion, no forced filesystem read at module load).

Adds `reloadDefaultRegistry()` — the single hot-reload entry point. It re-reads the manifest overlays (fail-closed; never throws on a malformed manifest) and atomically resets BOTH the model-registry singleton and the `UnifiedAdapterRegistry`, so there is never a state where one is fresh and the other stale. Wired into `registry refresh`, which now hot-reloads in-process and updates its message accordingly.
