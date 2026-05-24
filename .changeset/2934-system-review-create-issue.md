---
'nexus-agents': patch
---

**fix(cli):** `nexus-agents system-review --create-issue` silently failed on every run.

`system-review-helpers.ts:createIssue` embedded the markdown review body in the command string as `gh issue create --body '<body>'`. The body has tables (`|`), `coveragePercent.toFixed(1)%` parens, and ET-timestamp parens, so the sandbox `validateArgs` gate (`DENIED_ARG_PATTERNS[0] = /[;&|\`$()]/`) rejected the argument, `safeExecSandboxed`warn-logged and returned null, and the CLI showed neither an issue URL nor a clear error. The GitHub Actions`system-review.yml` workflow bypasses this helper and was unaffected — the broken surface was the local CLI subcommand only.

Same anti-pattern as #2863 (vote-command, fixed in #2912) and #2913 (sprint-command, fixed in #2916); this site was missed by the audit sweep. Fix: pipe the body via `--body-file -` over stdin. Title is `System Review: ${date}` (YYYY-MM-DD), metacharacter-free by construction. Closes #2934.

Regression: 4 new tests in `system-review-helpers.test.ts` mirroring the `createSprintIssue` pattern — assert `--body-file -` is in the command string, `--body '` is not, the markdown body arrives over stdin, and the command string is free of shell metacharacters.
