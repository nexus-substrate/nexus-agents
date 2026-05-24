---
'nexus-agents': patch
---

**fix:** four silent `catch {}` sites now log the swallowed error. Closes #2952.

Each pre-fix collapsed a real failure mode (subprocess error, DB lock, schema mismatch, import error) into a sentinel value with no log trail — operators saw degraded behavior with no way to diagnose.

- `cli-adapters/factory.ts:167` — `isCliAvailable` catch dropped probe exceptions; "unavailable" gave no clue whether the binary was missing, probe timed out, or auth failed. Now the cached `message` field carries the error string. Extracted `cacheHealthCheckFailure` helper to keep the function under the complexity-10 cap.
- `mcp/tools/consensus-vote.ts:399` — `runContrarianCheck` catch silently disabled the escalation guardrail on `executeExpert` failure, JSON parse failure, or expert-bridge import error. Now logs at `warn` with the error message; the default "no escalation" envelope is preserved.
- `cli-adapters/composite-router-stages.ts:453, 716` — `getPerformanceDataForCategory` and `getWeatherBonusForTask` catches silently disabled the performance-floor penalty and weather bonus on OutcomeStore read failures. Empty-Map fallback is the right behavior (no data → no signal), but now the debug log gives operators a trail when something stops working.

135 tests pass across the 3 affected test files; tsc + eslint clean.
