---
'nexus-agents': patch
---

fix(cli-adapters): register codex in the model-discovery probe (#4318)

`list_available_models` reported `claude`, `gemini` and `opencode` but never
`codex`, despite the CLI being installed and authenticated.

The cause was a silent capability gap rather than a registration bug.
`buildDefaultModelSources` includes an adapter only when `hasListModels(adapter)`
is true, and `createAllAdapters` defaults codex to the **mcp** transport
(`codexTransport: CliTransport = 'mcp'`). `CodexMcpAdapter` had no `listModels()`
— only the subprocess `CodexCliAdapter` did — so codex was filtered out of the
source list with no error logged anywhere. The probe reported one fewer transport
than it had.

`CodexMcpAdapter.listModels()` now delegates to the same key-free models.dev
snapshot lookup the subprocess adapter uses. Model enumeration is
transport-independent, so which transport codex happens to be running must not
change which transports are discoverable — pinned by a test asserting both
transports yield the same probe set.

This is one item of #4318; the agy/Antigravity migration and auth-tier health
detection remain open there.
