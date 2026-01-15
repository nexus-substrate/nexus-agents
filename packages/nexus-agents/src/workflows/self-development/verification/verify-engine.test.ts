/**
 * Tests for QA Verification Engine
 *
 * (Source: Issue #277 - QA cycle before issue closure)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VerifyEngine, createVerifyEngine } from './verify-engine.js';
import type { CheckDefinition, VerifyEvent, VerifyInput } from './verify-types.js';

// Mock check that always passes
const PASSING_CHECK: CheckDefinition = {
  id: 'pass-check',
  name: 'Always Pass',
  category: 'custom',
  command: 'echo "success"',
  successPatterns: ['success'],
  timeoutMs: 5000,
  required: true,
  weight: 0.5,
};

// Mock check that always fails
const FAILING_CHECK: CheckDefinition = {
  id: 'fail-check',
  name: 'Always Fail',
  category: 'custom',
  command: 'exit 1',
  failurePatterns: ['error'],
  timeoutMs: 5000,
  required: true,
  weight: 0.5,
};

// Optional check
const OPTIONAL_CHECK: CheckDefinition = {
  id: 'optional-check',
  name: 'Optional Check',
  category: 'custom',
  command: 'exit 1',
  timeoutMs: 5000,
  required: false,
  weight: 0.2,
};

describe('VerifyEngine', () => {
  let engine: VerifyEngine;

  beforeEach(() => {
    engine = new VerifyEngine({ checks: [PASSING_CHECK] });
  });

  describe('verify', () => {
    it('should pass when all checks pass', async () => {
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      expect(output.verdict).toBe('pass');
      expect(output.qualityScore).toBeGreaterThan(0);
      expect(output.checkResults.length).toBe(1);
      expect(output.checkResults[0]!.passed).toBe(true);
    });

    it('should fail when required check fails', async () => {
      engine = new VerifyEngine({ checks: [FAILING_CHECK] });
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      expect(output.verdict).toBe('fail');
      expect(output.failureSummary).toBeDefined();
      expect(output.recommendations).toBeDefined();
    });

    it('should pass when only optional checks fail', async () => {
      engine = new VerifyEngine({
        checks: [PASSING_CHECK, OPTIONAL_CHECK],
        passThreshold: 0.5,
      });
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      // Should pass because required check passed and threshold met
      expect(output.verdict).toBe('pass');
    });

    it('should stop on first failure when configured', async () => {
      engine = new VerifyEngine({
        checks: [FAILING_CHECK, PASSING_CHECK],
        stopOnFirstFailure: true,
      });
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      expect(output.verdict).toBe('fail');
      expect(output.checkResults.length).toBe(1);
      expect(output.confidence).toBeLessThan(1);
    });

    it('should continue all checks when stopOnFirstFailure is false', async () => {
      engine = new VerifyEngine({
        checks: [FAILING_CHECK, PASSING_CHECK],
        stopOnFirstFailure: false,
      });
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      expect(output.checkResults.length).toBe(2);
    });

    it('should calculate weighted quality score', async () => {
      engine = new VerifyEngine({
        checks: [
          { ...PASSING_CHECK, weight: 0.8 },
          { ...OPTIONAL_CHECK, weight: 0.2 },
        ],
        passThreshold: 0.5,
      });
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      // Passing check (weight 0.8) should dominate the score
      expect(output.qualityScore).toBeGreaterThan(0.5);
    });

    it('should track duration', async () => {
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      expect(output.durationMs).toBeGreaterThanOrEqual(0);
      expect(output.checkResults[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('events', () => {
    it('should emit verify.started event', async () => {
      const events: VerifyEvent[] = [];
      engine.onEvent((e) => events.push(e));

      await engine.verify({ workDir: process.cwd() });

      const startEvent = events.find((e) => e.type === 'verify.started');
      expect(startEvent).toBeDefined();
      expect(startEvent?.data.checkCount).toBe(1);
    });

    it('should emit verify.check_started and verify.check_completed events', async () => {
      const events: VerifyEvent[] = [];
      engine.onEvent((e) => events.push(e));

      await engine.verify({ workDir: process.cwd() });

      const checkStarted = events.find((e) => e.type === 'verify.check_started');
      const checkCompleted = events.find((e) => e.type === 'verify.check_completed');

      expect(checkStarted).toBeDefined();
      expect(checkStarted?.data.checkId).toBe('pass-check');
      expect(checkCompleted).toBeDefined();
      expect(checkCompleted?.data.passed).toBe(true);
    });

    it('should emit verify.completed event', async () => {
      const events: VerifyEvent[] = [];
      engine.onEvent((e) => events.push(e));

      await engine.verify({ workDir: process.cwd() });

      const completeEvent = events.find((e) => e.type === 'verify.completed');
      expect(completeEvent).toBeDefined();
      expect(completeEvent?.data.verdict).toBe('pass');
    });

    it('should emit verify.feedback_generated on failure', async () => {
      engine = new VerifyEngine({ checks: [FAILING_CHECK], generateFeedback: true });
      const events: VerifyEvent[] = [];
      engine.onEvent((e) => events.push(e));

      await engine.verify({ workDir: process.cwd() });

      const feedbackEvent = events.find((e) => e.type === 'verify.feedback_generated');
      expect(feedbackEvent).toBeDefined();
    });

    it('should allow unsubscribing from events', async () => {
      const events: VerifyEvent[] = [];
      const unsubscribe = engine.onEvent((e) => events.push(e));

      await engine.verify({ workDir: process.cwd() });
      const countBefore = events.length;

      unsubscribe();
      await engine.verify({ workDir: process.cwd() });

      expect(events.length).toBe(countBefore);
    });
  });

  describe('generateFeedback', () => {
    it('should generate feedback from failed verification', async () => {
      engine = new VerifyEngine({ checks: [FAILING_CHECK] });
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      const feedback = engine.generateFeedback(output);

      expect(feedback.summary).toBeDefined();
      expect(feedback.recommendations.length).toBeGreaterThan(0);
      expect(feedback.prioritizedFixes.length).toBeGreaterThan(0);
    });

    it('should prioritize required checks in fixes', async () => {
      engine = new VerifyEngine({
        checks: [FAILING_CHECK, OPTIONAL_CHECK],
      });
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      const feedback = engine.generateFeedback(output);

      // Required should come before optional
      const requiredIndex = feedback.prioritizedFixes.findIndex((f) => f.includes('[REQUIRED]'));
      const optionalIndex = feedback.prioritizedFixes.findIndex((f) => f.includes('[OPTIONAL]'));

      expect(requiredIndex).toBeLessThan(optionalIndex);
    });
  });

  describe('createVerifyEngine', () => {
    it('should create engine with default config', () => {
      const engine = createVerifyEngine();

      expect(engine).toBeInstanceOf(VerifyEngine);
    });

    it('should create engine with custom checks', () => {
      const engine = createVerifyEngine({ checks: [PASSING_CHECK] });

      expect(engine).toBeInstanceOf(VerifyEngine);
    });
  });

  describe('passThreshold', () => {
    it('should fail when score below threshold', async () => {
      engine = new VerifyEngine({
        checks: [PASSING_CHECK],
        passThreshold: 2.0, // Impossible threshold
      });
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      expect(output.verdict).toBe('fail');
    });

    it('should pass when score meets threshold', async () => {
      engine = new VerifyEngine({
        checks: [PASSING_CHECK],
        passThreshold: 0.5,
      });
      const input: VerifyInput = { workDir: process.cwd() };
      const output = await engine.verify(input);

      expect(output.verdict).toBe('pass');
    });
  });

  describe('check analysis', () => {
    it('should detect success patterns', async () => {
      const check: CheckDefinition = {
        id: 'success-pattern',
        name: 'Success Pattern',
        category: 'custom',
        command: 'echo "all tests passed"',
        successPatterns: ['tests passed'],
        timeoutMs: 5000,
        required: true,
        weight: 1,
      };
      engine = new VerifyEngine({ checks: [check] });

      const output = await engine.verify({ workDir: process.cwd() });

      expect(output.checkResults[0]!.passed).toBe(true);
    });

    it('should detect failure patterns', async () => {
      const check: CheckDefinition = {
        id: 'failure-pattern',
        name: 'Failure Pattern',
        category: 'custom',
        command: 'echo "error: something went wrong"',
        failurePatterns: ['error:'],
        timeoutMs: 5000,
        required: true,
        weight: 1,
      };
      engine = new VerifyEngine({ checks: [check] });

      const output = await engine.verify({ workDir: process.cwd() });

      expect(output.checkResults[0]!.passed).toBe(false);
      expect(output.checkResults[0]!.issues?.length).toBeGreaterThan(0);
    });
  });
});
