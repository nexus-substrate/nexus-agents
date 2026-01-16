/**
 * Tests for LinUCB Math Utilities
 * Includes Sherman-Morrison incremental inverse update tests
 *
 * (Source: Issue #254)
 */

import { describe, it, expect } from 'vitest';
import {
  createIdentityMatrix,
  createIdentityMatrixInverse,
  matrixInverse,
  shermanMorrisonUpdate,
  matVecMul,
  dotProduct,
  outerProduct,
  matrixAdd,
  vectorAdd,
  vectorScale,
} from './linucb-math.js';

describe('linucb-math', () => {
  describe('createIdentityMatrix', () => {
    it('should create scaled identity matrix', () => {
      const matrix = createIdentityMatrix(3, 2);
      expect(matrix).toHaveLength(3);
      expect(matrix[0]).toEqual([2, 0, 0]);
      expect(matrix[1]).toEqual([0, 2, 0]);
      expect(matrix[2]).toEqual([0, 0, 2]);
    });
  });

  describe('createIdentityMatrixInverse', () => {
    it('should create inverse of scaled identity matrix', () => {
      const matrix = createIdentityMatrixInverse(3, 2);
      expect(matrix).toHaveLength(3);
      expect(matrix[0]).toEqual([0.5, 0, 0]);
      expect(matrix[1]).toEqual([0, 0.5, 0]);
      expect(matrix[2]).toEqual([0, 0, 0.5]);
    });
  });

  describe('matrixInverse', () => {
    it('should compute inverse of identity matrix', () => {
      const identity = createIdentityMatrix(3, 1);
      const inv = matrixInverse(identity);
      expect(inv[0]?.[0]).toBeCloseTo(1);
      expect(inv[1]?.[1]).toBeCloseTo(1);
      expect(inv[2]?.[2]).toBeCloseTo(1);
    });

    it('should compute inverse of scaled identity matrix', () => {
      const scaled = createIdentityMatrix(3, 2);
      const inv = matrixInverse(scaled);
      expect(inv[0]?.[0]).toBeCloseTo(0.5);
      expect(inv[1]?.[1]).toBeCloseTo(0.5);
      expect(inv[2]?.[2]).toBeCloseTo(0.5);
    });
  });

  describe('shermanMorrisonUpdate', () => {
    it('should compute same result as direct inverse after rank-1 update', () => {
      // Start with identity matrix and its inverse
      const A = createIdentityMatrix(3, 1);
      const AInv = createIdentityMatrixInverse(3, 1);
      const x = [0.5, 0.3, 0.2];

      // Direct method: compute (A + xx^T)^(-1) via full inversion
      const xxT = outerProduct(x);
      const AUpdated = matrixAdd(A, xxT);
      const directInverse = matrixInverse(AUpdated);

      // Sherman-Morrison method: incremental update
      const smInverse = shermanMorrisonUpdate(AInv, x);

      // Results should match (within numerical tolerance)
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(smInverse[i]?.[j]).toBeCloseTo(directInverse[i]?.[j] ?? 0, 5);
        }
      }
    });

    it('should handle multiple sequential updates', () => {
      let A = createIdentityMatrix(3, 1);
      let AInv = createIdentityMatrixInverse(3, 1);

      const updates = [
        [0.5, 0.3, 0.2],
        [0.1, 0.8, 0.1],
        [0.4, 0.2, 0.4],
      ];

      // Apply updates using Sherman-Morrison
      for (const x of updates) {
        AInv = shermanMorrisonUpdate(AInv, x);
        const xxT = outerProduct(x);
        A = matrixAdd(A, xxT);
      }

      // Verify against direct inverse
      const directInverse = matrixInverse(A);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(AInv[i]?.[j]).toBeCloseTo(directInverse[i]?.[j] ?? 0, 4);
        }
      }
    });

    it('should handle zero vector (no-op)', () => {
      const AInv = createIdentityMatrixInverse(3, 1);
      const x = [0, 0, 0];
      const result = shermanMorrisonUpdate(AInv, x);

      // Result should be unchanged
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(result[i]?.[j]).toBeCloseTo(AInv[i]?.[j] ?? 0);
        }
      }
    });

    it('should be numerically stable with small values', () => {
      const AInv = createIdentityMatrixInverse(3, 1);
      const x = [0.001, 0.002, 0.001];
      const result = shermanMorrisonUpdate(AInv, x);

      // Should not produce NaN or Infinity
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(Number.isFinite(result[i]?.[j])).toBe(true);
        }
      }
    });

    it('should match dimension of input matrix', () => {
      const AInv = createIdentityMatrixInverse(6, 1);
      const x = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
      const result = shermanMorrisonUpdate(AInv, x);

      expect(result).toHaveLength(6);
      expect(result[0]).toHaveLength(6);
    });
  });

  describe('vector operations', () => {
    it('dotProduct should compute correctly', () => {
      expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
    });

    it('vectorAdd should add vectors', () => {
      expect(vectorAdd([1, 2], [3, 4])).toEqual([4, 6]);
    });

    it('vectorScale should scale vector', () => {
      expect(vectorScale([1, 2, 3], 2)).toEqual([2, 4, 6]);
    });

    it('matVecMul should multiply matrix and vector', () => {
      const A = [
        [1, 0],
        [0, 1],
      ];
      const x = [3, 4];
      expect(matVecMul(A, x)).toEqual([3, 4]);
    });
  });

  describe('performance characteristics', () => {
    it('Sherman-Morrison completes many updates without error', () => {
      const dim = 6;
      const numUpdates = 100;

      // Simulate LinUCB scenario with Sherman-Morrison incremental updates
      // This is O(d²) per update vs O(d³) for full matrix inverse
      let AInv = createIdentityMatrixInverse(dim, 1);
      for (let i = 0; i < numUpdates; i++) {
        const x = Array.from({ length: dim }, () => Math.random());
        AInv = shermanMorrisonUpdate(AInv, x);
      }

      // Verify the result is a valid matrix (not NaN/Infinity)
      expect(AInv.length).toBe(dim);
      expect(AInv[0]?.length).toBe(dim);
      expect(AInv.every((row) => row.every((val) => Number.isFinite(val)))).toBe(true);
    });
  });
});
