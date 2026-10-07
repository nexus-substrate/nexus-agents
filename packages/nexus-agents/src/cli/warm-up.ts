/**
 * LinUCB bandit warm-up from task specialization matrix.
 *
 * Generates synthetic priors from the canonical TASK_SPECIALIZATION_MATRIX
 * and seeds the LinUCB bandit to reduce cold-start exploration time.
 *
 * @module cli/warm-up
 * (Source: Issue #1023 — Bootstrap LinUCB with synthetic outcomes)
 */

import { TASK_SPECIALIZATION_MATRIX } from '../config/task-specialization.js';
import { TASK_CATEGORIES } from '../config/task-specialization-types.js';
import { getOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import { createLogger, type ILogger } from '../core/index.js';
import { isEndpointArmId, routingArmCliSlot } from '../cli-adapters/types-core.js';

// ============================================================================
// Constants
// ============================================================================

/** Reward hint for the primary CLI (strong prior). */
const PRIMARY_REWARD = 0.85;

/** Reward hint for the secondary CLI (moderate prior). */
const SECONDARY_REWARD = 0.6;

/** Reward hint for other CLIs (weak/exploratory prior). */
const OTHER_REWARD = 0.35;

/** No endpoint-specific quality evidence: seed an unbiased midpoint (#7151). */
const ENDPOINT_REWARD = 0.5;

/** Marker in qualitySignals to identify synthetic outcomes. */
export const SYNTHETIC_MARKER = 'synthetic:warm-up';

/** All known CLI names for bandit arms. */
const CLI_NAMES = ['claude', 'gemini', 'codex', 'opencode'] as const;

// ============================================================================
// Types
// ============================================================================

export interface WarmUpResult {
  readonly seeded: number;
  readonly skipped: boolean;
  readonly reason?: string;
}

// ============================================================================
// Core Logic
// ============================================================================

/**
 * Derive average reward hints per CLI from the task specialization matrix.
 *
 * For each category:
 * - Primary CLI gets reward 0.85
 * - Secondary CLI gets reward 0.6
 * - Other CLIs get reward 0.35
 *
 * Returns the average reward across all categories per CLI. Registered
 * dynamic endpoint arms receive a neutral prior, reducing maximal cold-start
 * uncertainty without borrowing any CLI's specialization evidence. Existing
 * vendor API arms retain their pre-opt-in prior behavior.
 */
export function generateSyntheticPriors(
  armNames: readonly string[] = []
): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const cli of CLI_NAMES) {
    totals.set(cli, 0);
  }

  for (const spec of TASK_SPECIALIZATION_MATRIX) {
    for (const cli of CLI_NAMES) {
      const current = totals.get(cli) ?? 0;
      if (cli === spec.primaryCli) {
        totals.set(cli, current + PRIMARY_REWARD);
      } else if (cli === spec.secondaryCli) {
        totals.set(cli, current + SECONDARY_REWARD);
      } else {
        totals.set(cli, current + OTHER_REWARD);
      }
    }
  }

  const count = TASK_CATEGORIES.length;
  const priors = new Map<string, number>();
  for (const [cli, total] of totals) {
    priors.set(cli, total / count);
  }
  for (const arm of armNames.filter(
    (name) => isEndpointArmId(name) && routingArmCliSlot(name) === undefined
  )) {
    priors.set(arm, ENDPOINT_REWARD);
  }
  return priors;
}

/**
 * One synthetic outcome per CLI per specialization category, stamped with
 * `timestamp`. Pure: callers decide whether to persist them (runWarmUp) or
 * replay them in memory (read-only bandit reconstruction, #5275).
 */
export function buildSyntheticOutcomes(timestamp: string): TaskOutcome[] {
  const outcomes: TaskOutcome[] = [];
  for (const spec of TASK_SPECIALIZATION_MATRIX) {
    for (const cli of CLI_NAMES) {
      let reward: number;
      if (cli === spec.primaryCli) {
        reward = PRIMARY_REWARD;
      } else if (cli === spec.secondaryCli) {
        reward = SECONDARY_REWARD;
      } else {
        reward = OTHER_REWARD;
      }
      outcomes.push({
        id: `synthetic-${cli}-${spec.category}`,
        cli,
        category: spec.category,
        model: `${cli}-default`,
        success: reward >= 0.5,
        durationMs: 0,
        timestamp,
        qualitySignals: [SYNTHETIC_MARKER],
        source: 'manual',
      });
    }
  }
  return outcomes;
}

/**
 * Seed the LinUCB bandit with synthetic priors and record synthetic outcomes.
 *
 * Idempotent: skips if OutcomeStore already contains outcomes with the
 * synthetic marker in qualitySignals.
 */
export function runWarmUp(logger?: ILogger): WarmUpResult {
  const log = logger ?? createLogger({ component: 'warm-up' });
  const store = getOutcomeStore();

  // Idempotency check: skip if synthetic outcomes already exist
  const existing = store.query();
  const hasSynthetic = existing.some((o) => o.qualitySignals?.includes(SYNTHETIC_MARKER) === true);
  if (hasSynthetic) {
    log.info('Warm-up skipped: synthetic outcomes already exist');
    return { seeded: 0, skipped: true, reason: 'synthetic outcomes already exist' };
  }

  const priors = generateSyntheticPriors();
  const outcomes = buildSyntheticOutcomes(new Date().toISOString());
  for (const outcome of outcomes) store.append(outcome);
  const seeded = outcomes.length;

  log.info('LinUCB warm-up complete', {
    seeded,
    priors: Object.fromEntries(priors),
  });

  return { seeded, skipped: false };
}
