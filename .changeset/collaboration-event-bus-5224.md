---
'nexus-agents': patch
---

Rename the internal collaboration event bus to `CollaborationEventBus` / `ICollaborationEventBus` (#5224).

Two unrelated `IEventBus` interfaces and two `EventBus` classes existed: the pipeline pair (public, unchanged) and the collaboration pair (internal, reached only transitively through exported field types). `implements IEventBus` meant one of two disjoint contracts depending on the import line, and the fused api-surface entry that caused #5224 came from that collision.

Not a public-API change: neither collaboration name was importable from the package root before, and neither is now. The visible effect is that a few exported field types render as `ICollaborationEventBus` instead of `IEventBus` — structurally identical. `IEventBus` and `EventBus` now mean exactly one thing on the public surface: the pipeline bus.

Named by origin, not by role, on purpose: which bus is canonical for domain events is still UNRESOLVED (#5125). This names the fork; it does not resolve it.
