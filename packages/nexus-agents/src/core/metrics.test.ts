/**
 * Error Metrics Tests
 *
 * (Source: Issue #112)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorMetricsCollector, recordError, errorMetrics } from './metrics.js';
import { ErrorCode, ValidationError, SecurityError } from './errors.js';

describe('ErrorMetricsCollector', () => {
  let collector: ErrorMetricsCollector;

  beforeEach(() => {
    collector = new ErrorMetricsCollector();
  });

  describe('record', () => {
    it('should increment total error count', () => {
      collector.record({
        component: 'test-component',
        error: new Error('Test error'),
      });

      const metrics = collector.getMetrics();
      expect(metrics.totalErrors).toBe(1);
    });

    it('should track errors by code for NexusError', () => {
      const error = new ValidationError('Invalid input');
      collector.record({
        component: 'validator',
        error,
      });

      expect(collector.getCountByCode(ErrorCode.VALIDATION_ERROR)).toBe(1);
    });

    it('should track errors by component', () => {
      collector.record({
        component: 'auth-service',
        error: new Error('Auth failed'),
      });
      collector.record({
        component: 'auth-service',
        error: new Error('Token expired'),
      });

      expect(collector.getCountByComponent('auth-service')).toBe(2);
    });

    it('should track last error details', () => {
      const error = new SecurityError('Path traversal detected');
      collector.record({
        component: 'file-handler',
        error,
      });

      const metrics = collector.getMetrics();
      expect(metrics.lastError).toBeDefined();
      expect(metrics.lastError?.code).toBe(ErrorCode.SECURITY_ERROR);
      expect(metrics.lastError?.component).toBe('file-handler');
      expect(metrics.lastError?.message).toBe('Path traversal detected');
    });

    it('should handle generic Error as INTERNAL_ERROR', () => {
      collector.record({
        component: 'unknown',
        error: new Error('Something broke'),
      });

      expect(collector.getCountByCode('INTERNAL_ERROR' as ErrorCode)).toBe(1);
    });
  });

  describe('getMetrics', () => {
    it('should return snapshot with all metrics', () => {
      collector.record({
        component: 'test',
        error: new ValidationError('Bad input'),
      });

      const metrics = collector.getMetrics();

      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByCode.size).toBe(1);
      expect(metrics.errorsByComponent.size).toBe(1);
      expect(metrics.startedAt).toBeInstanceOf(Date);
      expect(metrics.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return immutable maps', () => {
      collector.record({
        component: 'test',
        error: new Error('Test'),
      });

      const metrics1 = collector.getMetrics();
      const metrics2 = collector.getMetrics();

      expect(metrics1.errorsByCode).not.toBe(metrics2.errorsByCode);
      expect(metrics1.errorsByComponent).not.toBe(metrics2.errorsByComponent);
    });
  });

  describe('export', () => {
    it('should export metrics in monitoring format', () => {
      collector.record({
        component: 'api',
        error: new ValidationError('Bad request'),
      });
      collector.record({
        component: 'api',
        error: new SecurityError('Unauthorized'),
      });

      const exported = collector.export();

      expect(exported.timestamp).toBeGreaterThan(0);
      expect(exported.totalErrors).toBe(2);
      expect(exported.errorRatePerMinute).toBeGreaterThanOrEqual(0);
      expect(exported.topErrorCodes.length).toBeLessThanOrEqual(5);
      expect(exported.topComponents.length).toBeLessThanOrEqual(5);
      expect(exported.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('should sort top error codes by count', () => {
      // Record multiple errors of different types
      for (let i = 0; i < 5; i++) {
        collector.record({
          component: 'test',
          error: new ValidationError('Validation error'),
        });
      }
      for (let i = 0; i < 3; i++) {
        collector.record({
          component: 'test',
          error: new SecurityError('Security error'),
        });
      }

      const exported = collector.export();

      expect(exported.topErrorCodes[0]?.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(exported.topErrorCodes[0]?.count).toBe(5);
    });
  });

  describe('reset', () => {
    it('should reset all metrics to initial state', () => {
      collector.record({
        component: 'test',
        error: new Error('Test'),
      });
      expect(collector.getMetrics().totalErrors).toBe(1);

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.errorsByCode.size).toBe(0);
      expect(metrics.errorsByComponent.size).toBe(0);
      expect(metrics.lastError).toBeUndefined();
    });
  });

  describe('getCountByCode', () => {
    it('should return 0 for unknown code', () => {
      expect(collector.getCountByCode(ErrorCode.AGENT_ERROR)).toBe(0);
    });

    it('should return correct count for tracked code', () => {
      collector.record({
        component: 'test',
        error: new ValidationError('Error 1'),
      });
      collector.record({
        component: 'test',
        error: new ValidationError('Error 2'),
      });

      expect(collector.getCountByCode(ErrorCode.VALIDATION_ERROR)).toBe(2);
    });
  });

  describe('getCountByComponent', () => {
    it('should return 0 for unknown component', () => {
      expect(collector.getCountByComponent('unknown-component')).toBe(0);
    });

    it('should return correct count for tracked component', () => {
      collector.record({
        component: 'my-service',
        error: new Error('Error 1'),
      });
      collector.record({
        component: 'my-service',
        error: new Error('Error 2'),
      });
      collector.record({
        component: 'other-service',
        error: new Error('Error 3'),
      });

      expect(collector.getCountByComponent('my-service')).toBe(2);
      expect(collector.getCountByComponent('other-service')).toBe(1);
    });
  });
});

describe('recordError helper', () => {
  beforeEach(() => {
    errorMetrics.reset();
  });

  it('should record error to global metrics', () => {
    recordError('test-component', new Error('Test error'));

    const metrics = errorMetrics.getMetrics();
    expect(metrics.totalErrors).toBe(1);
    expect(metrics.lastError?.component).toBe('test-component');
  });
});

describe('errorMetrics singleton', () => {
  beforeEach(() => {
    errorMetrics.reset();
  });

  it('should be a singleton instance', () => {
    const metrics1 = errorMetrics;
    const metrics2 = errorMetrics;

    expect(metrics1).toBe(metrics2);
  });

  it('should persist state across calls', () => {
    errorMetrics.record({
      component: 'test',
      error: new Error('First'),
    });

    // Access via another reference
    const same = errorMetrics;
    same.record({
      component: 'test',
      error: new Error('Second'),
    });

    expect(errorMetrics.getMetrics().totalErrors).toBe(2);
  });
});
