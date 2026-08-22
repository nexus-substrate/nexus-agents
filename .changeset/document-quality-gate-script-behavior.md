---
'nexus-agents': patch
---

Document what `run_quality_gate` actually runs ([#4355](https://github.com/nexus-substrate/nexus-agents/issues/4355) acceptance criterion).

The tool description still described the pre-#4536 behaviour. It said check selection is "a fixed enum→factory map so no arbitrary command reaches a shell" — true, and still true — while saying nothing about _which_ command each check now resolves to.

A caller reading it could not tell that a check runs the repository's own declared script, that an undeclared script produces `skip` rather than a substituted tool, or — most importantly — that a run in which nothing executed reports verdict `'skip'` and not `'pass'`. That last one changes how a caller must read the result, so leaving it undocumented would make the honest verdict arrive as a surprise.

Updated in both places the drift gate keeps in lockstep (the registered MCP description and `scripts/tool-descriptions-data.ts`), and `docs/reference/tools/run_quality_gate.md` regenerated from it.
