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
 * Create identity matrix of given dimension.
 */
function createIdentityMatrix(dim: number, lambda: number): number[][] {
  const matrix: number[][] = [];
  for (let i = 0; i < dim; i++) {
    const row: number[] = [];
    for (let j = 0; j < dim; j++) {
      row.push(i === j ? lambda : 0);
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Create zero vector of given dimension.
 */
function createZeroVector(dim: number): number[] {
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) {
    vec.push(0);
  }
  return vec;
}

/**
 * Convert bandit context to feature vector.
 */
function contextToFeatures(context: BanditContext): number[] {
  return [
    context.taskComplexity,
    context.contextLengthNormalized,
    context.isCodeTask ? 1 : 0,
    context.isReasoningTask ? 1 : 0,
    context.budgetUtilization,
    context.timePressure,
  ];
}

/**
 * Matrix-vector multiplication: A * x.
 */
function matVecMul(A: readonly (readonly number[])[], x: readonly number[]): number[] {
  const result: number[] = [];
  for (const row of A) {
    let sum = 0;
    for (let j = 0; j < x.length; j++) {
      const rowVal = row[j];
      const xVal = x[j];
      if (rowVal !== undefined && xVal !== undefined) {
        sum += rowVal * xVal;
      }
    }
    result.push(sum);
  }
  return result;
}

/**
 * Dot product of two vectors.
 */
function dotProduct(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i];
    const bVal = b[i];
    if (aVal !== undefined && bVal !== undefined) {
      sum += aVal * bVal;
    }
  }
  return sum;
}

/**
 * Outer product: x * x^T.
 */
function outerProduct(x: readonly number[]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < x.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < x.length; j++) {
      const xi = x[i];
      const xj = x[j];
      row.push(xi !== undefined && xj !== undefined ? xi * xj : 0);
    }
    result.push(row);
  }
  return result;
}

/**
 * Add two matrices element-wise.
 */
function matrixAdd(
  A: readonly (readonly number[])[],
  B: readonly (readonly number[])[]
): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < A.length; i++) {
    const row: number[] = [];
    const aRow = A[i];
    const bRow = B[i];
    if (aRow === undefined || bRow === undefined) continue;
    for (let j = 0; j < aRow.length; j++) {
      const aVal = aRow[j];
      const bVal = bRow[j];
      row.push((aVal ?? 0) + (bVal ?? 0));
    }
    result.push(row);
  }
  return result;
}

/**
 * Add two vectors element-wise.
 */
function vectorAdd(a: readonly number[], b: readonly number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const aVal = a[i];
    const bVal = b[i];
    result.push((aVal ?? 0) + (bVal ?? 0));
  }
  return result;
}

/**
 * Scale vector by scalar.
 */
function vectorScale(v: readonly number[], s: number): number[] {
  return v.map((x) => x * s);
}

/**
 * Create augmented matrix [A|I] for Gaussian elimination.
 */
function createAugmentedMatrix(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  const augmented: number[][] = [];
  for (let i = 0; i < n; i++) {
    const matrixRow = matrix[i];
    if (matrixRow === undefined) continue;
    const row: number[] = [...matrixRow];
    for (let j = 0; j < n; j++) {
      row.push(i === j ? 1 : 0);
    }
    augmented.push(row);
  }
  return augmented;
}

/**
 * Find pivot row with maximum absolute value for column.
 */
function findPivotRow(augmented: number[][], col: number, n: number): number {
  let maxRow = col;
  const augmentedCol = augmented[col];
  if (augmentedCol === undefined) return col;

  let maxVal = Math.abs(augmentedCol[col] ?? 0);
  for (let row = col + 1; row < n; row++) {
    const augmentedRow = augmented[row];
    if (augmentedRow === undefined) continue;
    const val = Math.abs(augmentedRow[col] ?? 0);
    if (val > maxVal) {
      maxVal = val;
      maxRow = row;
    }
  }
  return maxRow;
}

/**
 * Scale a row by dividing by pivot.
 */
function scaleRow(row: number[], pivot: number, width: number): void {
  for (let j = 0; j < width; j++) {
    const val = row[j];
    if (val !== undefined) row[j] = val / pivot;
  }
}

/**
 * Eliminate column in other rows using pivot row.
 */
function eliminateColumn(augmented: number[][], col: number, pivotRow: number[], n: number): void {
  for (let row = 0; row < n; row++) {
    if (row === col) continue;
    const currentRow = augmented[row];
    if (currentRow === undefined) continue;
    const factor = currentRow[col] ?? 0;
    for (let j = 0; j < 2 * n; j++) {
      const currentVal = currentRow[j];
      const pivotVal = pivotRow[j];
      if (currentVal !== undefined && pivotVal !== undefined) {
        currentRow[j] = currentVal - factor * pivotVal;
      }
    }
  }
}

/**
 * Perform Gaussian elimination on augmented matrix.
 */
function gaussianElimination(augmented: number[][], n: number): void {
  for (let col = 0; col < n; col++) {
    const maxRow = findPivotRow(augmented, col, n);
    const temp = augmented[col];
    const swapRow = augmented[maxRow];
    if (temp !== undefined && swapRow !== undefined) {
      augmented[col] = swapRow;
      augmented[maxRow] = temp;
    }

    const pivotRow = augmented[col];
    if (pivotRow === undefined) continue;
    const pivot = pivotRow[col] ?? 1;
    if (Math.abs(pivot) < 1e-10) continue;

    scaleRow(pivotRow, pivot, 2 * n);
    eliminateColumn(augmented, col, pivotRow, n);
  }
}

/**
 * Simple matrix inverse using Gaussian elimination.
 * For small matrices (6x6), this is sufficient.
 */
function matrixInverse(matrix: readonly (readonly number[])[]): number[][] {
  const n = matrix.length;
  const augmented = createAugmentedMatrix(matrix);
  gaussianElimination(augmented, n);

  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    const augmentedRow = augmented[i];
    result.push(augmentedRow !== undefined ? augmentedRow.slice(n) : createZeroVector(n));
  }
  return result;
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
