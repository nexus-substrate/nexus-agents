---
'nexus-agents': patch
---

**fix(setup):** `configureHooks` no longer silently overwrites user hooks when the claude CLI returns malformed JSON. Closes #2975.

`getExistingHooks()` collapsed three distinct outcomes — "no hooks set," "the CLI errored," "the response was malformed" — into `undefined`. Downstream `mergeHookConfigs(undefined, nexus)` returns `nexus` only, and `configureHooks` then called `claude config set hooks` with that as the new total. Net effect: any user with their own `PreToolUse` / `Stop` hooks could lose them all after a claude-cli version bump that changed the JSON shape. The original #420 fix only covered the happy path; this regresses on the parse-failure path.

Added `readExistingHooks()` that returns a discriminated union `{ kind: 'absent' | 'present' | 'unreadable' | 'parse_failed' }`. `configureHooks` now branches on `kind === 'parse_failed'` and returns a structured error asking the operator to inspect `claude config get hooks` and resolve manually — instead of overwriting. `getExistingHooks()` stays as a thin compat wrapper that maps any non-present to `undefined` so existing callers and tests are unchanged.

6 new tests: 4 cover the `readExistingHooks` discriminated outcomes; 2 cover the `configureHooks` parse-failure guard (asserts `execFileSync` is NOT called on parse failure — the load-bearing safety invariant). 52 tests in the file pass; tsc + eslint clean.
