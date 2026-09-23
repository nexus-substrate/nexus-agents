---
'nexus-agents': minor
---

In gateway mode, voter panel seats are now dealt across model families first (Anthropic, OpenAI, Google), then across models within a family. Previously they were dealt round-robin in the order the gateway listed its models. On a realistic three-family catalogue, the old order seated 5 OpenAI models, 2 Anthropic models and no Google model on a 7-seat panel; the same catalogue now seats 3 Anthropic, 2 OpenAI and 2 Google. The assignment is the same whatever order the gateway lists its models in. Models with an unrecognised vendor are dealt last, as their own group. `NEXUS_VOTER_MODEL_<ROLE>` pins still win, and the remaining seats are balanced around them. When every assigned seat is in one family, a warning is logged: "Consensus panel collapsed to a single model family".

The `consensus_vote` response gains three additive fields:

- `panelDiversity.distinctFamilies`: the number of distinct vendors among the seats that answered.
- `panelDiversity.unclassifiedSeats`: the number of answering seats whose model names no recognised vendor. These seats are never counted as a family.
- `votes[].modelUsed`: the model each seat ran on. This was previously only in `costSummary.perVoter`.

If a 3+ seat panel answered on several models of one family, `panelWarning` now says so. The CLI summary line reads, for example, `Models: 7 distinct, 3 families, 0 fallbacks`. The persisted vote record is unchanged.
