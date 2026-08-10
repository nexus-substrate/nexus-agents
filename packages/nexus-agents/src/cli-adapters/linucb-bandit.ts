/**
 * nexus-agents/cli-adapters - LinUCB Bandit
 *
 * Linear Upper Confidence Bound bandit for budget-aware model selection.
 * Implements the PILOT pattern for lazy budget allocation.
 *
 * @module cli-adapters/linucb-bandit
 * (Source: Issue #102, arXiv:2401.02987)
 */

import type { BanditContext, LinUCBConfig } from './budget-router-types.js';
import { DEFAULT_LINUCB_CONFIG, LinUCBConfigSchema } from './budget-router-types.js';
import { createLogger } from '../core/index.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import {
  createIdentityMatrix,
  createIdentityMatrixInverse,
  createZeroVector,
  contextToFeatures,
  matVecMul,
  dotProduct,
  outerProduct,
  matrixAdd,
  vectorAdd,
  vectorScale,
  shermanMorrisonUpdate,
} from './linucb-math.js';

const logger = createLogger({ component: 'linucb-bandit' });

/** Reward value assigned on successful task completion. */
const SUCCESS_REWARD = 0.7;

/** Reward value assigned on task failure. */
const FAILURE_REWARD = 0.1;

/**
 * Per-arm × per-model warm-start replay statistic (#4194).
 *
 * The bandit's arms stay keyed by CLI slot / routing arm id — this is a
 * telemetry surface exposing which concrete models the replayed outcomes
 * came from, so per-model shadow evaluation can read the grouping without
 * changing arm structure or selection behavior.
 */
export interface WarmStartModelStat {
  /** Arm the outcome was replayed into (outcome.cli). */
  readonly arm: string;
  /** Concrete model id the outcome carried (outcome.model). */
  readonly model: string;
  /** Number of outcomes replayed for this arm × model. */
  readonly replayedCount: number;
  /** Number of those outcomes that were successes. */
  readonly successCount: number;
}

/**
 * Arm state for LinUCB.
 */
interface ArmState {
  /** A matrix: d x d matrix for context covariance */
  A: number[][];
  /** A inverse: cached inverse for O(d²) updates via Sherman-Morrison */
  AInv: number[][];
  /** b vector: d-dimensional reward vector */
  b: number[];
  /** Number of times this arm was pulled */
  pullCount: number;
  /** Cumulative reward */
  cumulativeReward: number;
}

/**
 * LinUCB bandit for contextual multi-armed bandit problem.
 */
export class LinUCBBandit {
  private readonly config: LinUCBConfig;
  private readonly arms: ArmState[];
  private readonly armNames: readonly string[];
  /** Warm-start replay ledger keyed `arm model` (#4194). Telemetry only. */
  private readonly warmStartModelLedger = new Map<
    string,
    { arm: string; model: string; replayedCount: number; successCount: number }
  >();

  constructor(armNames: readonly string[], config?: Partial<LinUCBConfig>) {
    this.armNames = armNames;
    this.config = LinUCBConfigSchema.parse({
      ...DEFAULT_LINUCB_CONFIG,
      numArms: armNames.length,
      ...config,
    });

    this.arms = armNames.map(() => ({
      A: createIdentityMatrix(this.config.featureDim, this.config.lambda),
      AInv: createIdentityMatrixInverse(this.config.featureDim, this.config.lambda),
      b: createZeroVector(this.config.featureDim),
      pullCount: 0,
      cumulativeReward: 0,
    }));
  }

  /**
   * Select an arm given the context.
   * Returns arm index and UCB score.
   */
  select(context: BanditContext): { armIndex: number; armName: string; ucbScore: number } {
    const features = contextToFeatures(context);
    let bestArm = 0;
    let bestUCB = -Infinity;

    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i];
      if (arm === undefined) continue;

