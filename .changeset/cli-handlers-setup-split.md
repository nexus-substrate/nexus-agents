---
'nexus-agents': patch
---

Moves the `init` and `setup` CLI handlers and their private helpers from `cli-commands-handlers.ts` into a sibling `cli-commands-handlers-setup.ts` (no CLI behaviour change; `docs/reference/capabilities.md` now names the module each handler is actually imported from).
