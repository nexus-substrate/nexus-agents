---
'nexus-agents': patch
---

Exclude the actual failed role-specific adapter on `retry_different_cli` triage actions during worker dispatch, resolving preflight adapters by role and sub-task prefix when retried entries are cloned with failure context.
