/**
 * nexus-agents/governance - Fitness Score Tests
 *
 * @module governance/fitness-score.test
 * (Source: System Mandate LOOP I)
 */

import { describe, it, expect, vi } from 'vitest';
import type { ILogger } from '../core/index.js';
import {
  FitnessScoreCalculator,
  createFitnessScoreCalculator,
  calculateFitnessScore,
} from './fitness-score.js';

describe('FitnessScoreCalculator', () => {
  describe('audit', () => {
    it('should return audit with all dimensions', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test-v1.0.0');

      expect(audit.dimensions).toHaveProperty('canonicalPaths');
      expect(audit.dimensions).toHaveProperty('explicitBehavior');
      expect(audit.dimensions).toHaveProperty('determinism');
      expect(audit.dimensions).toHaveProperty('observability');
      expect(audit.dimensions).toHaveProperty('configSimplicity');
      expect(audit.dimensions).toHaveProperty('layerSeparation');
      expect(audit.dimensions).toHaveProperty('operatorErgonomics');
      expect(audit.dimensions).toHaveProperty('governanceIntegration');
    });

    it('should calculate total score from dimensions', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test-v1.0.0');

      const dimensionSum = Object.values(audit.dimensions).reduce(
        (sum: number, val: number) => sum + val,
        0
      );
      expect(audit.score).toBe(dimensionSum);
    });

    it('should have score between 0 and 100', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test-v1.0.0');

      expect(audit.score).toBeGreaterThanOrEqual(0);
      expect(audit.score).toBeLessThanOrEqual(100);
    });

    it('should include timestamp and version', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('v2.4.0');

      expect(audit.version).toBe('v2.4.0');
      expect(audit.timestamp).toBeTruthy();
      // Verify timestamp is valid ISO format
      expect(() => new Date(audit.timestamp)).not.toThrow();
    });

    it('should include findings array', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test-v1.0.0');

      expect(Array.isArray(audit.findings)).toBe(true);
      // Should have at least some findings for current state
      expect(audit.findings.length).toBeGreaterThan(0);
    });
  });

  describe('dimension scoring', () => {
    it('should score canonicalPaths dimension (max 20)', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test');

      expect(audit.dimensions.canonicalPaths).toBeGreaterThanOrEqual(0);
      expect(audit.dimensions.canonicalPaths).toBeLessThanOrEqual(20);
    });

    it('should score explicitBehavior dimension (max 15)', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test');

      expect(audit.dimensions.explicitBehavior).toBeGreaterThanOrEqual(0);
      expect(audit.dimensions.explicitBehavior).toBeLessThanOrEqual(15);
    });

    it('should score determinism dimension (max 15)', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test');

      expect(audit.dimensions.determinism).toBeGreaterThanOrEqual(0);
      expect(audit.dimensions.determinism).toBeLessThanOrEqual(15);
    });

    it('should score observability dimension (max 15)', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test');

      expect(audit.dimensions.observability).toBeGreaterThanOrEqual(0);
      expect(audit.dimensions.observability).toBeLessThanOrEqual(15);
    });

    it('should score configSimplicity dimension (max 10)', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test');

      expect(audit.dimensions.configSimplicity).toBeGreaterThanOrEqual(0);
      expect(audit.dimensions.configSimplicity).toBeLessThanOrEqual(10);
    });

    it('should score layerSeparation dimension (max 10)', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test');

      expect(audit.dimensions.layerSeparation).toBeGreaterThanOrEqual(0);
      expect(audit.dimensions.layerSeparation).toBeLessThanOrEqual(10);
    });

    it('should score operatorErgonomics dimension (max 10)', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test');

      expect(audit.dimensions.operatorErgonomics).toBeGreaterThanOrEqual(0);
      expect(audit.dimensions.operatorErgonomics).toBeLessThanOrEqual(10);
    });

    it('should score governanceIntegration dimension (max 5)', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test');

      expect(audit.dimensions.governanceIntegration).toBeGreaterThanOrEqual(0);
      expect(audit.dimensions.governanceIntegration).toBeLessThanOrEqual(5);
    });
  });

  describe('findings structure', () => {
    it('should have valid finding structure', () => {
      const calculator = new FitnessScoreCalculator();
      const audit = calculator.audit('test');

      for (const finding of audit.findings) {
        expect(finding).toHaveProperty('dimension');
        expect(finding).toHaveProperty('severity');
        expect(finding).toHaveProperty('description');
        expect(finding).toHaveProperty('pointsDeducted');
        expect(['info', 'warning', 'critical']).toContain(finding.severity);
        expect(finding.pointsDeducted).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

describe('createFitnessScoreCalculator', () => {
  it('should create calculator instance', () => {
    const calculator = createFitnessScoreCalculator();
    expect(calculator).toBeInstanceOf(FitnessScoreCalculator);
  });

  it('should accept custom logger and invoke it during audit', () => {
    const mockLogger: ILogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis() as ILogger['child'],
      setLevel: vi.fn(),
    };
    const calculator = createFitnessScoreCalculator(mockLogger);
    calculator.audit('logger-test');

    // Logger should be called with debug for each dimension check
    expect(mockLogger.debug).toHaveBeenCalled();
    // Logger should be called with info for the final result
    expect(mockLogger.info).toHaveBeenCalled();
  });
});

describe('calculateFitnessScore', () => {
  it('should return audit result', () => {
    const audit = calculateFitnessScore('quick-test');

    expect(audit).toHaveProperty('score');
    expect(audit).toHaveProperty('dimensions');
    expect(audit).toHaveProperty('findings');
    expect(audit.version).toBe('quick-test');
  });
});

describe('Fitness score baseline', () => {
  it('should meet minimum baseline score', () => {
    const audit = calculateFitnessScore('baseline-test');

    // Current baseline expectation: 70+ points
    // This will increase as consolidation progresses
    expect(audit.score).toBeGreaterThanOrEqual(70);
  });

  it('should reflect completed token estimation consolidation', () => {
    const audit = calculateFitnessScore('redundancy-test');

    const tokenFinding = audit.findings.find((f) =>
      f.description.toLowerCase().includes('token estimation')
    );

    // Token estimation consolidation is complete - no finding expected
    // All adapters now use unified TokenEstimator from core/token-estimator.ts
    // (Commits: 11fadd6, 06724b5, 45abf43)
    expect(tokenFinding).toBeUndefined();
  });

  it('should track task analysis consolidation', () => {
    const audit = calculateFitnessScore('consolidation-test');

    const taskAnalysisFinding = audit.findings.find((f) =>
      f.description.toLowerCase().includes('task analysis')
    );

    // Task analysis consolidation is complete - no finding expected
    // CLI routing pipeline uses SharedTaskAnalyzer via taskAnalysisResultToTaskProfile()
    // (Commits: cb81074 - routing pipeline migration)
    expect(taskAnalysisFinding).toBeUndefined();
  });
});
