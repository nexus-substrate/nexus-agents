---
'nexus-agents': minor
---

feat(routing): make API adapters first-class bandit arms (#3422, epic #3317)

Direct-API adapters (Anthropic/OpenAI/Google/custom-OpenAI) are now first-class
routing/bandit arms (`api:<vendor>`), scored **distinctly** from the four CLI
slots — so the self-tuning loop learns CLI-vs-API performance separately instead
of dropping API outcomes (the silent data loss audited in #3317).

- New `RoutingArmId = CliName | ApiArmId` arm space; a `ModelToCliAdapter` shim
  bridges `IModelAdapter` into the router's `ICliAdapter` surface; a
  `wrapApiSelectionForRouter`/`collectApiRoutingArms` factory enumerates
  key-present vendors.
- The ranking/selection pipeline carries the distinct arm end-to-end; only the
  **bandit outcome** stays distinct, while registry/pricing lookups, telemetry,
  and secondary learners collapse to the display slot (`routingArmDisplaySlot`).
  `decisionsPerCli` stays slot-keyed.
- Wiring is gated: `createAllAdapters` appends API arms **only** when
  `NEXUS_BILLING_MODE=api` and the vendor key is present — default plan mode is
  CLIs-only, no surprise API spend.

Reviewed: QA (one trace-attribution collapse fixed), security (clean — keys
never logged/echoed, SSRF guard intact), cleanup (orphan export removed).
Follow-ups: #3424 (tier-stage participation), #3425 (model-source key collapse),
#3426 (connect-time SSRF check).
