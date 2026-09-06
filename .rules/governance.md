---
paths: ['**/*']
description: Voting thresholds, refactor gates, fitness audit, architecture/security supermajority requirements
---

# Governance Rules

<!-- CANONICAL SOURCE: CLAUDE.md Governance Framework -->

Quick reference for governance enforcement. Loaded when working on architecture, CI, or structural changes.

## Consensus Voting Triggers

**Pass the bar as the `strategy`.** `strategy` discards `threshold`:
`resolveStrategy` (`mcp/tools/consensus-vote.ts`) returns `input.strategy`
whenever it is set, so `{ threshold: 'supermajority', strategy: 'higher_order' }`
runs at `higher_order`'s bar — which is **0.5** (`VOTING_THRESHOLDS` in
`consensus/types-core.ts`). This table used to prescribe exactly that pairing,
which made the architecture and security rows a simple majority (#5315, #5344).

| Trigger                   | Pass this `strategy` | Bar   | Agents |
| ------------------------- | -------------------- | ----- | ------ |
| Architecture changes      | `supermajority`      | 0.667 | 5      |
| Breaking API changes      | `unanimous`          | 1.0   | 5      |
| Security-related changes  | `supermajority`      | 0.667 | 5      |
| Sprint planning decisions | `simple_majority`    | 0.5   | 3      |
| Feature prioritization    | `simple_majority`    | 0.5   | 5      |

Overlapping triggers → use STRICTEST. Order: `unanimous > supermajority > majority`.

**What the bar is measured over.** Voters who cast approve or reject. Abstentions
and errored seats leave the denominator, so supermajority is 5 of 7 when the whole
panel answers and 4 of 5 when two seats are missing. `panelCoverage` on the vote
record names the errored roles (#5738), and an errored seat is retried once before
the tally (#5578).

**Governor-path ratification votes must pass `errorPolicy: 'absolute_quorum'`**, so
a degraded panel cannot ratify a change to the governance substrate — `.rules/`,
`AGENTS.md`/`CLAUDE.md`, `src/audit/`, `src/governance/`, the drift-injection
machinery, voter configuration and `CODEOWNERS`. Decided by panel on #5344,
option (c), 5 of 6.

**When to choose `higher_order`:** for its contrarian-escalation behaviour, never
for a stricter verdict. It does not aggregate by correlation weight either — the
verdict is a plain tally and the Bayesian analysis feeds escalation only (#4701).

```bash
# Architecture/security votes — the BAR is the strategy
nexus-agents vote --proposal "..." --strategy supermajority

# Routine decisions
nexus-agents vote --proposal "..." --strategy simple_majority --quick
```

## Refactor Threshold

Refactoring must pass a **≥3 "yes" decision gate**:

1. Does this improve clarity?
2. Does this improve testability?
3. Does this improve separation of concerns?
4. Does this reduce coupling?
5. Does this reduce cognitive load?

**If fewer than 3 "yes" → Do NOT refactor.**

Preserve: files 400-600 lines if cohesive, functions 50-90 lines if clear, clear linear workflows. Optimize for **clarity and intent**, not line counts.

## Fitness Audit

The bar is the `fitness-gate` action's default — `.github/actions/fitness-gate/action.yml` — and both the PR gate and the release gate inherit it rather than passing their own number (#5142). It is **90** today; change it there, and only there. Read the current score from the gate's own output (`nexus-agents fitness-audit --format=json`), never from a number copied into this file — the previous "(current: 97/100)" here was stale in both directions at once.

```bash
nexus-agents fitness-audit
nexus-agents fitness-audit --format=json
```

| Dimension               | Max | Description                        |
| ----------------------- | --- | ---------------------------------- |
| `canonicalPaths`        | 20  | Penalizes duplicate workflow paths |
| `explicitBehavior`      | 15  | Penalizes undocumented behavior    |
| `determinism`           | 15  | Rewards predictable execution      |
| `observability`         | 15  | Rewards telemetry coverage         |
| `configSimplicity`      | 10  | Penalizes config surface area      |
| `layerSeparation`       | 10  | Penalizes cross-layer coupling     |
| `operatorErgonomics`    | 10  | Rewards CLI usability              |
| `governanceIntegration` | 5   | Rewards policy enforcement         |

## Documentation Governance

**Canonical Index:** [docs/README.md](../../docs/README.md) — single source of truth for all docs.

Rules:

1. Consult index before answering documentation questions
2. Update index when documentation changes
3. New docs must be indexed to be valid
4. No parallel indexes permitted
5. All docs must have status: Canonical/Supporting/Deprecated

## Governance Version Tracking

Update CLAUDE.md governance version when: adding governance rules, modifying canonical paths, changing voting thresholds, updating fitness requirements.
