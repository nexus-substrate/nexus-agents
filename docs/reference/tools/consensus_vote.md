---
title: 'MCP Tool: consensus_vote'
description: 'Multi-model consensus voting on proposals'
tier: 2
keywords: [mcp, tool, reference, consensus_vote]
---

# `consensus_vote`

> Auto-generated from the registered MCP tool descriptions and input
> schemas. Do not edit by hand — run `pnpm docs:tools` to regenerate.

Execute multi-model consensus voting on a proposal. Uses 7 roles by default (or 3 with quickMode), voting with configurable strategies. Supports async mode (returns a jobId to poll via get_job_result).

## Parameters

| Parameter | Type | Required | Constraints | Description |
| --------- | ---- | -------- | ----------- | ----------- |
| `proposal` | string | yes | minLength 1; maxLength 4000 | Proposal text to vote on |
| `threshold` | enum | no | one of: majority \| supermajority \| unanimous | Voting threshold (legacy): majority, supermajority, unanimous. Use strategy instead. |
| `strategy` | enum | no | one of: simple_majority \| supermajority \| unanimous \| proof_of_learning \| higher_order \| opinion_wise | Voting strategy: simple_majority (default), supermajority, unanimous, proof_of_learning, or higher_order (Bayesian-optimal) |
| `errorPolicy` | enum | no | one of: reduce_denominator \| count_as_abstain \| fail_closed \| absolute_quorum | How to treat voters that errored or timed out (#2630). Default: fail_closed for unanimous only; reduce_denominator for all other strategies incl. higher_order/opinion_wise (#3138 — a single infra timeout should not void an otherwise-unanimous vote). Opt-in absolute_quorum (#4132): an errored voter — especially the contrarian (catfish) — degrades the verdict to no_quorum (recoverable re-run) instead of being dropped from the denominator; never manufactures approved/rejected from an induced error. Regardless of policy, errors > 50% always fails. |
| `quickMode` | boolean | no | default false | Use 3 agents instead of the full 7-role panel for faster execution |
| `simulateVotes` | boolean | no | default false | TESTS ONLY — when true, voters return random decisions. Output must not be used for real decisions. (#2319) |
| `mode` | enum | no | one of: sync \| async | Dispatch mode (default: sync). Use "async" for higher-order strategies with 7 voters. |
| `idempotencyKey` | string | no | minLength 1; maxLength 256 | Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId. |
| `ratifies` | string | no | minLength 1; maxLength 256 | Authority-tier ratification subject (#4004) — the loop/strategy id this vote ratifies for an authority-ladder promotion. Bound into the authentic vote record so the promotion gate can verify it. Omit for ordinary votes. |
