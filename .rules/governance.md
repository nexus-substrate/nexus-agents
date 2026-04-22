# Governance Rules

<!-- CANONICAL SOURCE: CLAUDE.md Governance Framework -->

Quick reference for governance enforcement. Loaded when working on architecture, CI, or structural changes.

## Consensus Voting Triggers

| Trigger                   | Threshold     | Agents | Strategy        |
| ------------------------- | ------------- | ------ | --------------- |
| Architecture changes      | supermajority | 5      | higher_order    |
| Breaking API changes      | unanimous     | 5      | higher_order    |
| Security-related changes  | supermajority | 5      | higher_order    |
| Sprint planning decisions | majority      | 3      | simple_majority |
| Feature prioritization    | majority      | 5      | simple_majority |

Overlapping triggers → use STRICTEST. Order: `unanimous > supermajority > majority`.

**Strategy guidance:** Use `higher_order` (Bayesian correlation-aware aggregation) for architecture and security votes where correlated agent agreement is a risk. Use `simple_majority` for routine decisions. The `higher_order` strategy deweights correlated votes and applies Bayesian confidence calibration.

```bash
# Architecture/security votes — use higher_order strategy
nexus-agents vote --proposal "..." --threshold supermajority --strategy higher_order

# Routine decisions — simple majority is sufficient
nexus-agents vote --proposal "..." --threshold majority --quick
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

Target: **90+/100** (current: 97/100). Releases MUST have fitness score ≥ 90.

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
