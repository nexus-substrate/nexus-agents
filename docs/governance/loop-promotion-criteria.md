---
title: 'Loop Promotion Criteria'
description: Per-loop authority-ladder promotion/demotion criteria — the concrete evidence (evalN, precision/recall, soak, ratification) each loop needs to move between tiers, grounded in ADR-0017's evidence-threshold schema
tier: 3
keywords:
  [
    authority,
    ladder,
    promotion,
    criteria,
    demotion,
    evidence,
    ratification,
    loops,
    governance,
    tune,
    auto-remediation,
    knn,
    clawguard,
  ]
---

# Loop Promotion Criteria

**Status:** Active
**Epic:** Epic D — Authority ladder ([#3839](https://github.com/nexus-substrate/nexus-agents/issues/3839)), milestone M3
**Issue:** [#3844](https://github.com/nexus-substrate/nexus-agents/issues/3844)
**Grounded in:** [ADR-0017: Authority Ladder](../adr/0017-authority-ladder.md) §"Evidence-Threshold Schema"

Per [ADR-0017](../adr/0017-authority-ladder.md), a loop moves **up** the ladder
(`observe → suggest → advisory → enforce`) only by satisfying a concrete,
machine-checkable **evidence threshold** AND a recorded **human ratification**
(`consensus_vote`, `higher_order`) — never by a default flip, never as a batch. A
loop moves **down** the ladder **automatically** on evidence regression; demotion
needs no ratification (the safety asymmetry).

This page is the per-loop companion to the ADR's repo-wide schema. For each
ladder-resident loop it states: the **promotion metric**, **where it is measured**,
the **threshold** (at or above the ADR-0017 per-tier floor — a loop may set
**stricter**, never looser), and the **demotion triggers**. Where a loop carries a
declared current tier, see the registries:

- Strategy-manifest tiers: [`governance/strategy-manifests.yaml`](../../governance/strategy-manifests.yaml)
- Non-strategy loop tiers (#3843): [`governance/loop-tiers.yaml`](../../governance/loop-tiers.yaml)

## The ADR-0017 per-tier floors (the repo-wide minimum)

A loop's criterion below NEVER loosens these; it only sets the loop-specific metric
and any **stricter** bound.

| Promotion          | `evalN` floor | `soakDuration` floor | Precision / Recall                                | Ratification |
| ------------------ | ------------- | -------------------- | ------------------------------------------------- | ------------ |
| observe → suggest  | ≥ 30          | ≥ P7D                | n/a (output is inert)                             | required     |
| suggest → advisory | ≥ 50          | ≥ P14D               | precision ≥ 0.80 on judged output                 | required     |
| advisory → enforce | ≥ 100         | ≥ P30D               | precision ≥ 0.90 AND recall ≥ 0.80 (action class) | required     |

The evidence record each promotion is earned against is the
`PromotionEvidence` tuple (`strategy-manifest.ts`), recorded in
[`governance/authority-tier-evidence.yaml`](../../governance/authority-tier-evidence.yaml),
and the ratification vote is recorded in
[`governance/ratification-votes.yaml`](../../governance/ratification-votes.yaml).
The CI gate (`scripts/check-authority-tier-drift.ts`, under `governance:check`)
fails any promotion that lacks a floor-meeting record + an approved,
`higher_order`, subject-matching ratification vote.

---

## tune loop — `enforce` (bounded). Criterion: what would DEMOTE it.

**Current tier:** `enforce`, bounded — declared in `governance/loop-tiers.yaml` as a
**pre-existing** bounded loop (default-ON since v2.96, [#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323)),
NOT a ladder promotion. Its authority is justified by its **safety envelope**, not a
promotion-evidence record.

The tune loop is already at the top of the ladder, so the governing question is
**demotion**, not promotion (ADR-0017: demotion is automatic on regression).

- **Safety envelope (the enforce bounds):** demotion-only (multiplier ≤ 1.0), floor
  `0.5` (`TUNE_DEMOTION_FLOOR`), per-step cap `0.2` (`TUNE_MAX_STEP`), 30-minute
  linear decay (`TUNE_DECAY_WINDOW_MS`) — `packages/nexus-agents/src/core/tune-adjustment-store.ts`.
- **Demotion triggers (automatic, no ratification):**
  - **Envelope breach** — any adjustment computed outside `[0.5, 1.0]`, exceeding the
    `0.2` step cap, or failing to decay. A breach demotes the loop to `advisory`
    (shadow-log only) and is recorded as a `demotion` audit event.
  - **Operator opt-out** — `NEXUS_TUNE_ENFORCE=false` reverts the whole loop to
    shadow; the loop is then effectively `observe`/`suggest` (logs intent, mutates
    nothing).
  - **Regression on the routed outcome** — if a demotion the loop applied correlates
    with a _worse_ downstream success rate (the multiplier hurt routing), the
    monitored metric regresses and the loop demotes one tier.
- **Re-promotion** — back to `enforce` from a demotion follows the full
  `advisory → enforce` floor (evalN ≥ 100, soak ≥ P30D, precision ≥ 0.90, recall ≥
  0.80) + ratification, since re-earning authority is a promotion like any other.
- **Measurement surface:** the `tune.demote` / `tune.reversal` tamper-evident audit
  records (#3323) are the demotion evidence; the routed-outcome correlation is read
  from the `OutcomeStore`.

---

## auto-remediation — audit → `enforce`. Criterion restated per the ADR schema.

**Promotion case:** [#3769](https://github.com/nexus-substrate/nexus-agents/issues/3769)
(absorbed into the epic). This is the ADR's **worked example 1** — the canonical
`advisory → enforce` case the ladder formalizes.

- **Promotion metric:** the **would-block rate** — the share of audited remediations
  that _would have blocked_ had `enforce` been live.
- **Measured where:** the #3727 would-block-rate **denominator** (the soak surface
  that counts audited remediations and their would-block verdicts);
  `evaluateEnforceReadiness` consumes it.
- **Threshold (at the advisory → enforce floor):**
  - `evalN ≥ 100` judged remediations,
  - would-block rate **below threshold T** with a CI that **excludes T** (stable +
    significant),
  - `precision ≥ 0.90` AND `recall ≥ 0.80` on the remediation verdict,
  - `soakDuration ≥ P30D` in `audit` with **no operator intervention**,
  - `evaluateEnforceReadiness` returns `ready: true` against this evidence,
  - a recorded `higher_order` ratification `consensus_vote` (the epic's
    circuit-breaker re-vote).
- **Demotion triggers:** would-block rate rises back above T (CI no longer excludes
  T), or precision/recall fall below the enforce floor → automatic demotion to
  `audit`/`advisory`. Per #3769 the raw default is **never** flipped to `enforce`;
  enforce stays earned per-readiness.

---

## KNN research-maturity weighting — promotion gated on measured lift.

**Promotion case:** [#3815](https://github.com/nexus-substrate/nexus-agents/issues/3815)
(absorbed). This is the ADR's **worked example 2** — "promotion gated on measured
lift, controlled for the obvious confounder."

- **Promotion metric:** the **similarity-controlled success-rate lift** — the
  `successRate` delta across research-maturity buckets, **controlling for
  task-vector similarity** (so it measures maturity, not topic novelty).
- **Measured where:** `getResearchMaturityReport` (#3234's measurement surface).
- **Threshold:**
  - `controlledFor` **MUST include** `task-vector-similarity` (the confounder #3815
    calls out: maturity is plausibly confounded with task-novelty),
  - `primaryMetric` = success-rate lift that is **stable and significant** (CI
    excludes zero) across maturity buckets,
  - `evalN` and `soakDuration` at the target-tier floor,
  - a recorded ratification vote.
- **Kill-option / demotion:** if the report shows **no** stable, significant delta,
  the signal is noise and the loop is **never promoted** (the kill-option wins). If a
  promoted weighting later loses its lift (CI re-admits zero), it demotes
  automatically.

---

## learned selection rules — advisory → `enforce`. Criterion: beat the incumbent.

**Promotion case:** [#3552](https://github.com/nexus-substrate/nexus-agents/issues/3552)
(absorbed; was #3548 step 4). Canonical `advisory → enforce` promotion gated on a
**measured win over the hand-written rules** (MetaOrchestrator step 4).

- **Promotion metric:** the **routing-decision win rate** of the learned selector vs
  the hand-written rules on a head-to-head, judged decision set — the learned rules
  must **beat** (not merely match) the incumbent.
- **Measured where:** the routing-outcome surface (`OutcomeStore` /
  LinUCB-bandit reward signal — exploration-floor guaranteed by the UCB
  `expectedReward + α·uncertainty`, α = 1.0, so the learned arm always accrues the
  evidence its promotion needs; `cli-adapters/linucb-bandit.ts:130-136`).
- **Threshold (at the advisory → enforce floor):**
  - `evalN ≥ 100` judged routing decisions,
  - win-rate delta vs the incumbent **stable and significant** (CI excludes zero,
    favouring the learned rules),
  - `precision ≥ 0.90` AND `recall ≥ 0.80` on the selection verdict,
  - `soakDuration ≥ P30D`,
  - a recorded ratification vote.
- **Demotion triggers:** the learned selector's win-rate delta regresses to or below
  zero (the incumbent catches up or wins) → automatic demotion to `advisory`
  (learned rules become a non-binding voice again).

---

## ClawGuard — audit → `enforce`. Criterion: recall is load-bearing.

**Promotion case:** [#2077](https://github.com/nexus-substrate/nexus-agents/issues/2077)
(absorbed). A **security-gate** loop, so the `recall ≥ 0.80` requirement (missed-action
cost) is the load-bearing threshold — a missed block is more costly than a false one.

- **Promotion metric:** the **block-decision precision AND recall** on a judged set of
  security events over a **bake period**.
- **Measured where:** the ClawGuard audit log (the `audit`-tier verdicts accumulated
  during the bake), judged against the ground-truth label of each event.
- **Threshold (at the advisory → enforce floor, recall load-bearing):**
  - `evalN ≥ 100` judged security events,
  - `recall ≥ 0.80` — **the binding constraint** (missed-action cost dominates),
  - `precision ≥ 0.90` (a false block has cost too, but recall governs),
  - `soakDuration ≥ P30D` bake in `audit` with no operator intervention,
  - a recorded ratification vote.
- **Demotion triggers:** recall drops below `0.80` (a missed block class appears) →
  automatic, **immediate** demotion to `audit` (a security gate fails safe by ceasing
  to block, not by blocking wrongly).

---

## pr_review — criterion owned by Epic E.

**Current tier:** `advisory` (wraps consensus, never blocks merge) — declared in
`governance/loop-tiers.yaml`.

pr_review's promotion criterion is **owned by Epic E** and is intentionally **not
duplicated here** (#3844 out-of-scope). When Epic E lands the criterion, link it from
this section rather than restating the threshold, so there is a single source of
truth for pr_review's promotion bar.

- See: Epic E (pr_review promotion criterion). Until then, pr_review stays `advisory`
  — its votes influence a PR but never gate merge, and no promotion record exists.

---

## How a promotion lands (the mechanical checklist)

1. Accumulate the evidence at the lower tier (soak; the exploration floor guarantees
   the denominator never collapses — ADR-0017 §"Anti-Degenerate-Loop Guarantees").
2. Record the `PromotionEvidence` tuple in
   [`governance/authority-tier-evidence.yaml`](../../governance/authority-tier-evidence.yaml)
   meeting the floor for the target tier (and any stricter bound stated above).
3. Hold the `higher_order` ratification `consensus_vote`; record it in
   [`governance/ratification-votes.yaml`](../../governance/ratification-votes.yaml).
4. Emit the `promotion` tier-transition audit event linking the ratification vote
   ref (ADR-0017 §"Transition Rules").
5. Change the loop's declared tier (manifest or `governance/loop-tiers.yaml`) **one
   step up** in its **own** unbundled PR.
6. `pnpm governance:check` (the authority-tier gate) must stay green — it fails a
   promotion missing evidence, an unresolved/unapproved ratification ref, or a
   more-than-one-step move.

## References

- [ADR-0017: Authority Ladder](../adr/0017-authority-ladder.md) — the evidence-threshold schema this page instantiates
- [`governance/loop-tiers.yaml`](../../governance/loop-tiers.yaml) — the four un-issued loops' declared tiers (#3843)
- [`governance/authority-tier-evidence.yaml`](../../governance/authority-tier-evidence.yaml) — the promotion-evidence ledger
- [`governance/ratification-votes.yaml`](../../governance/ratification-votes.yaml) — the ratification-vote ledger
- Absorbed promotion cases: [#3552](https://github.com/nexus-substrate/nexus-agents/issues/3552), [#3769](https://github.com/nexus-substrate/nexus-agents/issues/3769), [#3815](https://github.com/nexus-substrate/nexus-agents/issues/3815), [#2077](https://github.com/nexus-substrate/nexus-agents/issues/2077)
