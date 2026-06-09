---
'nexus-agents': minor
---

feat(research): the dev-pipeline research stage now captures STRUCTURED research data directly instead of LLM-serializing it to bare text (#3372 increment 1). Per a 7/7 higher_order consensus vote (Option A), the stage calls `executeDiscovery` + `analyzeGaps` directly (no research-stage LLM tokens) and builds a `ResearchContext { text, metadata: { discoveredItems(relevanceScore), recommendations, qualitySignals } }`; the human-readable text is derived deterministically from that same structure (single source of truth), with external titles/recommendations escaped + the rendered list bounded. The `research()` stage signature is unchanged this increment (returns the derived text). Increment 2 will thread the structured metadata through plan/vote and weight voter prompts on research maturity (unblocking #3234).
