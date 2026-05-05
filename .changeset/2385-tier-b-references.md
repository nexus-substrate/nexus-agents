---
'nexus-agents': patch
---

Tier B of epic #2385 — adopt 5 reference checklists from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) under `skills/references/`. Loaded on-demand by relevant skills via the existing skill-link mechanism (CANONICAL SOURCES header comments).

References:

- `accessibility-checklist.md` — WCAG 2.1 AA, ARIA roles, keyboard navigation, focus management. Loaded by `ui-ux-design`, `browser-testing-with-devtools`.
- `performance-checklist.md` — Core Web Vitals (LCP/INP/CLS), bundle size, profiling, common patterns. Loaded by `performance-optimization`.
- `security-checklist.md` — OWASP Top 10, auth/authz, input validation, security headers, secrets. Loaded by `security-scanning`, `security-advisory-response`, `api-and-interface-design`.
- `testing-patterns.md` — Pyramid, AAA structure, naming, fakes vs mocks, table-driven, fixtures. Loaded by `test-driven-development`, `bug-fix`.
- `orchestration-patterns.md` — Multi-agent coordination, fan-out, consensus, retry policies, deadline propagation. Loaded by `dev-pipeline`, `research-and-vote`, `codex-delegator`, `gemini-delegator`.

Each reference file gets a header comment citing the upstream addyosmani source (MIT, Copyright 2025) and listing the nexus-agents skills that load it. A `skills/references/README.md` indexes the set.

Eight existing skills updated with reference links in their CANONICAL SOURCES headers (no behavioral change to the skills themselves — purely additive citation). Pure-patch release: no public-API impact.
