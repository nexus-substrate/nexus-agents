---
'nexus-agents': minor
---

Record timeout-mismatch events to a queryable JSONL ([#2703](https://github.com/williamzujkowski/nexus-agents/issues/2703), Epic [#2631](https://github.com/williamzujkowski/nexus-agents/issues/2631) prerequisite).

The `toSdkCallbackWithBudgetCheck` WARN added in #2632 was log-only — operators could grep for "budget exceeds client default" but couldn't answer "of N mismatched calls, what fraction ended in a timeout?" Each mismatch is now also appended to `$NEXUS_DATA_DIR/mcp-telemetry/timeout-mismatch-events.jsonl` as one JSON row carrying a correlation `eventId` (also surfaced in the WARN log entry's context) and the call's eventual outcome (`success` / `error` + `errorCategory` from the post-#2649 envelope when present). Joinable per the Contrarian's correlation point on the #2631 disposition vote — bare counts don't prove causation.

Schema documented in `docs/architecture/MCP_PROTOCOL.md` (Correlation-keyed event log section). Best-effort recording: a telemetry-write failure logs at `debug` and never fails the user's tool call. The aggregation surface ("does mismatch dominate timeouts?") belongs in `improvement_review` / a fitness report and is intentionally out of scope here.
