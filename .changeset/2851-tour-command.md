---
'nexus-agents': minor
---

**feat(cli):** add `nexus-agents tour` — an interactive walkthrough of the four headline tools. Closes #2851.

`nexus-agents tour` is a no-API-keys, no-quota guided walkthrough of `orchestrate`, `vote --quick`, `research_synthesize`, and `verify_audit_chain`. Each step explains what the tool does, shows a representative output (hand-authored fixture, clearly labeled as illustrative), surfaces the relevant `~/.nexus-agents/` paths, and gives a one-line takeaway. The tour pauses between steps in interactive mode; `--non-interactive` runs straight through, suitable for CI / scripted demos.

Architected as `runTour(opts, io: TourIO)` taking an injected I/O surface — the steps are pure, all terminal interaction goes through `TourIO`, and `node:readline` lives only in the `interactiveIO()` factory. Tests pass a fake I/O that captures `write` calls and scripts `prompt` answers — no readline, no stdout spying.

Reuses the existing `--non-interactive` option (no new CLI flag) and is placed in the `advanced` audience band of the command catalog so the curated `essential` tier stays at its 12-entry cap.
