---
'nexus-agents': patch
---

fix(governance): AGENTS.md's toolchain footer rows are written and measured by the one render (#6146)

`governance:check` now measures AGENTS.md's three toolchain footer rows
(`_MCP Protocol: …_`, `_Node.js: …_`, `_TypeScript: …_`) the way it measures
the file's other generated text: against the one render that
`governance:inject` writes. Before, the rows were written by a separate
replacer after the render and probed by a separate check (`buildToolchainProbes`),
a third mechanism beside the generated sections and the inline count phrases.
Both are gone; the rows are inline values of the AGENTS.md render.

A stale row is reported in the inline-value shape with the AGENTS.md line it
sits on — `AGENTS.md Node.js footer is stale (#6146): _Node.js: >=1.0.0_ →
_Node.js: >=22.5.0_ — AGENTS.md:610` — and the count phrases gain the same line
suffix. The probe wording (`expected >=22.5.0, found >=1.0.0`) no longer appears,
and `Count-drift probes run:` drops by three. The values themselves are
unchanged: `package.json` (`typescript` major, `engines.node`) and the installed
SDK's `LATEST_PROTOCOL_VERSION`. CLAUDE.md's copies were already covered by its
own whole-file render.
