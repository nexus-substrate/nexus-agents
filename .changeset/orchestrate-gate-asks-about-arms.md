---
'nexus-agents': patch
---

`orchestrate` no longer refuses to start when a provider key is configured but
no CLI binary is installed. The precondition check was
`getAvailableClis().length === 0`, which probes for the binaries
claude/gemini/codex/opencode and never consults a credential — so it returned 1
before `createAllAdapters` could produce the `api:*` routing arms that
`NEXUS_BILLING_MODE=api` exists to enable (#3422). The gate now asks whether any
routing arm is usable, and the error names both routes instead of only the CLI
one.
