---
'nexus-agents': patch
---

Installs no longer stall or fail on dependency install scripts (#6481). Before this release, `pnpm add -g nexus-agents` in a terminal (pnpm 12) stopped at an interactive "Choose which packages to build" prompt and installed nothing until you answered. `npm install -g nexus-agents` with npm 12's `strict-allow-scripts` exited 1.

`@ast-grep/lang-go`, `@ast-grep/lang-python`, `@google/genai` and `@modelcontextprotocol/sdk` now ship inside the nexus-agents tarball as `bundleDependencies`. npm 12 (default and strict) and pnpm 12 install with no prompt, no blocked-scripts warning and no script executed. The Go/Python grammars and the Gemini adapter work as before. The MCP SDK is bundled because `@google/genai` declares it as a peer, and npm expects a bundled package's peers inside the bundle.

Trade-offs: the tarball grows from about 6 MB to about 15 MB. A security fix in a bundled package now reaches you through a nexus-agents release rather than an update of that package alone, though `npm audit` still reports it.
