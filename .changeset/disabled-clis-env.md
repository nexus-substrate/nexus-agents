---
'nexus-agents': minor
---

New `NEXUS_DISABLED_CLIS` environment variable takes CLIs out of service, e.g. `NEXUS_DISABLED_CLIS=codex,gemini` when those plans are out of quota. Before this, a quota-exhausted CLI stayed selectable because it is still installed and authenticated: it kept receiving voter seats and router traffic until its circuit breaker had watched real calls fail.

The value is a comma-separated list of `claude`, `gemini`, `codex` and `opencode`, trimmed and case-insensitive. A disabled CLI is dropped from `getAvailableClis` (voter seats and auto-selection), from `createAllAdapters` (the routing arm set used by `orchestrate` and the pipeline router), from per-CLI registry adapters and expert fallback chains, and from `delegate_to_model` recommendations. `doctor` lists disabled CLIs and does not probe them. An unknown name logs one warning and is ignored. Disabling every CLI leaves no CLI adapter, so callers get the existing no-adapter error. Unset or empty changes nothing.
