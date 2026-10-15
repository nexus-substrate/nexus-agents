---
'nexus-agents': minor
---

Add an optional actual-transport access-mode query to model adapters. Worker dispatch selects a measured compatible adapter before input preflight, preserves unknown or unavailable support, and retains the final native enforcement checks. Known incompatible selections no longer consume a completion slot when an eligible fallback exists; late unsupported refusals do not repeat through refinement. Completion budgets and native permissions remain unchanged.

Migration for custom adapters: worker eligibility no longer treats an absent access-mode query as support. Existing implementations remain structurally valid, but may return `UNSUPPORTED` with zero worker completion attempts when no compatible alternative is measured. Direct completion and streaming are unchanged. Implement `supportsAccessMode(mode, signal)` using actual transport enforcement evidence, or forward the actual transport's query and preserve `undefined` when absent. Do not return blanket `true`; concrete API subclasses must declare their own behavior and may explicitly return `false`. See `docs/interfaces/model-adapter.md` for a forwarding example.
