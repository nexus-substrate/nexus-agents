---
'nexus-agents': patch
---

test(ci): collect repo-root script tests in the CI run (#3952)

The package vitest config only globs `packages/nexus-agents/src/**`, so the
`scripts/**/*.test.ts` files (the doc generators and drift gates shipped in
#3688/#3949 and others) were never collected by CI — they passed locally but
gave zero CI protection. This adds a root `vitest.config.ts` that collects them
(excluding stale `.claude/` worktree copies), a `test:scripts` npm script, and a
`Script Tests` CI job that builds `nexus-memory` first then runs the suite.

Collecting these tests immediately surfaced a real bug masked by the missing
coverage: `scripts/check-mcp-description-drift.test.ts` passed the raw
`TOOL_MANIFEST` objects to `buildDriftReport` (which expects tool _names_, as
the CLI gate does), so every lookup missed; fixed to `.map((t) => t.name)`.

`scripts/inject-governance.test.ts` is scoped out for now: it spawns ~30 `npx
tsx` subprocesses that mutate shared repo files in place, takes ~400s solo, and
is flaky under the forks pool. The governance `check` it exercises is already
gated in CI via `docs-check.yml`, so its protection is not lost. Tracked for a
parallel-safe/fast rework in #3954.
