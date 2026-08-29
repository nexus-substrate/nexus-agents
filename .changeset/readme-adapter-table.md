---
'nexus-agents': patch
---

docs: the README listed a transport variant as a fifth CLI adapter

`codex-mcp` is not a CLI. `createCodexAdapter` (`cli-adapters/factory.ts:90-98`)
selects `CodexMcpAdapter` or `CodexCliAdapter` from the `transport` parameter, so
it is a transport variant of `codex`. `CLI_NAMES` has four members, and
configuration naming `codex-mcp` fails Zod parsing with nothing on the docs side
to explain why.

Corrected to four adapters, with the two codex transports described rather than
deleted — the count was wrong, but the information that codex has two transports
is real and was only recoverable from that row.
