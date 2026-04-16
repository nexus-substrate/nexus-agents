---
'nexus-agents': patch
---

fix(security): close 6 real CodeQL findings I missed in earlier sweeps

Pagination bug — earlier alert audits returned only the first 30 of 101 open alerts. After paginating I found 6 real CodeQL bugs (vs the 95 mostly-Scorecard-noise ones):

- **js/incomplete-multi-character-sanitization** (`mcp/tools/execute-expert.ts:124`): single-pass `<[^>]*>` strip allowed nested-tag bypass like `<scr<script>ipt>`. Now iterates until stable.
- **js/polynomial-redos × 2**:
  - `swe-bench/prompt-template.ts:176`: replaced regex-based raw-diff extraction (with two `[\s\S]*?` groups) with index-based `indexOf`/`indexOf` scanning + 256KB input bound.
  - `swe-bench/iteration-context.ts:147`: changed greedy `test.*fail` to bounded non-greedy `test.{0,200}?fail`.
- **js/incomplete-sanitization × 2** (`scripts/review-pr.ts:192, 279`): `replace(/"/g, '\\"')` didn't escape backslashes, allowing `\"` to escape the quoted block. Now uses `spawn` with stdin pipe for the CLI prompt and `gh pr comment --body-file <tempfile>` for the GitHub comment — no shell interpolation at all.
- **js/shell-command-constructed-from-input** (`swe-bench/test-runner.ts:239`): dismissed as false positive — the `safePattern` allowlist already restricts to `[a-zA-Z0-9_./:*\-[\]]+` (no shell metachars survive), and single-quote wrapping is defense in depth.
