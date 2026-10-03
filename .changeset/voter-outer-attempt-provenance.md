---
'nexus-agents': minor
---

Persist immutable voter response usage and provenance across retries, replacements,
fallbacks and late settlement in decision-cost telemetry. Report observed outer-attempt
usage and coverage separately from final-seat totals in the weekly weather view.

Keep final-seat cost records when decorative telemetry is invalid, and bound captured
model, CLI and adapter strings. Read future telemetry keys and classifications safely.
Exclude duplicate response histories only from attempt totals, with explicit invalid
telemetry coverage. Distinguish parse and adapter-error retries, retain role-retry
context through CLI fallback, and preserve first-pass/retry event order.
