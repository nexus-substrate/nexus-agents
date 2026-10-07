---
title: 'What a vote result means'
description: 'How nexus-agents turns individual voter decisions into approved, rejected or no_quorum: strategies and their bars, who counts in the denominator, error policies, option votes and the stored record.'
diataxis: explanation
audience: user
order: 10
tier: 2
keywords:
  [consensus, vote, strategy, threshold, supermajority, higher_order, no_quorum, errorPolicy]
related_files:
  [
    ./CONSENSUS_PROTOCOLS.md,
    ../reference/cli-and-key-requirements.md,
    ../getting-started/YOUR_FIRST_RUN.md,
  ]
---

# What a vote result means

A consensus vote asks a panel of voter roles (architect, security engineer,
scope steward and others) to approve, reject or abstain on a proposal. The
result you get back is one word: `approved`, `rejected` or `no_quorum`. This
page explains how that word is reached, and what it does and does not tell you.

The rules described here live in `packages/nexus-agents/src/consensus/`. The
bar values are the `VOTING_THRESHOLDS` constant in
`consensus/decision/thresholds.ts`.

## A bar belongs to a strategy

Every vote is decided by a strategy, and each strategy carries its bar:

| Strategy          | Bar            | Passes when                                                 |
| ----------------- | -------------- | ----------------------------------------------------------- |
| `simple_majority` | 0.5            | approvals are more than half of the decided votes           |
| `supermajority`   | 2/3            | approvals are at least two thirds of the decided votes      |
| `unanimous`       | 1.0            | nobody rejects and at least one voter approves              |
| `higher_order`    | 0.5 (reported) | approvals lead rejections by at least 10 points (see below) |

`simple_majority` is the default. The bar for `supermajority` is exactly two
thirds, so two approvals out of three pass.

The consensus tool also accepts a `threshold` field, but it is a legacy input.
When you pass a `strategy`, the strategy's own bar applies and `threshold` is
ignored: `strategy: "higher_order"` with `threshold: "supermajority"` is decided
as `higher_order`, not at two thirds. The result's `threshold` field names the
bar that was actually applied, not the one that was asked for. If you need a
stricter bar, the way to ask for it is to name the strategy that carries it.

### Why `higher_order` is not a stricter bar

The name suggests something more demanding than a majority. It is not. Its
decision is a plain count of approvals against rejections; the correlation
analysis it performs is reported alongside the result but does not change it.
The count must show a margin: if the approval share and the rejection share
are within 10 percentage points of each other, the outcome is "no consensus",
which is reported as not approved. In practice a `higher_order` vote passes at
55% or more of the decided votes, so 5–4 passes and 6–5 does not. Its reported
bar is still 0.5.

What `higher_order` adds is escalation. In a quick three-voter vote that comes
back approved, a low approval share, or a confident rejection from a separate
contrarian check, re-runs the vote with the full seven-voter panel, and that
result replaces the quick one. The contrarian check also runs under other
strategies; the low-share trigger is specific to `higher_order`. Choose it when
you want a narrow quick approval to be challenged, not when you want a higher
bar.

## Who counts in the denominator

The share that is compared with the bar is

```text
approvals / (approvals + rejections)
```

Abstentions are not in it. A voter who abstains neither helps nor hurts the
proposal. A voter whose call failed (timed out, returned nothing readable, or
had no working CLI) is an errored seat, and by default it is dropped before
counting, so it is not in the denominator either.

This has a consequence worth keeping in mind when you read a result. With a
full seven-voter panel, supermajority needs five approvals. If two seats error,
four approvals out of the five who answered also clears two thirds. The
approval percentage alone does not tell you how many voters answered; the vote
counts in the result do.

Two floors stop a thin panel from approving anything:

- **Respondent floor.** An approval needs enough voters who actually approved
  or rejected: five of a seven-voter panel, and all three of a quick panel.
  Below that, a would-be approval becomes `no_quorum`. A rejection by fewer
  voters still stands.
- **Error floor.** If more than half the panel errors, the vote is void
  whatever the policy.

If no voter approves or rejects at all (everyone abstained), the result is
`rejected` with the reason "No votes cast", not a 50% split. If every voter
errored, the tool returns an error instead of a result.

## Error policies

`errorPolicy` decides what an errored seat does to the result:

| Policy               | Errored seat becomes                   | Default for            |
| -------------------- | -------------------------------------- | ---------------------- |
| `reduce_denominator` | dropped before counting                | every strategy but one |
| `count_as_abstain`   | an abstention                          | none                   |
| `fail_closed`        | voids the vote (`no_quorum`)           | `unanimous`            |
| `absolute_quorum`    | `no_quorum` unless every seat answered | none (opt-in)          |

`absolute_quorum` is the strictest. Any errored, unreadable or missing seat
turns an approval into `no_quorum` with a reason telling you to re-run, and an
approval must also reach the bar measured against the whole requested panel,
not only against those who answered. A clean rejection still stands. Use it
when the record has to show that the full panel looked at the proposal, which
is why nexus-agents requires it for votes that ratify changes to its own
governance rules.

The difference between the policies is the difference between "most of the
panel that answered agreed" and "the panel agreed". Neither is wrong; they
answer different questions.

## `no_quorum` is not a rejection

`no_quorum` means the vote could not reach a verdict: too few voters answered,
an error policy voided it, or `absolute_quorum` was not met. It says nothing
about the proposal's merit. The usual next step is to fix whatever stopped the
voters (authentication, quota, a timeout) and vote again. A `rejected` result,
by contrast, is a verdict: enough voters answered and the proposal did not
reach its bar.

## Votes over named options

A proposal can declare its alternatives with `options` (two to ten labels; on
the command line, `--option`). Approving voters then also pick one option. The
vote first reaches its ordinary approve/reject result. Then the approvers'
picks are counted, and the leading option must itself clear the strategy's bar
among the approvers: more than half for a majority, two thirds for
supermajority, all of them for unanimous. A tie between options is broken
alphabetically by label.

Declaring options matters because without them a split looks like agreement.
If three voters approve option A and three approve option B, an undeclared
vote records six approvals and a confident "approved". A declared vote records
that no option reached its bar, reports the split in `optionOutcome`, and does
not approve. When the proposal reads like a choice between alternatives and
`options` is missing, the result carries a `panelWarning` but the vote still
runs.

## What is recorded

Each completed live vote is appended to a vote ledger,
`governance/vote-records.jsonl` inside the nexus-agents data directory
(`<repo>/.nexus-agents/` when you work in a repository, otherwise
`~/.nexus-agents/`). The `NEXUS_VOTE_RECORDS_PATH` environment variable moves
it. A record holds the proposal, the strategy, the decision, the
approval percentage, the vote counts, each voter's decision and rationale, the
error policy that was applied, and a SHA-256 hash over its own content. The
result tells you whether the write succeeded in `voteRecordPersisted`; when it
is `false`, `voteRecordNote` says why (for example an empty panel or a failed
write). Simulated votes are not recorded.

Each record is hashed on its own; the records are not linked into a chain. The
hash-chained audit log that `verify_audit_chain` checks is a separate log, and
the vote path does not write the vote record into it. To review past votes,
read the ledger.

## Related

- [Consensus protocols](./CONSENSUS_PROTOCOLS.md): the algorithms in more depth.
- [Your first run](../getting-started/YOUR_FIRST_RUN.md): run a live vote
  through the `run` tool.
- [Audit hash-chain threat model](../security/audit-hash-chain-threat-model.md):
  what the audit chain does and does not protect.
