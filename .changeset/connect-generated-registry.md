---
'nexus-agents': minor
---

feat(config): connect the 1071-entry generated catalog to ModelRegistry (#3293)

Ingests `model-registry.generated.json` (the broad LiteLLM/models.dev catalog,
~1071 entries) into `ModelRegistry` as a LOWEST-priority breadth tier. Each
record is converted to a full `ModelEntry` (behavior fields derived from the
id's identity, then the catalog's context window / pricing / display name
overlaid). In-tree, manifest, and models-dev tiers all still win; the breadth
tier only fills the long tail, so unknown/new models resolve to real catalog
data instead of a bare derived default.

This is the non-destructive "connect, don't drop" step toward the
CapabilityDiscovery → ModelRegistry consolidation (#3293) — it preserves the
coverage the legacy T2 tier provided (parity test asserts zero context-window
mismatches across all catalog ids). The CapabilityDiscovery removal stays gated
behind the binding confirmation vote and remains a follow-up.
