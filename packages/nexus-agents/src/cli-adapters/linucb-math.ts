/**
 * nexus-agents/cli-adapters - LinUCB Math Utilities
 *
 * Linear algebra and math helper functions for LinUCB bandit.
 *
 * @module cli-adapters/linucb-math
 * (Source: Issue #102)
 */

import type { BanditContext } from './budget-router-types.js';

/**
 * Create identity matrix of given dimension.
 */
export function createIdentityMatrix(dim: number, lambda: number): number[][] {
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
export function createZeroVector(dim: number): number[] {
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) {
    vec.push(0);
  }
  return vec;
}

/**
 * Convert bandit context to feature vector.
 */
export function contextToFeatures(context: BanditContext): number[] {
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
export function matVecMul(A: readonly (readonly number[])[], x: readonly number[]): number[] {
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
export function dotProduct(a: readonly number[], b: readonly number[]): number {
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
export function outerProduct(x: readonly number[]): number[][] {
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
export function matrixAdd(
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
export function vectorAdd(a: readonly number[], b: readonly number[]): number[] {
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
export function vectorScale(v: readonly number[], s: number): number[] {
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
export function matrixInverse(matrix: readonly (readonly number[])[]): number[][] {
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
