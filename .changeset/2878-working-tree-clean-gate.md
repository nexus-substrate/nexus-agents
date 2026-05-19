---
'nexus-agents': patch
---

**ci(sprawl):** working-tree-clean gate after `pnpm test:coverage`. Closes #2878 (epic #2872).

CI now fails if tests leave files matching the sprawl-pattern paths from the epic-#2872 audit (`runs/`, `logs/`, `.nexus-pipeline/`, `.nexus-agents/`, `predictions.jsonl`, `coverage.json`, `.test-*`). The check runs unconditionally (`if: always()`) so it catches leaks even when tests pass.

The audit found the test suite is already clean — every test uses `mkdtempSync(tmpdir(), ...)` with `afterEach` cleanup. This gate locks that discipline in so a future test that writes to `cwd` without cleanup gets caught at PR time rather than discovered later as accumulated sprawl.
