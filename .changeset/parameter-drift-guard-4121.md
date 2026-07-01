---
'nexus-agents': patch
---

Add the parameter-capability drift guard (#4121, epic #4066). Widen the OpenRouter catalog parse (`parseCatalog`) to additively surface each model's `supported_parameters` as `supportedParameters` (backward-compatible — existence-only `.id` consumers are unaffected; the field is `undefined` when the provider omits it), and add a pure `reconcileParameterDrift` that compares the hand-curated param-capability map against the provider's advertised capabilities. A weekly `parameter-drift.yml` workflow runs the reconciliation and opens ONE issue on drift — it NEVER auto-edits the curated map, and a provider fetch failure is a loud skip rather than a false "no drift".
