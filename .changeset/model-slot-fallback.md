---
'nexus-agents': minor
---

fix(routing): resolve any model to a CliName slot so api-mode + new models are recorded (#3317, #3293)

`resolveCliFromModelString` returned undefined for any model not in the curated
`MODEL_IDS` list, and `recordOutcome` skips an undefined-cli outcome — so a
brand-new release (gpt-5.5, claude-4.8) or an API/openrouter model not yet in
the registry had its routing outcomes silently dropped, breaking LinUCB learning
and tune signals in api-mode. New `resolveCliSlot(model)` resolves known models
to their exact slot and falls back to a vendor-derived slot for unknown models
(anthropic→claude, openai→codex, google→gemini, others→opencode), so the
routing/outcome/tune pipeline records and learns regardless of CLI-vs-API
backing or model novelty. Additive — known models keep their exact slot.