      const ucb = this.computeUCB(arm, features);
      if (ucb > bestUCB) {
        bestUCB = ucb;
        bestArm = i;
      }
    }

    return {
      armIndex: bestArm,
      armName: this.armNames[bestArm] ?? 'unknown',
      ucbScore: bestUCB,
    };
  }

  /**
   * Update arm with observed reward.
   * Uses Sherman-Morrison formula for O(d²) incremental inverse update.
   * (Source: Issue #254, PILOT paper section 3.2)
   */
  update(armIndex: number, context: BanditContext, reward: number): void {
    const arm = this.arms[armIndex];
    if (arm === undefined) return;

    const features = contextToFeatures(context);
    const xxT = outerProduct(features);
    const rx = vectorScale(features, reward);

    // Update A matrix (kept for reference/debugging)
    arm.A = matrixAdd(arm.A, xxT);

    // Update A inverse incrementally using Sherman-Morrison (O(d²) instead of O(d³))
    arm.AInv = shermanMorrisonUpdate(arm.AInv, features);

    arm.b = vectorAdd(arm.b, rx);
    arm.pullCount++;
    arm.cumulativeReward += reward;
  }

  /**
   * Compute UCB score for an arm given features.
   * Uses cached AInv for O(d²) computation instead of O(d³) matrix inverse.
   */
  private computeUCB(arm: ArmState, features: readonly number[]): number {
    // Use cached inverse (O(d²) matrix-vector multiply instead of O(d³) inversion)
    const theta = matVecMul(arm.AInv, arm.b);
    const expectedReward = dotProduct(theta, features);
    const AInvX = matVecMul(arm.AInv, features);
    const uncertainty = Math.sqrt(dotProduct(features, AInvX));
    return expectedReward + this.config.alpha * uncertainty;
  }

  /**
   * Get arm names.
   */
  getArmNames(): readonly string[] {
    return this.armNames;
  }

  /**
   * Get statistics for all arms.
   */
  getStats(): ReadonlyArray<{ name: string; pullCount: number; avgReward: number }> {
    return this.arms.map((arm, i) => ({
      name: this.armNames[i] ?? 'unknown',
      pullCount: arm.pullCount,
      avgReward: arm.pullCount > 0 ? arm.cumulativeReward / arm.pullCount : 0,
    }));
  }

  /**
   * Get detailed statistics for all arms including learned weights.
   * Useful for debugging and ML observability.
   */
  getDetailedStats(): ReadonlyArray<{
    name: string;
    pullCount: number;
    avgReward: number;
    cumulativeReward: number;
    learnedWeights: readonly number[];
    featureImportance: readonly { feature: string; importance: number }[];
  }> {
    const featureNames = [
      'taskComplexity',
      'contextLength',
      'isCodeTask',
      'isReasoningTask',
      'budgetUtilization',
      'timePressure',
    ];

    return this.arms.map((arm, i) => {
      // Use cached inverse (O(d²) instead of O(d³))
      const theta = matVecMul(arm.AInv, arm.b);
      const absWeights = theta.map(Math.abs);
      const totalWeight = absWeights.reduce((a, b) => a + b, 0) || 1;

      const featureImportance = featureNames.map((feature, idx) => ({
        feature,
        importance: (absWeights[idx] ?? 0) / totalWeight,
      }));

      featureImportance.sort((a, b) => b.importance - a.importance);

      return {
        name: this.armNames[i] ?? 'unknown',
        pullCount: arm.pullCount,
        avgReward: arm.pullCount > 0 ? arm.cumulativeReward / arm.pullCount : 0,
        cumulativeReward: arm.cumulativeReward,
        learnedWeights: theta,
        featureImportance,
      };
    });
  }

  /**
   * Get exploration statistics.
   */
  getExplorationStats(): {
    totalPulls: number;
    explorationRatio: number;
    armDistribution: ReadonlyArray<{ name: string; proportion: number }>;
  } {
    const stats = this.getStats();
    const totalPulls = stats.reduce((sum, s) => sum + s.pullCount, 0);

    const armDistribution = stats.map((s) => ({
      name: s.name,
      proportion: totalPulls > 0 ? s.pullCount / totalPulls : 1 / stats.length,
    }));

    // Exploration ratio: how evenly distributed pulls are (1 = perfectly even)
    const evenProportion = 1 / stats.length;
    const deviation = armDistribution.reduce(
      (sum, d) => sum + Math.abs(d.proportion - evenProportion),
      0
    );
    const maxDeviation = 2 * (1 - evenProportion);
    const explorationRatio = maxDeviation > 0 ? 1 - deviation / maxDeviation : 1;

    return { totalPulls, explorationRatio, armDistribution };
  }

  /**
   * Seed priors for cold-start improvement (Epic #952, Phase 6).
   *
   * Simulates `observationCount` synthetic observations per arm using
   * a neutral context and the provided reward hint. This gives arms
   * a head start based on known quality signals while still allowing
   * LinUCB exploration to override the seeded priors.
   *
   * @param priors - Map of arm name to initial reward hint (0-1)
   * @param observationCount - Number of synthetic observations (default: 5, max: 20)
   */
  seedPriors(priors: ReadonlyMap<string, number>, observationCount = 5): void {
    const count = Math.min(observationCount, 20);
    const neutralContext: BanditContext = {
      taskComplexity: 0.5,
      contextLengthNormalized: 0.5,
      isCodeTask: 0,
      isReasoningTask: 0,
      budgetUtilization: 0.5,
      timePressure: 0.5,
    };

    for (let i = 0; i < this.armNames.length; i++) {
      const armName = this.armNames[i];
      if (armName === undefined) continue;
      const reward = priors.get(armName);
      if (reward === undefined) continue;
      const clampedReward = Math.max(0, Math.min(1, reward));
      for (let j = 0; j < count; j++) {
        this.update(i, neutralContext, clampedReward);
      }
    }
  }

  /**
   * Warm-start bandit from persisted task outcomes (Issue #1015).
   *
   * Replays historical outcomes through update() to reconstruct arm weights
   * from persisted data. Uses a neutral context (same as seedPriors) since
   * the original task context is not stored in TaskOutcome.
   *
   * Outcomes whose arm is not among this bandit's arms are skipped. That skip
   * used to be entirely silent, which hid a real defect: `api:*` arms could not
   * be represented in `TaskOutcome.cli` at all (#4400), so every API arm
   * discarded its whole history and began cold each process with nothing
   * reported. The skip is now counted and logged — a warm-start that silently
   * drops most of its input looks identical to one that worked.
   *
   * @param outcomes - Persisted task outcomes to replay
   * @returns Number of outcomes successfully replayed
   */
  warmStart(outcomes: readonly TaskOutcome[]): number {
    const neutralContext: BanditContext = {
      taskComplexity: 0.5,
      contextLengthNormalized: 0.5,
      isCodeTask: 0,
      isReasoningTask: 0,
      budgetUtilization: 0.5,
      timePressure: 0.5,
    };

    let replayed = 0;
    const skippedArms = new Map<string, number>();
    for (const outcome of outcomes) {
      const armIndex = this.armNames.indexOf(outcome.cli);
      if (armIndex < 0) {
        skippedArms.set(outcome.cli, (skippedArms.get(outcome.cli) ?? 0) + 1);
        continue;
      }
      const reward = outcome.success ? SUCCESS_REWARD : FAILURE_REWARD;
      this.update(armIndex, neutralContext, reward);
      this.recordWarmStartModelStat(outcome.cli, outcome.model, outcome.success);
      replayed++;
    }
    if (skippedArms.size > 0) {
      logger.warn('Warm-start skipped outcomes for arms this bandit does not have', {
        skippedByArm: Object.fromEntries(skippedArms),
        replayed,
        knownArms: this.armNames,
      });
    }
    return replayed;
  }

  /** Accumulate the per-arm × per-model warm-start ledger (#4194). */
  private recordWarmStartModelStat(arm: string, model: string, success: boolean): void {
    const key = `${arm} ${model}`;
    const entry = this.warmStartModelLedger.get(key) ?? {
      arm,
      model,
      replayedCount: 0,
      successCount: 0,
    };
    entry.replayedCount++;
    if (success) entry.successCount++;
    this.warmStartModelLedger.set(key, entry);
  }

  /**
   * Per-arm × per-model grouping of the outcomes replayed through
   * {@link warmStart} (#4194). A telemetry surface for per-model outcome
   * evaluation — arm structure and selection behavior are unchanged.
   * Sorted by arm, then model, for stable output.
   */
  getWarmStartModelStats(): readonly WarmStartModelStat[] {
    return [...this.warmStartModelLedger.values()]
      .map((s) => ({ ...s }))
      .sort((a, b) => a.arm.localeCompare(b.arm) || a.model.localeCompare(b.model));
  }

  /**
   * Reset all arm statistics.
   */
  reset(): void {
    for (const arm of this.arms) {
      arm.A = createIdentityMatrix(this.config.featureDim, this.config.lambda);
      arm.AInv = createIdentityMatrixInverse(this.config.featureDim, this.config.lambda);
      arm.b = createZeroVector(this.config.featureDim);
      arm.pullCount = 0;
      arm.cumulativeReward = 0;
    }
    this.warmStartModelLedger.clear();
  }
}

/**
 * Create a LinUCB bandit instance.
 */
export function createLinUCBBandit(
  armNames: readonly string[],
  config?: Partial<LinUCBConfig>
): LinUCBBandit {
  return new LinUCBBandit(armNames, config);
}
