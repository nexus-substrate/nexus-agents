---
'nexus-agents': minor
---

Complete the CapabilityDiscovery → ModelRegistry consolidation (#3293). `ModelRegistry` (`getDefaultRegistry().getEntry`) is now the single model-data resolver. The legacy four-tier `CapabilityDiscovery` resolver — which had no production callers; its `resolve()` chain was dead code — is removed, along with its bundled-registry loader. `registry doctor` now derives its report from the registry: it lists effective entry counts per source (in-tree / models-dev / manifest / generated / derived) and the unknown-id fallback context window, instead of the old T1/T2/T3/T4 tier view. No change to model resolution behavior. The user `models.yaml` overlay is still reported by `doctor` for inspection but, as before, does not yet affect live resolution — wiring it into the registry is tracked in #3351.
