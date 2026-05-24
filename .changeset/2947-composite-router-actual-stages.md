---
'nexus-agents': patch
---

**docs(routing):** update `composite-router` @module + 2 architecture docs to list the actual pipeline stages. Closes #2947.

The pre-2026 docstring claimed the pipeline was 5 stages (`Budget → ZeroRouter → Preference → TOPSIS → LinUCB`), pre-dating #755 / #1350 / #1686 / #1790 / #2414. The real pipeline `composite-router-stages.ts:runPipeline` has ~12 stages, including two that can **short-circuit** routing (`QualityConstraint`, `CategoryOverride`). A maintainer debugging "why was my model rejected?" reading the old 5-stage line would never find them.

Updated:

- `cli-adapters/composite-router.ts` module docstring — full 8-step ordered list with short-circuit notes
- `docs/architecture/ROUTING_SYSTEM.md` overview diagram — full pipeline + the same short-circuit callout
- `docs/design/components.md` CompositeRouter line — full stage list + link to `ROUTING_SYSTEM.md` for rationale

Docs-only change; 68 routing tests pass unchanged.
