---
'nexus-agents': patch
---

sprint: `plan --create-issue` fails when the issue was not created (#5848)

`createSprintIssue` returns `null` for every failure — `gh` absent, unauthenticated, rate-limited, sandbox-denied, or output without an issue URL. The caller dropped that `null` on the floor: the command printed "Creating sprint issue...", nothing after it, and exited `0` with `"success": true` and no `error` field, so a CI job consuming the exit code recorded a sprint epic that was never filed.

- `createSprintIssue` now returns `{ ok: true, issueNumber } | { ok: false, reason }`, separating "the command did not run" from "it ran but printed no issue URL", each with its own operator-facing message.
- `sprint plan --create-issue` exits `1` and reports the error when the create failed. Without `--create-issue` nothing changes.
- `printSprintResult` prints the error after the plan instead of instead of it, so a sprint whose issue could not be filed still shows the proposal it computed.
