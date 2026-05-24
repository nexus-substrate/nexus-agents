---
'nexus-agents': patch
---

**test:** handler-branch coverage for `issue_triage` (closes #2953 site 1).

The `issue_triage` handler closure has three branches whose envelope shape flows into MCP transport, the audit log, and the adaptive-routing OutcomeStore — but `issue-triage-tool.test.ts` covered only the input schema. A refactor that swapped `recordTriageOutcome(false)` and `recordTriageOutcome(true)` would have shipped green and inverted the adaptive routing signal for the `planning` category forever.

Added `mcp/tools/issue-triage-tool-handler.test.ts` (separate file because it needs a module-level mock of `dogfooding/issue-triage.js` that the sibling test relies on being real) with 3 tests covering:

1. Validation failure returns a structured `validation` error envelope and never invokes triage.
2. Triage failure returns a structured `internal` error envelope carrying the underlying cause message (asserts the error-path side of `recordTriageOutcome`).
3. Success returns a JSON-stringified `TriageResponse` (asserts the success-path side of `recordTriageOutcome`).

Also exported a `_testing.createIssueTriageHandler` surface from the tool module so the handler is testable without bypassing types — same pattern the sibling tools use (`search-codebase-tool`, etc.).

9 tests pass across the 2 issue-triage test files (6 schema + 3 handler-branch); tsc + eslint clean.

The other two #2953 gaps (login-command exit-code truth-table; the broader "wrapper-only-tested vs branch-tested" sweep) are deferred to a follow-up.
