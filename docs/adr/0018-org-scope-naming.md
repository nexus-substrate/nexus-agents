---
title: 'ADR 0018: Org and npm-Scope Naming under the Control-Plane Positioning'
description: Decision framework for org + npm-scope naming under the Epic H autonomic-control-plane repositioning — keep nexus-substrate org and unscoped npm names as legacy lineage, with a documented forcing-function trigger for a future scope rename. Absorbs the deferred #2834 scope-rename decision.
tier: 3
keywords:
  [
    naming,
    npm,
    scope,
    org,
    nexus-substrate,
    control-plane,
    repositioning,
    deferred,
    trigger,
    adr,
    governance,
  ]
---

# ADR 0018: Org and npm-Scope Naming under the Control-Plane Positioning

**Status:** Accepted (deferred-trigger decision)
**Date:** 2026-06-17
**Context:** Epic H — Repositioning: autonomic control plane for AI coding agents
(#3858); child #3862. **Absorbs** #2834 (deferred npm scope rename).
**Ratification:** naming is architecture-adjacent → requires a **supermajority
`consensus_vote`** per the governance thresholds; this ADR records the decision
and its trigger conditions for that vote.

## Decision

**Keep the current names. Rename the category, not the project.**

Under the autonomic-control-plane repositioning, nexus-agents:

1. **Keeps the `nexus-substrate` GitHub org** as the project's lineage name.
2. **Keeps unscoped npm package names** (`nexus-agents`, `nexus-memory`, and the
   other unscoped workspace packages) — no rename to `@nexus-substrate/*`.
3. **Repositions by description, not by identifier.** The "autonomic control
   plane" framing is a _category_ change (how the project is described and
   marketed); it is **not** a forcing function to rename the org, the repo, or the
   npm packages.

This is the decision framework, not a rename. A scope/org rename remains
**deferred** until a concrete forcing function fires (see _Trigger Conditions_).
This carries forward #2834's deferral verbatim rather than reopening it — the
repositioning does **not** count as a trigger.

## Context

Issue #2834 deferred the `@nexus-substrate/*` npm scope rename. The 2026-05-17
consensus vote treated it as YAGNI: a scope rename is a major-version event with deprecation
shims that forces every consumer to update `package.json`, so do it **only** when a
forcing function appears (name collision, governance/security requirement, or a
supply-chain reason). Phase 1 of the org migration deliberately kept all npm names
unscoped.

Epic H repositions the project as an _autonomic control plane for AI coding
agents_. The open question #3862 raises: does that repositioning **force** the
deferred decision? Specifically — does "control plane" positioning require a name
change, or does nexus-substrate stay as legacy lineage that we simply document?

The repositioning is a _descriptor_ change. Every plank of the new descriptor maps
to existing, verified code (one entry point = `run`/MetaOrchestrator; adversarial
review = the panel + catfish; immutable audit = the hash chain; closed-loop
self-tuning = the bounded tune loop). None of those planks depends on the project's
_name_. A category rename and a project rename are independent decisions, and
conflating them imports a costly, breaking change for a marketing benefit that does
not require it.

## Options Considered

### Option A: Keep nexus-substrate org + unscoped npm names (RECOMMENDED)

Treat the repositioning as category-only. Document `nexus-substrate` as the lineage
name; ship the control-plane descriptor in README/docs/website without touching any
identifier.

- **Pros:** zero install-base breakage; no deprecation shims; no consumer
  `package.json` churn; no redirect cost; orthogonal to the #2872 repo-move plan;
  preserves #2834's YAGNI discipline; the repositioning ships _last_, on a verified
  system, with no naming risk added.
- **Cons:** the org name and the marketed category diverge (lineage name ≠
  descriptor) — a documentation/onboarding nuance someone must explain; some may
  read "nexus-substrate" as not signaling "control plane".

### Option B: Rename npm packages to `@nexus-substrate/*` (scoped)

Adopt the org scope on npm now, with deprecation shims for the unscoped names.

- **Pros:** org-level package access control becomes possible; scope-level
  discoverability; a single coherent namespace.
