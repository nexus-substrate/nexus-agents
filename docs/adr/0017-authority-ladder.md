---
title: 'ADR 0017: Authority Ladder'
description: Four-tier earned-autonomy model (observe → suggest → advisory → enforce) with a machine-checkable evidence-threshold schema and ratification-linked promotion
tier: 3
keywords:
  [authority, ladder, autonomy, governance, tiers, evidence, ratification, promotion, demotion, adr]
---

# ADR 0017: Authority Ladder

**Status:** Accepted
**Date:** 2026-06-16
**Context:** Epic D — Authority ladder (#3839), milestone M3 "Earned Autonomy"
**Ratification:** `consensus_vote` strategy=`higher_order`, **APPROVED 7/7 (100%)**, dogfooded 2026-06-09 (#3839)

## Decision

Every automated behavior ("loop") in nexus-agents declares **how much authority its
output carries** as a first-class, machine-readable property: its **authority
tier**. There are exactly four tiers, ordered least→most authoritative:

`observe` → `suggest` → `advisory` → `enforce`

A loop moves **up** the ladder only by satisfying a concrete, machine-checkable
**evidence threshold** AND a recorded **human ratification** (`consensus_vote`) —
never by a default flip and never as a batch. A loop moves **down** the ladder
**automatically** on evidence regression. Every tier transition is an audit event,
and a promotion audit event is **invalid without a linked ratification vote**.

This ADR formalizes the semantics of the `authorityTier` field already carried by
the strategy manifest schema (`packages/nexus-agents/src/orchestration/strategy-manifest.ts`).
It is the human-readable contract; #3841 made it machine-enforced (router refusal
plus CI gate) and #3842 wired the tier-transition audit events + ratification gate —
both are now shipped (see [Implemented](#implemented)).

## Context

The codebase already practices a ladder implicitly — loops sit at different
authority levels with hand-rolled guards — but the level is encoded in scattered
defaults and prose, not in a single declared field with a gate behind it. Without
a machine consumer, a declared tier is (per the ratification panel's Contrarian)
"documentation dressed as architecture": nothing stops a loop from acting above
its evidence, and nothing forces a promotion to be earned.

The pattern is observable today:

| Loop                     | Implicit tier today                        | Evidence                                          |
| ------------------------ | ------------------------------------------ | ------------------------------------------------- |
| `suggest_research_tasks` | suggest (read-only by contract)            | `suggest-research-tasks-tool.ts:1-18`             |
| `improvement_review`     | suggest (`fileIssues=false`, rate-cap 5)   | `improvement-review.ts:62-68`                     |
| `pr_review`              | advisory (wraps consensus, never blocks)   | tool-prerequisites middleware                     |
| auto-remediation         | suggest/audit (zero writes default)        | `auto-remediate-command.ts:25-35`, #3769 / #3653  |
| tune loop                | enforce, bounded (floor 0.5, decay 30 min) | `tune-stage.ts`, `tune-adjustment-store.ts:31-35` |

Epic C (#3833) landed the `authorityTier` field on the manifest as forward-compat.
This ADR (Epic D) supplies its semantics, the evidence schema that gates movement
between tiers, and the transition rules. The panel that ratified the model (7/7)
recorded three conditions that are binding here:

- **Contrarian:** the tier field MUST have a machine consumer (router/CI), the
  promotion-ratification invariant MUST be machine-enforced, and per-loop migration
  MUST be unbundled into discrete issues.
- **DevEx/Architect:** the ADR MUST pin the evidence-threshold schema concretely;
  per-loop migration = independently landable PRs.
- **Scope Steward:** Epic D is documentation + enforcement of EXISTING tiers — no
  behavior changes smuggled in under "migration".

## The Four Tiers

Each tier defines what a loop **may do** and where it is **gated**. The ordering is
the enum order in `AuthorityTierSchema`; "above" means more authoritative.

### `observe`

- **May do:** emit telemetry, metrics, traces, and memory writes that are signal
  only. Produces no proposal, no issue, no vote, no action.
- **Gated at:** any attempt to surface a recommendation or take action. An `observe`
  loop that wants to recommend must first be promoted to `suggest`.
- **Example:** a soak-measurement collector that records a would-block rate but never
  blocks (the denominator-building phase of #3769).

### `suggest`

- **May do:** produce a recommendation that a human or the governor must approve
  before any action — file an issue, open a PR draft, surface a recommendation in a
  report. Output is inert until a human acts on it.
- **Gated at:** writing to a governed surface or casting a binding vote. A `suggest`
  loop that files issues does so rate-capped and behind an explicit `fileIssues`
  opt-in (cf. `improvement_review`, `fileIssues=false` default).
- **Example:** `suggest_research_tasks` (read-only by contract), `improvement_review`.

### `advisory`

- **May do:** participate in a decision as a non-blocking voice — cast a vote, add a
  weighted score, annotate a PR — in **low-stakes** paths. Its output influences but
  never unilaterally decides; it never blocks merge or deploy.
- **Gated at:** high-stakes paths (anything that blocks or mutates a protected
  resource), where its vote is recorded but cannot be decisive without an `enforce`
  authority or human in the loop.
- **Example:** `pr_review` (wraps consensus, never blocks merge).

### `enforce`

- **May do:** take governed action directly — block, mutate, gate, or auto-apply —
  within its declared, bounded envelope.
- **Gated at:** the envelope itself. An `enforce` loop MUST ship with explicit bounds
  (e.g. the tune loop's exploration floor 0.5, 0.2-step cap, 30-minute decay) and is
  subject to **automatic demotion** on regression. Reaching `enforce` requires the
  full evidence threshold **plus** ratification; it is never a default.
- **Example:** the tune loop (bounded auto-adjustment); the promotion target that
  #3552, #3769, and #2077 each gate into.

## Evidence-Threshold Schema

Promotion is earned against a concrete, machine-checkable evidence record. The schema
below is what #3841's CI gate validates against the manifest and the audit log. It is
deliberately small and quantitative so a gate — not a reviewer's judgment — decides
whether a threshold is met.

A promotion-evidence record is the tuple:

- `loopId` (string) — the loop being promoted (manifest `id` or loop identifier).
- `fromTier` (AuthorityTier) — current tier.
- `toTier` (AuthorityTier) — target tier; must be exactly one step up.
- `evalN` (integer) — number of independent, judged evaluations behind the metric.
  Floor per target tier (below).
- `precision` (number, 0–1) — required when the loop's action class produces a
  precision-bearing verdict.
- `recall` (number, 0–1) — required when missed-action cost dominates (e.g.
  security-gate loops).
- `primaryMetric` (`{name, value, ci}`) — the loop-specific promotion metric, its
  value, and a confidence interval. Must be **stable** (CI excludes the null) and
  **significant**.
- `soakDuration` (ISO-8601 duration) — wall-clock soak at the lower tier with no
  operator intervention. Floor per target tier (below).
- `controlledFor` (string[]) — confounders the `primaryMetric` controls for (e.g.
  task-vector similarity). Required when stated by the loop's promotion-criteria
  doc (#3844).
- `ratificationVote` (consensus_vote ref) — the recorded `consensus_vote` that
  ratifies this promotion (see Transition Rules). Required for ANY promotion.
- `evidenceUri` (string) — link to the measurement surface / report that produced
  the numbers.

### Per-tier promotion floors

The floors below are the **minimum** a gate enforces; a loop's own promotion-criteria
doc (#3844) may set stricter thresholds, never looser ones.

| Promotion          | `evalN` floor | `soakDuration` floor | Precision/Recall                                  | Ratification |
| ------------------ | ------------- | -------------------- | ------------------------------------------------- | ------------ |
| observe → suggest  | ≥ 30          | ≥ P7D                | n/a (output is inert)                             | required     |
| suggest → advisory | ≥ 50          | ≥ P14D               | precision ≥ 0.80 on judged output                 | required     |
| advisory → enforce | ≥ 100         | ≥ P30D               | precision ≥ 0.90 AND recall ≥ 0.80 (action class) | required     |

`evalN` floors rise with authority because a higher tier acts on more of its own
output; the `enforce` floor is deliberately high because an `enforce` loop's mistakes
are not caught by a downstream human. All three promotions require a recorded
ratification vote — there is no "automatic" promotion at any rung.

### Worked example 1 — auto-remediation audit → enforce (#3769)

The promotion metric is the **would-block rate** measured over the soak window via
the #3727 would-block-rate denominator (the share of audited remediations that would
have blocked had `enforce` been live). Promotion `advisory → enforce` is gated on:

- `evalN ≥ 100` judged remediations,
- would-block rate below threshold **T** with a CI that excludes T,
- `precision ≥ 0.90` AND `recall ≥ 0.80` on the remediation verdict,
- `soakDuration ≥ P30D` in `audit` with no operator intervention,
- `evaluateEnforceReadiness` returning `ready: true` against this evidence,
- a recorded ratification `consensus_vote` (the epic's circuit-breaker re-vote).

Per #3769 the raw default is **never** flipped to `enforce`; enforce stays earned
per-readiness. This is the canonical advisory→enforce case the ladder formalizes.

### Worked example 2 — KNN research-maturity weighting (#3815)

The promotion metric is the **similarity-controlled success-rate lift**: the
`successRate` delta across research-maturity buckets, **controlling for task-vector
similarity** (so it is not re-measuring topic), from #3234's measurement surface
(`getResearchMaturityReport`). Promotion is gated on:

- `controlledFor` MUST include `task-vector-similarity` (the confounder #3815 calls
  out: maturity is plausibly confounded with task-novelty),
- `primaryMetric` = success-rate lift that is **stable and significant** (CI excludes
  zero) across maturity buckets,
- `evalN` and `soakDuration` at the target-tier floor,
- a recorded ratification vote.

If the report shows no stable, significant delta, the signal is noise and the loop is
**never promoted** — the kill-option wins. This is the canonical "promotion gated on
measured lift, controlled for the obvious confounder" case.

## Transition Rules

### Promotions are ratification-linked

A promotion is valid only if its audit event carries a link to a recorded
`consensus_vote` that ratifies it. This is the machine-enforced invariant the panel's
Contrarian required: #3842's gate **fails when a tier-transition audit event of kind
`promotion` lacks a linked ratification vote**. A default flip — changing a loop's
declared tier without an evidence record and a ratification — is not a valid
transition and the CI gate rejects the manifest change (#3841).

### Promotions are unbundled, per-loop

Each loop migrates up the ladder on **its own evidence**, in its **own** independently
landable PR. There is no batch promotion. The per-loop migration issues (#3843 for the
four un-issued loops; #3844 for per-loop promotion-criteria docs) and the absorbed
live cases (below) are each discrete. A PR that promotes more than one loop, or that
promotes a loop without its evidence record, is out of contract.

### Demotion is automatic on regression

Unlike promotion, **demotion does not require ratification** and SHOULD be automatic.
When a loop's monitored `primaryMetric` regresses past its demotion threshold (e.g.
precision drops below the tier floor, or the bounded envelope is breached), the loop
is demoted one tier and the demotion is recorded as an audit event. Automatic demotion
is the safety asymmetry: it is always easier to lose authority than to gain it.

### All transitions are audit events

Every promotion and demotion is an audit event (kind `promotion` | `demotion`) with
the loop id, from/to tiers, the evidence record (promotions), and — for promotions —
the linked ratification vote. The audit log is the source of truth for a loop's tier
history; the manifest carries the _current_ tier.

## Anti-Degenerate-Loop Guarantees

An earned-autonomy ladder is only safe if a loop cannot starve itself of the evidence
it needs to be evaluated, and if authority can never be silently _removed_ without the
same ratification rigor as granting it.

- **Exploration floor.** The routing bandit's UCB score is
  `expectedReward + α·uncertainty` (α = 1.0) — see
  `packages/nexus-agents/src/cli-adapters/linucb-bandit.ts:130-136`. Low-pull arms
  carry high uncertainty, so they retain a guaranteed share of exploration traffic.
  A loop can therefore always accumulate the evaluations its promotion threshold
  needs; the ladder never lets a loop's evidence denominator collapse to zero.
- **Never-autonomous removal.** Capability removal is never autonomous. Epic F's tool
  pruning routes every removal through **this** ADR's ratification path — a removal is
  treated like a tier transition and requires a recorded `consensus_vote`. No loop can
  unilaterally remove a capability (its own or another's).

## Mapping to the Manifest `authorityTier` Field

The contract above is realized through the manifest field:

- **Source of truth (current tier).** A loop's _current_ authority tier is the
  `authorityTier` value on its strategy manifest
  (`AuthorityTierSchema = z.enum(['observe','suggest','advisory','enforce'])`,
  `packages/nexus-agents/src/orchestration/strategy-manifest.ts`). The field is
  optional in the schema today (forward-compat from Epic C); #3843 will make it explicit
  for every loop, and #3841 made it **required** at enforcement time.
- **Router refusal (#3841 — shipped).** The MetaOrchestrator router consumes
  `authorityTier` via `guardAuthority` (`authority-tier-guard.ts`, wired into
  `meta-orchestrator.ts`): it refuses to let a loop's output take an action above its
  declared tier. An `advisory` loop attempting an `enforce`-class action is refused at
  the router, not caught after the fact. This is the machine consumer the ratification
  panel required.
- **CI gate (#3841 — shipped, `check-authority-tier-drift.ts`).** A CI check validates, on every PR that changes a manifest's
  `authorityTier`, that (a) the change is at most one tier and in a valid direction,
  (b) a promotion is backed by an evidence record meeting the per-tier floor, and
  (c) a promotion's tier-transition audit event links a ratification `consensus_vote`
  (the invariant enforced jointly with #3842). A manifest diff that promotes without
  evidence + ratification fails the gate.

## Absorbed Live Cases

The ladder formalizes loops that already exist as open promotion/ratification cases.
Each is an unbundled, per-loop migration governed by this ADR — not new behavior:

- **#3552** — learned selection rules → `enforce` once they beat the hand-written
  rules (MetaOrchestrator step 4). Canonical advisory→enforce promotion gated on a
  measured win over the incumbent.
- **#3769** — auto-remediation audit → `enforce` after soak (worked example 1). Soak
  evidence accumulates via #3727's would-block-rate denominator; enforce stays earned
  per `evaluateEnforceReadiness`.
- **#3815** — KNN research-maturity weighting (worked example 2). Promotion gated on a
  similarity-controlled, stable, significant success-rate lift; kill-option if none.
- **#2077** — ClawGuard audit → `enforce` after a bake period. Security-gate loop
  where the `recall ≥ 0.80` requirement (missed-action cost) is load-bearing.
- **#3697** — policy-gate escalate → HITL interrupt at the stage boundary. The
  human-ratification machinery the ladder leans on at stage boundaries.

## Consequences

### Positive

- A loop's authority is a single declared, machine-readable field with a gate behind
  it — not scattered defaults. The Contrarian's "documentation dressed as
  architecture" failure mode is closed by #3841/#3842.
- Promotion is earned and auditable: evidence floor + ratification + audit event.
  Nobody can grant a loop `enforce` by editing a default.
- Demotion is automatic, so the system fails safe under regression.
- Per-loop, unbundled migration keeps each promotion independently reviewable.

### Negative

- Authoring a promotion is heavier: a loop owner must produce an evidence record and
  shepherd a ratification vote, not just change a flag.
- The per-tier floors are repo-wide minimums; loops with unusual cost asymmetries must
  set stricter thresholds in their #3844 doc, which is easy to forget.
- The CI gate adds a manifest-diff check that must stay in lockstep with this schema;
  schema drift (this ADR vs. #3841's validator) is a maintenance surface.

### Implemented

- #3841 — **shipped.** Machine-enforce the tier field: router refusal via
  `guardAuthority` (`packages/nexus-agents/src/orchestration/authority-tier-guard.ts`,
  wired into `meta-orchestrator.ts`) plus the CI drift gate
  (`scripts/check-authority-tier-drift.ts`).
- #3842 — **shipped.** Tier-transition audit events + ratification gate, with the
  hash-covered tier-transition projection (`packages/nexus-agents/src/audit/tier-transition-hash.ts`;
  see the [audit hash-chain threat model](../security/audit-hash-chain-threat-model.md)).

### Amendment (#4655) — the execute envelope

The tier comparison alone could not refuse anything in production. Measured on
2026-08-24: `dispatchActionClass` returned `'suggest'` unconditionally for both
dispatch modes, every live strategy declared `suggest` or higher, and the
strategy union is exactly the eight that have manifests. So neither
`above_declared_tier` nor `tier_undeclared` was reachable — the guard was
structurally incapable of refusing, which by this project's own standard is not
a check at all.

Raising the mapping was measured before being attempted, and does not work on
its own:

| `execute` maps to      | strategies refused |
| ---------------------- | ------------------ |
| `suggest` (status quo) | 0/8                |
| `advisory`             | 7/8                |
| `enforce`              | 8/8                |

A consensus panel (higher_order, absolute_quorum) chose the envelope approach
6-1, with the leading option taking 4/6 selections. Rather than inflate tiers
until the ladder refuses everything, this ADR's own phrase — `enforce` acts
"within its declared, bounded envelope" — becomes a representable precondition:

- `StrategyManifest.executeEnvelope` declares `filesystem`, `spawn`, `network`
  and `vcs` scope from closed enums. There is no wildcard member, so "may do
  anything" is unrepresentable rather than merely discouraged.
- `run { execute: true }` refuses fail-closed when the selected strategy has
  declared no envelope. **Absence means "cannot execute", never "unbounded".**
- The declaration is cross-checked, not trusted: a manifest must declare an
  envelope exactly when `executorAvailable` is true, `research`'s envelope must
  equal `pipeline`'s (it is a literal alias of that executor), and no envelope
  may be maximal in every dimension.

**Scope limit, stated plainly.** This is a _declaration_ check, not runtime
sandboxing. It refuses an undeclared strategy; it does not detect a
mis-declared one. The dissenting vote made exactly this point and it is
recorded here rather than papered over. Runtime confinement is `NEXUS_SANDBOX`
(epic #2500), a separate control.

### Future Work

- #3843: migrate the four un-issued loops (declare current tiers).
- #3844: per-loop promotion-criteria docs (stricter-only thresholds).

## References

- Epic: [#3839](https://github.com/nexus-substrate/nexus-agents/issues/3839) — Authority ladder (ratification 7/7)
- Issue: [#3840](https://github.com/nexus-substrate/nexus-agents/issues/3840) — this ADR
- Enforcement: [#3841](https://github.com/nexus-substrate/nexus-agents/issues/3841), [#3842](https://github.com/nexus-substrate/nexus-agents/issues/3842)
- Migration: [#3843](https://github.com/nexus-substrate/nexus-agents/issues/3843), [#3844](https://github.com/nexus-substrate/nexus-agents/issues/3844)
- Absorbed cases: [#3552](https://github.com/nexus-substrate/nexus-agents/issues/3552), [#3769](https://github.com/nexus-substrate/nexus-agents/issues/3769), [#3815](https://github.com/nexus-substrate/nexus-agents/issues/3815), [#2077](https://github.com/nexus-substrate/nexus-agents/issues/2077), [#3697](https://github.com/nexus-substrate/nexus-agents/issues/3697)
- Manifest field: `packages/nexus-agents/src/orchestration/strategy-manifest.ts` (`AuthorityTierSchema`)
- Exploration floor: `packages/nexus-agents/src/cli-adapters/linucb-bandit.ts:130-136`
- Related ADRs: [ADR-0016](./0016-multi-round-consensus-voting.md) (multi-round consensus voting)
