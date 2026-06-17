---
'nexus-agents': patch
---

feat(observability): per-voter, per-decision cost aggregation on consensus + pr_review (#3855)

A governed decision — a `consensus_vote` or `pr_review` run — fans out to N voter
LLM calls. Per-CALL usage telemetry already existed (`learning/usage-log.ts`:
token + cost per model call); what was missing was the AGGREGATION rolling those
per-call numbers up into one per-decision answer.

This adds that rollup layer, riding the EXISTING decision surfaces — NO new MCP
tool (the 47-tool ceiling is respected; tool count stays at 46):

- `observability/decision-cost.ts` — the pure, fixture-tested rollup
  (`rollupDecisionCost`): per-voter → per-decision totals, per-model breakdown,
  micro-USD rounding. Missing cost is counted as UNMEASURED (a floor), never a
  measured $0; `NEXUS_BILLING_MODE=plan` records 0-cost while KEEPING token
  counts (mirrors how plan mode zeroes cost in routing without dropping the
  token signal).
- `observability/decision-cost-store.ts` — durable JSONL persistence built on
  the shared `JsonlStore<T>` primitive (no hand-rolled JSONL), written under the
  shared learning dir like the OutcomeStore idiom. Stores only per-voter /
  per-model token + USD totals — never proposals, diffs, prompts, or outputs.
- `mcp/tools/decision-cost-recording.ts` — the consumer bridge: maps a panel's
  per-voter results into cost inputs (model captured on `AgentVoteResult`,
  api-mode cost derived via the same registry-backed `computeCostUSD` the
  per-call usage log uses), reads the live billing mode, rolls up + persists, and
  returns the summary. `consensus_vote` and `pr_review` attach the returned
  `costSummary` to their existing responses (best-effort — a rollup failure never
  fails the decision).

Record + measure only — no routing or weighting change. Feeds Epic G's
weather_report + manifest cost profiles (#3856) and the governed-decision cost
doc (#3857).