- **Cons:** this is exactly the deferred #2834 event — a major-version break that
  forces every consumer to update `package.json`; needs deprecation shims and a
  redirect/changelog story; high effort for a benefit the repositioning does not
  require; no forcing function has fired.

### Option C: Rename the org/project itself (e.g. to a "control-plane" name)

Rename the GitHub org and/or project to match the new category.

- **Pros:** name and category fully aligned; strongest brand signal.
- **Cons:** the largest breaking change of the three — repo redirects, npm renames,
  doc/link rot, badge churn, lost lineage; collides with the #2872 repo-move plan;
  category rename ≠ project rename (the #2834 principle); no forcing function;
  highest risk on the epic that explicitly ships last on a verified system.

## Trigger Conditions (when to re-open)

This ADR stays in force until one of the following fires; the repositioning itself
is explicitly **not** one of them. These carry #2834's re-evaluation triggers
forward and add the positioning-era ones:

- **Name collision** — an unscoped npm name we want is contested, or
  `nexus-substrate` collides with another org/brand.
- **Governance / security requirement** — we need org-level npm package access
  control, scoped provenance, or a supply-chain control that requires a scope.
- **Consumer-ecosystem discoverability** — a consumer ecosystem develops that
  measurably benefits from scope-level discoverability.
- **Repo-move forcing function** — the #2872 repo-move plan reaches a stage where a
  rename is cheaper to do _with_ the move than separately.

When a trigger fires, run a fresh **supermajority `consensus_vote`** with the
forcing function as evidence (naming is architecture-adjacent). Until then, **do
not propose a rename** — and treat a proposal lacking a documented trigger as out
of contract.

## Consequences

### Positive

- No install-base breakage, no deprecation shims, no consumer churn — the
  repositioning ships with zero naming risk.
- #2834's YAGNI discipline is preserved and given an explicit, documented home; the
  deferred decision is now traceable to an ADR rather than a closed issue's prose.
- The rename, if it ever happens, happens _with_ a forcing function and (ideally)
  _with_ the #2872 repo move, amortizing the breakage once.

### Negative

- The lineage name (`nexus-substrate`) and the marketed category
  (autonomic control plane) diverge; onboarding docs must explain that the org name
  is lineage, not the product category.
- A future rename, when triggered, will still pay the full major-version /
  deprecation-shim cost — this ADR defers that cost, it does not remove it.

## Migration Steps

This is a **no-migration** decision. The only actions are documentary:

1. Document `nexus-substrate` as the project's **lineage** name in the repositioned
   README/docs (Epic H, #3859/#3860) — "the org name is the lineage; the category
   is the autonomic control plane."
2. Keep npm names unscoped; make **no** `package.json` name changes.
3. **Close #2834** as absorbed by this ADR (decision: defer stands; trigger
   conditions recorded here).
4. If a trigger fires later, open a fresh issue with the forcing function as
   evidence and run the supermajority ratification vote.

## References

- Epic: [#3858](https://github.com/nexus-substrate/nexus-agents/issues/3858) — repositioning: autonomic control plane
- Issue: [#3862](https://github.com/nexus-substrate/nexus-agents/issues/3862) — this ADR (org/scope naming)
- Absorbs: [#2834](https://github.com/nexus-substrate/nexus-agents/issues/2834) — deferred npm scope rename to `@nexus-substrate/*`
- Related: [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) — repo-move plan; [#2831](https://github.com/nexus-substrate/nexus-agents/issues/2831) — org migration (Phase 3 deferred)
- Repositioning siblings: [#3859](https://github.com/nexus-substrate/nexus-agents/issues/3859) (README rewrite), [#3860](https://github.com/nexus-substrate/nexus-agents/issues/3860) (docs IA), [#3861](https://github.com/nexus-substrate/nexus-agents/issues/3861) (website hero)
- Related ADRs: [ADR-0015](./0015-multi-repo-orchestration.md) (multi-repo orchestration), [ADR-0017](./0017-authority-ladder.md) (authority ladder — supermajority ratification pattern)
