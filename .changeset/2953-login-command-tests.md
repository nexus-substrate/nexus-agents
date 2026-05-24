---
'nexus-agents': patch
---

**test(cli):** cover the `login`/`auth status` exit-code truth table (closes #2953).

Pre-fix, `packages/nexus-agents/src/cli/login-command.ts` shipped 142 LOC with zero tests against a 4-cell truth table on `(anyAuthenticated, actionable.length)` at line 86:

```ts
if (summary.anyAuthenticated || summary.actionable.length === 0) process.exit(0);
process.exit(1); // exit 1 only when no CLI authenticated AND a clear next action exists
```

A refactor flipping `||` to `&&` would have silently broken the script-detection contract documented in #2447 (the issue that introduced the exit-1 case so CI/setup scripts can detect "no creds at all but a clear next step"). The other 3 truth-table cells all exit 0 — script detection only fires in cell 4.

The fix:

- Exposed the existing internal helpers `orderForDisplay` and `summarize` as `export` (with a JSDoc explicitly marking them as test-surface) so unit tests can exercise pure logic without `console.log` mocking gymnastics.
- Added `packages/nexus-agents/src/cli/login-command.test.ts` with **15 tests** covering:
  - `orderForDisplay` — canonical CLI sort order, identity preservation, single/empty input.
  - `summarize` — all-authed, all-need-login, mixed, empty, all-not-installed cases including the exact status-line strings.
  - `handleLoginCommand` exit-code truth table — all 4 cells via a `process.exit` spy that throws to abort the function under test cleanly.
  - The `login` alias deprecation hint (#2449) — fires on `command: 'login'`, suppressed on canonical `auth`.

No production-code change beyond promoting two functions from file-private to `export`. tsc + eslint clean.
