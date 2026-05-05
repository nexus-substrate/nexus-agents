# Skill References

Load-on-demand reference checklists for nexus-agents skills. Each file is a deep dive into a specific topic that the corresponding SKILL.md links to but does not inline (progressive disclosure — keeps the skill itself short and discoverable, while the full checklist is one click away when needed).

| Reference                                                    | Topic                                                                              | Loaded by skills                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`accessibility-checklist.md`](./accessibility-checklist.md) | WCAG 2.1 AA, ARIA roles, keyboard navigation, focus management                     | `ui-ux-design`, `browser-testing-with-devtools`                               |
| [`performance-checklist.md`](./performance-checklist.md)     | Core Web Vitals (LCP/INP/CLS), bundle size, profiling, common patterns             | `performance-optimization`                                                    |
| [`security-checklist.md`](./security-checklist.md)           | OWASP Top 10, auth/authz, input validation, security headers, secrets              | `security-scanning`, `security-advisory-response`, `api-and-interface-design` |
| [`testing-patterns.md`](./testing-patterns.md)               | Pyramid, AAA structure, naming, fakes vs mocks, table-driven, fixtures             | `test-driven-development`, `bug-fix`                                          |
| [`orchestration-patterns.md`](./orchestration-patterns.md)   | Multi-agent coordination, fan-out, consensus, retry policies, deadline propagation | `dev-pipeline`, `research-and-vote`, `codex-delegator`, `gemini-delegator`    |

## Adapted from

These references are adapted from the MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) library (Copyright © 2025 Addy Osmani). Each file's header comment cites the upstream source. Local edits add nexus-agents-specific links and remove sections that conflict with our policies in `.rules/` or `CLAUDE.md`.
