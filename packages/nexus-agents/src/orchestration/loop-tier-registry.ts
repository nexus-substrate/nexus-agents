/**
 * nexus-agents/orchestration - Loop-tier registry (the four un-issued loops).
 *
 * The runtime source of truth for the authority tier of the non-strategy "loops"
 * the authority ladder governs (#3843, ADR-0017). These four loops are NOT
 * routable execution strategies (those carry `authorityTier` on the strategy
 * manifest), so they had no declaration surface; per the epic recon they sit at
 * implicit tiers in scattered defaults and prose. This registry declares each at
 * its CURRENT tier — #3843 is documentation + declaration, with ZERO behaviour
 * change (Scope Steward condition).
 *
 * The four are embedded here as a typed constant (no disk I/O on the hot path) and
 * validated through {@link parseLoopTierRegistry} AT MODULE LOAD — a malformed
 * registry fails closed at import time. The companion `governance/loop-tiers.yaml`
 * is the human-facing / docs source of truth and the drift-gate target;
 * `loop-tier-registry.test.ts` asserts the two are equal so they cannot diverge
 * (the #3837 lockstep discipline, applied to loops).
 *
 * THE FOUR LOOPS AND THEIR TIERS (epic #3839 Phase-0 recon table):
 * - `suggest-research-tasks` → `suggest` (read-only by contract; files nothing).
 * - `improvement-review`     → `suggest` (fileIssues=false default, rate-cap 5).
 * - `pr-review`              → `advisory` (wraps consensus; never blocks merge).
 * - `tune-loop`              → `enforce`, BOUNDED (demotion floor 0.5, 0.2-step
 *   cap, 30-min decay). This is a PRE-EXISTING bounded enforce loop (default-ON
 *   since v2.96, #3323) being declared at its current tier — NOT a ladder
 *   promotion. Its authority is justified by the {@link LoopBoundedEnvelope}
 *   below (the safety envelope ADR-0017 mandates for `enforce`), not by a
 *   promotion-evidence record (it never underwent a ladder promotion).
 *
 * @module orchestration/loop-tier-registry
 * (Source: ADR-0017, Issue #3839, #3843)
 */
// @export-no-consumer-yet — see #3843
// The runtime consumer is the CI gate (scripts/check-authority-tier-drift.ts,
// under governance:check) + the lockstep test, both OUTSIDE src/**. There is no
// in-src runtime reader yet: #3841's router-refusal consumes the STRATEGY-manifest
// tier; an in-src reader of the LOOP-tier registry lands with the loop-runtime
// wiring (the loops self-declare today via this registry, the gate enforces it).

import {
  LoopTierRegistrySchema,
  LOOP_TIER_SCHEMA_VERSION,
  type LoopTierRegistry,
} from './loop-tier-manifest.js';

/**
 * The four un-issued loops, declared at their CURRENT implicit tiers. MIRRORS
 * `governance/loop-tiers.yaml` (enforced by the registry test). NONE are promoted
 * here — `tune-loop`'s `enforce` is its existing bounded reality (#3323), declared
 * for the first time; the others are read-only/suggest/advisory by construction.
 */
const RAW_REGISTRY: LoopTierRegistry = {
  version: 1,
  loops: [
    {
      id: 'suggest-research-tasks',
      schemaVersion: LOOP_TIER_SCHEMA_VERSION,
      description:
        'Suggest-only MCP tool over checkForResearchTriggers: returns candidate research tasks for a human/orchestrator to review; files nothing, mutates nothing.',
      authorityTier: 'suggest',
      evidence: 'packages/nexus-agents/src/mcp/tools/suggest-research-tasks-tool.ts:1-18',
      promotionCriteriaDoc: 'docs/governance/loop-promotion-criteria.md',
    },
    {
      id: 'improvement-review',
      schemaVersion: LOOP_TIER_SCHEMA_VERSION,
      description:
        'Threshold-gated observability loop: surfaces patterns crossing documented thresholds as CANDIDATE issues; fileIssues defaults false (signals only), capped at 5 per run when enabled. Never auto-merges.',
      authorityTier: 'suggest',
      evidence: 'packages/nexus-agents/src/mcp/tools/improvement-review.ts:62-68',
      promotionCriteriaDoc: 'docs/governance/loop-promotion-criteria.md',
    },
    {
      id: 'pr-review',
      schemaVersion: LOOP_TIER_SCHEMA_VERSION,
      description:
        'Multi-voter consensus review of a PR diff: maps each voter decision into PR-review semantics. Wraps the consensus voter infra and is non-blocking — it annotates, never gates merge.',
      authorityTier: 'advisory',
      evidence: 'packages/nexus-agents/src/mcp/tools/pr-review-tool.ts:1-16 (wraps consensus_vote)',
      // Promotion criterion owned by Epic E (#3844 out-of-scope) — see the
      // promotion-criteria doc, which links rather than duplicating it.
      promotionCriteriaDoc: 'docs/governance/loop-promotion-criteria.md',
    },
    {
      id: 'tune-loop',
      schemaVersion: LOOP_TIER_SCHEMA_VERSION,
      description:
        'Self-tuning routing loop: on health/fitness signals it applies a bounded, demotion-only routing multiplier and audits each adjustment. Default-ON enforce since v2.96 (#3323); non-routing signals stay shadow-logged.',
      authorityTier: 'enforce',
      evidence:
        'packages/nexus-agents/src/pipeline/tune-stage.ts; packages/nexus-agents/src/core/tune-adjustment-store.ts:31-35',
      boundedEnvelope: {
        summary:
          'Demotion-only routing nudge: multipliers are always ≤ 1.0 (slow a CLI, never boost it past measured performance), floored so a CLI is never zeroed out, capped per step, and decaying linearly back to 1.0 so a transient blip self-reverses.',
        bounds: {
          // core/tune-adjustment-store.ts:TUNE_DEMOTION_FLOOR
          demotionFloor: 0.5,
          // core/tune-adjustment-store.ts:TUNE_MAX_STEP
          maxStepPerAdjustment: 0.2,
          // core/tune-adjustment-store.ts:TUNE_DECAY_WINDOW_MS (30 * 60_000 ms)
          decayWindowMinutes: 30,
        },
        enforcedBy:
          'core/tune-adjustment-store.ts:TUNE_DEMOTION_FLOOR/TUNE_MAX_STEP/TUNE_DECAY_WINDOW_MS',
        demotionTrigger:
          'Automatic: each adjustment decays linearly back to 1.0 over 30 minutes (no ratchet); setting NEXUS_TUNE_ENFORCE=false reverts the whole loop to shadow. ADR-0017 demotion-on-regression applies if a bound is breached.',
      },
      promotionCriteriaDoc: 'docs/governance/loop-promotion-criteria.md',
    },
  ],
};

/**
 * The validated loop-tier registry. Parsed at module load so a malformed registry
 * fails closed at import time, exactly as the disk-loaded path would.
 */
export const LOOP_TIER_REGISTRY: LoopTierRegistry = LoopTierRegistrySchema.parse(RAW_REGISTRY);
