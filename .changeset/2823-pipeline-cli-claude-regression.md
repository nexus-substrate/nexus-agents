---
'nexus-agents': patch
---

**Closes #2823.** fix(pipeline): outcome recording hardcodes cli='claude' — regression of #1154

`pipeline/agent-executor.ts` and `pipeline/adaptive-orchestrator.ts` both wrote to `OutcomeStore` with `cli: 'claude' as const` — a regression of the bug #1154 fixed elsewhere. Every pipeline-executed task (research / plan / vote / decompose / code_gen / review / security) was credited to claude regardless of which CLI actually ran, poisoning weather-report visualizations and the LinUCB cold-start `warmStart()` (composite-router.ts:353/374).

**Fix:**

1. `ExpertBridgeResult` now carries the resolved `cli?: CliNameLiteral`. The expert-bridge derives it from `CliResponse.model` via the canonical `getCliForModelId` registry mapping — guards against unknown model strings rather than fabricating a default.
2. `recordOutcome` in `agent-executor.ts` now takes a `RecordOutcomeArgs` options bundle including `cli: CliNameLiteral | undefined`. When `cli` is undefined (bridge failed before dispatch, or non-CLI stage like local security scan / consensus vote), the helper **skips the record** rather than fabricating a wrong attribution. Stage events still emit; only the cli-attributed outcome that would poison the routing learner is suppressed.
3. All 9 call sites (research / plan / vote / decompose / implement / qaReview / securityScan) updated. Sub-call stages with multiple expert calls (research) pick whichever sub-call actually reached a CLI.
4. `recordPipelineOutcome` in `adaptive-orchestrator.ts` removed entirely — it duplicated the per-stage records, fabricated `cli: 'claude'` for pipeline-level data, hardcoded `category: 'code_generation'` regardless of classification, and had no downstream consumer.

**Tests:** 3 new regression cases in `agent-executor.test.ts` assert (a) the threaded cli wins over any hardcoded value, (b) `undefined cli` skips the record entirely, (c) different stages can have different cli attributions. All 719 pipeline + parser tests pass; typecheck + lint clean.
