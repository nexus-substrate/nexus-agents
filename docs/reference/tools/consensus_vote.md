---
title: 'MCP Tool: consensus_vote'
description: 'Multi-model consensus voting on proposals'
tier: 2
keywords: [mcp, tool, reference, consensus_vote]
---

# `consensus_vote`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Execute multi-model consensus voting on a proposal. Uses specialized agent roles to vote with configurable strategies.

## Parameters

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `proposal` | string | yes | Proposal text to vote on |
| `threshold` | VoteThresholdSchema | no | Voting threshold (legacy): majority, supermajority, unanimous. Use strategy instead. |
| `strategy` | VotingStrategySchema | no | Voting strategy: simple_majority (default), supermajority, unanimous, proof_of_learning, or higher_order (Bayesian-optimal) |
| `errorPolicy` | ErrorPolicySchema | no | How to treat voters that errored or timed out (#2630). Default: fail_closed for unanimous only; reduce_denominator for all other strategies incl. higher_order/opinion_wise (#3138 — a single infra timeout should not void an otherwise-unanimous vote). Regardless of policy, errors > 50% always fails. |
| `quickMode` | boolean | no | Use 3 agents instead of the full 7-role panel for faster execution |
| `simulateVotes` | boolean | no | TESTS ONLY — when true, voters return random decisions. Output must not be used for real decisions. (#2319) |
| `mode` | enum: sync \| async | no | Dispatch mode (default: sync). Use "async" for higher-order strategies with 7 voters. |
| `idempotencyKey` | string | no | Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId. |
