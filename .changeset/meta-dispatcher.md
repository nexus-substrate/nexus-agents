---
'nexus-agents': minor
---

feat(orchestration): add MetaDispatcher with decision-keyed outcome recording

Adds `createMetaDispatcher()` — executes the strategy a `MetaDecision` selected and records the result as a dedicated `MetaOutcomeRecord` keyed by `decisionId`. The dispatcher takes an injected per-strategy executor map so the orchestration core stays free of the engine/MCP dependency graph (cycle-safe); real engine executors are wired in later by the outward-facing entry point. Strategy-level outcomes get their own record type rather than reusing the orchestration/learning `TaskOutcome` types (both of which require CLI/model fields a strategy spanning many CLIs cannot supply) — joining selection records with these by `decisionId` gives learned selection an uncontaminated dataset. Fails closed: a missing executor or a throwing executor records a failure outcome and rejects with a typed `MetaDispatchError` (never silent). Includes audit-log and in-memory recording outcome sinks.
