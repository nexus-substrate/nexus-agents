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

## Project-specific overrides

References are general engineering guidance. **When a reference conflicts with a nexus-agents canonical source, the canonical source wins.** Order of precedence on conflict:

1. `CLAUDE.md` (prime directive, type-safety, anti-sprawl, autonomous-loop rules)
2. `.rules/*.md` (auto-loaded per-topic rules: TypeScript, git, security, untrusted input, subagent coordination, governance)
3. `docs/architecture/*.md` (architecture decisions, e.g. `CONSENSUS_PROTOCOLS.md`, `UNTRUSTED_INPUT_HARDENING.md`)
4. SKILL.md frontmatter and process steps
5. The reference checklist (these files)

Examples of project-specific overrides that take precedence:

- **TDD cycle**: `CLAUDE.md` says "Red/Green TDD is non-negotiable." `testing-patterns.md` is consistent but if it ever drifts, CLAUDE.md wins.
- **Consensus thresholds**: `.rules/governance.md` and `docs/architecture/CONSENSUS_PROTOCOLS.md` define our voter panels and supermajority thresholds (5/7). `orchestration-patterns.md` describes generic patterns; the governance rules are authoritative for ours.
- **Adapter retry semantics**: our `ResilientAdapter` has specific retry/backoff conventions documented in `docs/architecture/`. Reference patterns are starting points, not the spec.
- **Input validation**: `.rules/untrusted-input.md` defines the trust-tier system (Tier 1-4) and the Rule of Two. `security-checklist.md` complements but does not override.

If you encounter a reference recommendation that contradicts a higher-precedence source, **file an issue rather than silently following the reference** — it likely means the reference needs a local annotation.
