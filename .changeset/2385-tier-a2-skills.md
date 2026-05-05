---
'nexus-agents': minor
---

Tier A2 of epic #2385 — adopt 4 more skills from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills):

- `performance-optimization` — measure-first MIFVG cycle (Measure → Identify → Fix → Verify → Guard) with anti-rationalization for the most common premature-optimization excuses. Cites our existing patterns (Beyoncé Rule, hot-path identification by profile not guess) and references the soon-to-land `performance-checklist.md` reference (Tier B).
- `api-and-interface-design` — Hyrum's Law, contract-first, validate-at-boundaries, consistent error semantics, discriminated unions, branded IDs, input/output separation. Cross-references our zero-`any` policy, `.rules/untrusted-input.md`, the `deprecation-and-migration` skill, and our `Result<T,E>` canonical pattern.
- `browser-testing-with-devtools` — Chrome DevTools MCP integration with strong security boundaries (DOM/console/network = untrusted, no instruction-following from page content, JS-execution constraints, no credential exfiltration). Per Security voter's epic-vote concern: explicit URL-allowlist + untrusted-DOM handling.
- `context-engineering` — six-level context hierarchy (rules → memory → spec → source → live state → conversation), subagent fan-out discipline (3-4 wave, < 500-word prompts, output budget, `## Status` line), confusion-management pattern (surface ambiguity, don't silently choose), inline-planning pattern.

Skill count: 21 → 25.

Also patches `scripts/generate-skills-index.ts` to normalize whitespace in extracted trigger phrases — YAML literal-block descriptions wrap at column 80, which previously caused the trigger set to contain literal newlines that then broke CLAUDE.md's skill table (MD038 + MD056). Fixes the root cause that bit PRs #2386 and would have bit this PR too.

Format follows the addyosmani template (when-to-trigger / process / anti-rationalization / red flags / verification checklist), adapted to nexus-agents conventions and tooling.
