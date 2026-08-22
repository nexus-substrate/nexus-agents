---
'nexus-agents': patch
---

`run_quality_gate` runs the repository's own scripts instead of a hard-coded toolchain ([#4355](https://github.com/nexus-substrate/nexus-agents/issues/4355)).

The gate hard-coded `npx eslint`, `npx tsc`, `npx vitest` and `pnpm build`. A project that declares Oxlint and npm got a red `lint` verdict from an ESLint it does not use and does not configure — while its own `npm run lint` was green. The gate reported a fact about a toolchain nobody had chosen.

`npx` also made it a supply-chain surface: a missing checker was silently downloaded, so an unpinned, undeclared package executed _during a quality check_.

Checks now resolve to the repository's declared script (`lint`, `typecheck`/`type-check`, `test`, `build`), run through the package manager its lockfile selects (pnpm / yarn / bun / npm). No script declared means the check reports **`skip`** with the reason — never a substituted guess, and never a download.

**A gate that ran nothing no longer passes.** The aggregate was `fail > 0 ? 'fail' : 'pass'`, so a run in which every check was skipped reported a clean `pass`. Fixing the resolver without this would have converted a false red into a false green, which is strictly worse for a gate: an all-skipped run now reports `skip`, and feedback names every check that did not run rather than claiming "All checks passed."

`skip` rather than `fail` for a missing script is deliberate. Nothing was measured, and asserting a project is broken on evidence never gathered is the same defect pointed the other way.
