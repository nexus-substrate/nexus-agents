/**
 * Tests for agent failure recovery strategies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Task, Message } from '../../core/index.js';
import {
  RecoveryManager,
  createRecoveryManager,
  buildRecoveryResult,
} from './recovery-strategies.js';
import type { DetectedFailure, RecoveryAction } from './failure-types.js';

describe('RecoveryManager', () => {
  let manager: RecoveryManager;

  const createFailure = (
    archetype: DetectedFailure['archetype'],
    severity: DetectedFailure['severity'] = 'medium',
    confidence = 0.7
  ): DetectedFailure => ({
    archetype,
    severity,
    description: `Test ${archetype} failure`,
    indicators: ['Test indicator'],
    confidence,
    timestamp: Date.now(),
  });

  const createTask = (id = 'test-task'): Task => ({
    id,
    description: 'Test task description',
    context: {},
  });

  const createMessages = (): Message[] => [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
  ];

  beforeEach(() => {
    manager = createRecoveryManager();
  });

  describe('getRecoveryAction', () => {
    it('should return appropriate action for each archetype', () => {
      const archetypeActions: Record<DetectedFailure['archetype'], RecoveryAction> = {
        premature_action: 'retry_with_inspection',
        over_helpfulness: 'request_clarification',
        context_pollution: 'context_reset',
        fragile_execution: 'tool_validation',
      };

      for (const [archetype, expectedAction] of Object.entries(archetypeActions)) {
        const failure = createFailure(archetype as DetectedFailure['archetype']);
        const action = manager.getRecoveryAction(failure);
        expect(action).toBe(expectedAction);
      }
    });

    it('should escalate after threshold attempts', () => {
      const failure = createFailure('premature_action');

      // Simulate multiple attempts
      for (let i = 0; i < 3; i++) {
        manager.generateRecoveryInstructions({
          task: createTask(),
          messages: createMessages(),
          failure,
          attemptNumber: i + 1,
        });
      }

      const action = manager.getRecoveryAction(failure);
      expect(action).toBe('escalate');
    });
  });

  describe('generateRecoveryInstructions', () => {
    it('should generate instructions for premature action', () => {
      const failure = createFailure('premature_action');
      const instructions = manager.generateRecoveryInstructions({
        task: createTask(),
        messages: createMessages(),
        failure,
        attemptNumber: 1,
      });

      expect(instructions.systemPromptAddition).toContain('Premature Action');
      expect(instructions.systemPromptAddition).toContain('schema inspection');
      expect(instructions.contextReset).toBe(false);
      expect(instructions.additionalConstraints.length).toBeGreaterThan(0);
    });

    it('should generate instructions for over-helpfulness', () => {
      const failure = createFailure('over_helpfulness');
      const instructions = manager.generateRecoveryInstructions({
        task: createTask(),
        messages: createMessages(),
        failure,
        attemptNumber: 1,
      });

      expect(instructions.systemPromptAddition).toContain('Over-Helpfulness');
      expect(instructions.systemPromptAddition).toContain('confirmation');
      expect(instructions.contextReset).toBe(false);
    });

    it('should generate instructions for context pollution', () => {
      const failure = createFailure('context_pollution');
      const instructions = manager.generateRecoveryInstructions({
        task: createTask(),
        messages: createMessages(),
        failure,
        attemptNumber: 1,
      });

      expect(instructions.systemPromptAddition).toContain('Context Pollution');
      expect(instructions.contextReset).toBe(true);
    });

    it('should generate instructions for fragile execution', () => {
      const failure = createFailure('fragile_execution');
      const instructions = manager.generateRecoveryInstructions({
        task: createTask(),
        messages: createMessages(),
        failure,
        attemptNumber: 1,
      });

      expect(instructions.systemPromptAddition).toContain('Fragile Execution');
      expect(instructions.systemPromptAddition).toContain('Validate');
      expect(instructions.contextReset).toBe(false);
    });

    it('should include attempt number in instructions', () => {
      const failure = createFailure('premature_action');
      const instructions = manager.generateRecoveryInstructions({
        task: createTask(),
        messages: createMessages(),
        failure,
        attemptNumber: 2,
      });

      expect(instructions.systemPromptAddition).toContain('Attempt 2');
    });
  });

  describe('shouldAttemptRecovery', () => {
    it('should allow recovery within retry limits', () => {
      const failure = createFailure('premature_action');
      expect(manager.shouldAttemptRecovery(failure)).toBe(true);
    });

    it('should prevent recovery after max retries', () => {
      const failure = createFailure('premature_action');

      // Exhaust retries (premature_action has maxRetries: 2)
      for (let i = 0; i < 2; i++) {
        manager.generateRecoveryInstructions({
          task: createTask(),
          messages: createMessages(),
          failure,
          attemptNumber: i + 1,
        });
      }

      expect(manager.shouldAttemptRecovery(failure)).toBe(false);
    });
  });

  describe('recordRecoveryAttempt', () => {
    it('should reset attempt count on success', () => {
      const failure = createFailure('premature_action');

      // Make some attempts
      manager.generateRecoveryInstructions({
        task: createTask(),
        messages: createMessages(),
        failure,
        attemptNumber: 1,
      });

      // Record success
      manager.recordRecoveryAttempt(
        failure,
        buildRecoveryResult({
          action: 'retry_with_inspection',
          attemptNumber: 1,
          success: true,
          durationMs: 100,
          message: 'Recovery succeeded',
        })
      );

      // Should allow new attempts
      expect(manager.shouldAttemptRecovery(failure)).toBe(true);
    });

    it('should not reset count on failure', () => {
      const failure = createFailure('over_helpfulness');

      // Make an attempt
      manager.generateRecoveryInstructions({
        task: createTask(),
        messages: createMessages(),
        failure,
        attemptNumber: 1,
      });

      // Record failure
      manager.recordRecoveryAttempt(
        failure,
        buildRecoveryResult({
          action: 'request_clarification',
          attemptNumber: 1,
          success: false,
          durationMs: 100,
          message: 'Recovery failed',
        })
      );

      // over_helpfulness has maxRetries: 1, so should not allow more
      expect(manager.shouldAttemptRecovery(failure)).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should respect custom global max retries', () => {
      const customManager = createRecoveryManager({ globalMaxRetries: 1 });
      const failure = createFailure('fragile_execution');

      // fragile_execution has maxRetries: 3, but global is 1
      customManager.generateRecoveryInstructions({
        task: createTask(),
        messages: createMessages(),
        failure,
        attemptNumber: 1,
      });

      expect(customManager.shouldAttemptRecovery(failure)).toBe(false);
    });
  });
});

describe('buildRecoveryResult', () => {
  it('should build a complete recovery result', () => {
    const result = buildRecoveryResult({
      action: 'retry_with_inspection',
      attemptNumber: 2,
      success: true,
      durationMs: 150,
      message: 'Successfully recovered',
      newContext: { newKey: 'newValue' },
    });

    expect(result).toEqual({
      success: true,
      action: 'retry_with_inspection',
      attemptNumber: 2,
      durationMs: 150,
      message: 'Successfully recovered',
      newContext: { newKey: 'newValue' },
    });
  });

  it('should handle missing optional fields', () => {
    const result = buildRecoveryResult({
      action: 'abort',
      attemptNumber: 1,
      success: false,
      durationMs: 50,
      message: 'Aborted recovery',
    });

    expect(result.newContext).toBeUndefined();
  });
});
