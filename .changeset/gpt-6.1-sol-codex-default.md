---
'nexus-agents': minor
---

Register `gpt-6.1-sol` as a routable Codex model and change the Codex default from
`gpt-5.6-sol` to `gpt-6.1-sol`, following the 7-seat supermajority panel decision
(6–1), record `vote-1790834581155-7b39b83` (#6842).

The model remains unpriced until OpenAI publishes pricing. Usage accounting records
`priced:false`; outcomes retain `servedModel`, report `priceBasis: 'unknown'`, and
omit `costUsd`. Budget filters and cost-weighted TOPSIS estimate an unpriced model
at the highest known input and output rates among priced models of the same CLI —
for Codex, `gpt-5.5`'s $5/$30 per 1M — so the estimate is never cheaper than a
priced sibling such as `gpt-5.6-sol` ($4/$20). The static per-CLI table is used
only when a CLI has no priced model, and its Codex row is now $5/$30. Configured task-class cost ceilings exclude models with unknown pricing, so under
`NEXUS_BILLING_MODE=api` with a ceiling configured, the Codex default drops out of
ceiling-bound routing until it is priced. The default `plan` billing mode is
unaffected. Context
and capability values are carried over from `gpt-5.6-sol`, not measured for the new
model. Compare before/after outcomes by `servedModel`.

A model's CLI is now read from its registry entry rather than inferred from the
current default and the fallback chains. A pinned `gpt-5.6-sol` or `gpt-5.5`
keeps its Codex attribution (`getCliForModelId`, swarm-health signals) and, when
unavailable, falls back along the Codex chain; `gemini-3.5-flash` and the two
OpenRouter models gain the same mapping.

To pin the old model, use the existing adapter configuration:
`createCliAdapter({ cli: 'codex', model: 'gpt-5.6-sol' })`. For a delegated task,
the documented `delegate_to_model` override is `model_hint: 'gpt-5.6-sol'`.
