---
'nexus-agents': patch
---

Upgrade the `ts-morph` runtime dependency from 27 to 28. ts-morph 28 bundles the TypeScript 6.0 compiler (27 bundled 5.9), so the codebase indexer, `extract_symbols` and `search_usages` now parse source with the same TypeScript major the package itself is built with. No nexus-agents API or output changes; consumers who install nexus-agents will pull `ts-morph@28` and `@ts-morph/common@0.29`.
