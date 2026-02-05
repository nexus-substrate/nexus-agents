/**
 * Tests for math-utils utilities
 *
 * @module utils/math-utils.test
 */

import { describe, it, expect } from 'vitest';
import { clamp, clamp01, clampScore, clampPercent } from './math-utils.js';

describe('math-utils', () => {
  describe('clamp', () => {
    it('returns value when within bounds', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it('returns min when value is below min', () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    it('returns max when value is above max', () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it('handles value equal to min', () => {
      expect(clamp(0, 0, 100)).toBe(0);
    });

    it('handles value equal to max', () => {
      expect(clamp(100, 0, 100)).toBe(100);
    });

    it('handles negative range', () => {
      expect(clamp(-50, -100, -10)).toBe(-50);
      expect(clamp(-150, -100, -10)).toBe(-100);
      expect(clamp(0, -100, -10)).toBe(-10);
    });

    it('handles decimal values', () => {
      expect(clamp(0.5, 0, 1)).toBe(0.5);
      expect(clamp(1.5, 0, 1)).toBe(1);
      expect(clamp(-0.5, 0, 1)).toBe(0);
    });

    it('handles same min and max', () => {
      expect(clamp(50, 10, 10)).toBe(10);
      expect(clamp(5, 10, 10)).toBe(10);
      expect(clamp(15, 10, 10)).toBe(10);
    });

    it('handles zero as bounds', () => {
      expect(clamp(-5, 0, 0)).toBe(0);
      expect(clamp(5, 0, 0)).toBe(0);
    });
  });

  describe('clamp01', () => {
    it('returns value when within [0, 1]', () => {
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(0.7)).toBe(0.7);
    });

    it('returns 0 when value is negative', () => {
      expect(clamp01(-0.5)).toBe(0);
      expect(clamp01(-100)).toBe(0);
    });

    it('returns 1 when value is above 1', () => {
      expect(clamp01(1.5)).toBe(1);
      expect(clamp01(100)).toBe(1);
    });

    it('handles boundary values', () => {
      expect(clamp01(0)).toBe(0);
      expect(clamp01(1)).toBe(1);
    });

    it('handles very small positive values', () => {
      expect(clamp01(0.001)).toBe(0.001);
    });

    it('handles values very close to boundaries', () => {
      expect(clamp01(0.999)).toBe(0.999);
      expect(clamp01(1.001)).toBe(1);
    });
  });

  describe('clampScore', () => {
    it('returns value when within [0, 10]', () => {
      expect(clampScore(5)).toBe(5);
      expect(clampScore(7.5)).toBe(7.5);
    });

    it('returns 0 when value is negative', () => {
      expect(clampScore(-5)).toBe(0);
    });

    it('returns 10 when value is above 10', () => {
      expect(clampScore(15)).toBe(10);
      expect(clampScore(100)).toBe(10);
    });

    it('handles boundary values', () => {
      expect(clampScore(0)).toBe(0);
      expect(clampScore(10)).toBe(10);
    });

    it('handles decimal scores', () => {
      expect(clampScore(7.8)).toBe(7.8);
      expect(clampScore(9.99)).toBe(9.99);
    });
  });

  describe('clampPercent', () => {
    it('returns value when within [0, 100]', () => {
      expect(clampPercent(50)).toBe(50);
      expect(clampPercent(75.5)).toBe(75.5);
    });

    it('returns 0 when value is negative', () => {
      expect(clampPercent(-10)).toBe(0);
    });

    it('returns 100 when value is above 100', () => {
      expect(clampPercent(150)).toBe(100);
      expect(clampPercent(1000)).toBe(100);
    });

    it('handles boundary values', () => {
      expect(clampPercent(0)).toBe(0);
      expect(clampPercent(100)).toBe(100);
    });

    it('handles decimal percentages', () => {
      expect(clampPercent(33.33)).toBe(33.33);
      expect(clampPercent(99.99)).toBe(99.99);
    });
  });
});
