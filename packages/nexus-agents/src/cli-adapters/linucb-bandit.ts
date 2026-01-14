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
import {
  createIdentityMatrix,
  createZeroVector,
  contextToFeatures,
  matVecMul,
  dotProduct,
  outerProduct,
  matrixAdd,
  vectorAdd,
  vectorScale,
  matrixInverse,
} from './linucb-math.js';

/**
 * Arm state for LinUCB.
 */
interface ArmState {
  /** A matrix: d x d matrix for context covariance */
  A: number[][];
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

  constructor(armNames: readonly string[], config?: Partial<LinUCBConfig>) {
    this.armNames = armNames;
    this.config = LinUCBConfigSchema.parse({
      ...DEFAULT_LINUCB_CONFIG,
      numArms: armNames.length,
      ...config,
    });

    this.arms = armNames.map(() => ({
      A: createIdentityMatrix(this.config.featureDim, this.config.lambda),
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
   */
  update(armIndex: number, context: BanditContext, reward: number): void {
    const arm = this.arms[armIndex];
    if (arm === undefined) return;

    const features = contextToFeatures(context);
    const xxT = outerProduct(features);
    const rx = vectorScale(features, reward);

    arm.A = matrixAdd(arm.A, xxT);
    arm.b = vectorAdd(arm.b, rx);
    arm.pullCount++;
    arm.cumulativeReward += reward;
  }

  /**
   * Compute UCB score for an arm given features.
   */
  private computeUCB(arm: ArmState, features: readonly number[]): number {
    const AInv = matrixInverse(arm.A);
    const theta = matVecMul(AInv, arm.b);
    const expectedReward = dotProduct(theta, features);
    const AInvX = matVecMul(AInv, features);
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
      const AInv = matrixInverse(arm.A);
      const theta = matVecMul(AInv, arm.b);
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
   * Reset all arm statistics.
   */
  reset(): void {
    for (const arm of this.arms) {
      arm.A = createIdentityMatrix(this.config.featureDim, this.config.lambda);
      arm.b = createZeroVector(this.config.featureDim);
      arm.pullCount = 0;
      arm.cumulativeReward = 0;
    }
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
