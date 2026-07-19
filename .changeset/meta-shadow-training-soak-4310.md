---
---

feat(learning): add the MetaOrchestrator shadow-training soak trigger (#4310, feeder for #3552)

The shadow-training mechanism (`NEXUS_META_SHADOW_TRAIN=1` persisting sanitized bandit outcomes to `learning/meta-outcomes.jsonl`, #3593) worked, but nothing ever triggered it — training only fires on a live `run{execute:true}` call, and no CI/cron/CLI ever made one.

Adds `scripts/meta-shadow-soak.ts` (thin `gh` + live-`executeGoal` edge) and `scripts/meta-shadow-soak-core.ts` (pure, unit-tested goal selection/formatting) to drive a bounded set of REAL backlog issues through the router with shadow training enabled, plus `.github/workflows/meta-shadow-soak.yml` (`workflow_dispatch`-only, secret-gated so it skips cleanly without model credentials, single-flight concurrency, accumulating `actions/cache`, an explicit feeder-only mode assert) mirroring the #4224 remediation-audit-soak precedent.

Feeder only: `NEXUS_META_SHADOW_TRAIN=1` is the only lever pulled — it never alters what `run` dispatches. The #3552 shadow→route flip stays a separate, human-gated change.

CI-workflow + scripts + docs only (no `packages/nexus-agents/src` change), so this ships no
package update — empty changeset per repo convention (matches #4224's
`scheduled-audit-soak-4224.md`).
