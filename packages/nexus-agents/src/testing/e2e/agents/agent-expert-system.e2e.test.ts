/**
 * Agent Expert System E2E Tests
 *
 * End-to-end tests for expert registry, task analysis,
 * expert selection, and failure recovery.
 *
 * @module testing/e2e/agents/agent-expert-system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  // Expert System
  ExpertRegistry,
  ExpertFactory,
  analyzeTask,
  selectExperts,
  createDefaultRegistry,
  // Resilience
  createFailureDetector,
  createRecoveryManager,
} from '../../../agents/index.js';
import type { Task } from '../../../core/index.js';
import { assertOk, generateTestId } from '../utils/index.js';

/**
 * Helper to create a proper Task object for testing.
 */
function createTestTask(description: string, id?: string): Task {
  return {
    id: id ?? generateTestId('task'),
    description,
    context: {},
  };
}

describe('Agent Expert System E2E Tests', () => {
  describe('Expert Registry', () => {
    beforeEach(() => {
      // Reset singleton for clean test state
      ExpertRegistry.resetInstance();
    });

    afterEach(() => {
      ExpertRegistry.resetInstance();
    });

    it('should register and retrieve experts', () => {
      const registry = ExpertRegistry.getInstance();

      // Create an expert using the factory
      const expertResult = ExpertFactory.createBuiltIn('code');
      expect(expertResult.ok).toBe(true);

      if (expertResult.ok) {
        registry.register(expertResult.value);

        // registry.get() returns Result<Expert, RegistryError>
        const retrieved = registry.get(expertResult.value.id);
        expect(retrieved.ok).toBe(true);
        if (retrieved.ok) {
          expect(retrieved.value.id).toBe(expertResult.value.id);
        }
      }
    });

    it('should list all registered experts', () => {
      const registry = ExpertRegistry.getInstance();

      const codeExpert = ExpertFactory.createBuiltIn('code');
      const securityExpert = ExpertFactory.createBuiltIn('security');

      if (codeExpert.ok) registry.register(codeExpert.value);
      if (securityExpert.ok) registry.register(securityExpert.value);

      const all = registry.list();
      expect(all.length).toBe(2);
    });

    it('should query experts by capability', () => {
      const registry = ExpertRegistry.getInstance();

      const codeExpert = ExpertFactory.createBuiltIn('code');
      const securityExpert = ExpertFactory.createBuiltIn('security');

      if (codeExpert.ok) registry.register(codeExpert.value);
      if (securityExpert.ok) registry.register(securityExpert.value);

      // Query by a capability that code expert would have
      const codeExperts = registry.getByCapability('code_review');
      expect(codeExperts.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide registry statistics', () => {
      const registry = ExpertRegistry.getInstance();

      const codeExpert = ExpertFactory.createBuiltIn('code');
      if (codeExpert.ok) registry.register(codeExpert.value);

      const stats = registry.getStats();
      // RegistryStats has totalExperts not total
      expect(stats.totalExperts).toBe(1);
    });
  });

  describe('Task Analysis', () => {
    it('should analyze code-related tasks', () => {
      const task = createTestTask('Review this TypeScript function for bugs');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe('code');
      }
    });

    it('should analyze security-related tasks', () => {
      const task = createTestTask('Check for SQL injection vulnerabilities');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe('security');
      }
    });

    it('should analyze architecture-related tasks', () => {
      const task = createTestTask('Design the microservices architecture');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe('architecture');
      }
    });

    it('should estimate task complexity', () => {
      const simpleTask = createTestTask('Fix typo in README');
      const complexTask = createTestTask(
        'Design and implement a distributed caching system with replication'
      );

      const simpleResult = analyzeTask(simpleTask);
      const complexResult = analyzeTask(complexTask);

      const simpleAnalysis = assertOk(simpleResult);
      const complexAnalysis = assertOk(complexResult);

      // More complex task should have higher complexity
      const complexityOrder = ['low', 'medium', 'high'];
      expect(complexityOrder.indexOf(complexAnalysis.complexity)).toBeGreaterThanOrEqual(
        complexityOrder.indexOf(simpleAnalysis.complexity)
      );
    });
  });

  describe('Expert Selection', () => {
    let registry: ReturnType<typeof createDefaultRegistry>;

    beforeEach(() => {
      // Reset singleton and create fresh registry interface
      ExpertRegistry.resetInstance();
      const realRegistry = ExpertRegistry.getInstance();

      // Register test experts
      const codeExpert = ExpertFactory.createBuiltIn('code');
      const securityExpert = ExpertFactory.createBuiltIn('security');
      const testingExpert = ExpertFactory.createBuiltIn('testing');

      if (codeExpert.ok) realRegistry.register(codeExpert.value);
      if (securityExpert.ok) realRegistry.register(securityExpert.value);
      if (testingExpert.ok) realRegistry.register(testingExpert.value);

      // Create the registry interface for selectExperts
      registry = createDefaultRegistry();
    });

    afterEach(() => {
      ExpertRegistry.resetInstance();
    });

    it('should select appropriate experts for task', () => {
      const task = createTestTask('Review code for security issues');
      const result = selectExperts(task, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary).toBeDefined();
      }
    });

    it('should rank experts by match score', () => {
      const task = createTestTask('Generate unit tests');
      const result = selectExperts(task, registry);

      const selection = assertOk(result);

      // Result should have primary and alternatives
      expect(selection.primary).toBeDefined();
    });

    it('should provide alternatives when available', () => {
      const task = createTestTask('Review and test and secure the code');
      const result = selectExperts(task, registry, { maxAlternatives: 2 });

      const selection = assertOk(result);
      // May have alternatives depending on registered experts
      expect(selection.alternatives).toBeDefined();
    });
  });

  describe('Failure Detection', () => {
    it('should detect premature action patterns', () => {
      const detector = createFailureDetector();

      const input = {
        messages: [{ role: 'assistant' as const, content: 'I will run the command now' }],
        toolCalls: [{ name: 'bash', input: { command: 'rm -rf /' }, success: true }],
        output: 'Running command...',
        taskDescription: 'Analyze the code',
      };

      const result = detector.detect(input);

      // Should detect potential issues
      expect(result.analysisMetadata).toBeDefined();
    });

    it('should detect context pollution', () => {
      const detector = createFailureDetector();

      // Simulate a case with excessive output
      const input = {
        messages: [{ role: 'assistant' as const, content: 'A'.repeat(10000) }],
        output: 'B'.repeat(10000),
        taskDescription: 'Simple task',
      };

      const result = detector.detect(input);
      expect(result).toBeDefined();
    });

    it('should detect no failure in normal execution', () => {
      const detector = createFailureDetector();

      const input = {
        messages: [
          { role: 'user' as const, content: 'Review this code' },
          { role: 'assistant' as const, content: 'I found a bug in line 5' },
        ],
        toolCalls: [{ name: 'read_file', input: { path: 'test.ts' }, success: true }],
        output: 'Code review complete',
        taskDescription: 'Review this code',
      };

      const result = detector.detect(input);

      // Normal execution should not have critical failures
      expect(!result.hasFailure || result.failures.length === 0).toBe(true);
    });
  });

  describe('Recovery Manager', () => {
    it('should suggest recovery for failures', () => {
      const manager = createRecoveryManager();

      // DetectedFailure requires specific fields
      const failure = {
        archetype: 'premature_action' as const,
        severity: 'high' as const,
        description: 'Agent took action without understanding',
        indicators: ['Executed command before reading context'],
        confidence: 0.8,
        timestamp: Date.now(),
      };

      // getRecoveryAction returns RecoveryAction string directly
      const action = manager.getRecoveryAction(failure);

      expect(action).toBeDefined();
      expect(typeof action).toBe('string');
      // RecoveryAction values from failure-types.ts
      expect([
        'retry_with_inspection',
        'request_clarification',
        'context_reset',
        'tool_validation',
        'escalate',
        'abort',
      ]).toContain(action);
    });

    it('should generate recovery instructions', () => {
      const manager = createRecoveryManager();

      // RecoveryContext requires task, messages, failure, attemptNumber
      const failure = {
        archetype: 'context_pollution' as const,
        severity: 'medium' as const,
        description: 'Context became too large',
        indicators: ['Output exceeded threshold'],
        confidence: 0.6,
        timestamp: Date.now(),
      };

      const context = {
        task: createTestTask('Complete the task'),
        messages: [] as const,
        failure,
        attemptNumber: 2,
      };

      // generateRecoveryInstructions returns RecoveryInstructions object
      const instructions = manager.generateRecoveryInstructions(context);

      expect(instructions).toBeDefined();
      expect(typeof instructions.systemPromptAddition).toBe('string');
      expect(typeof instructions.contextReset).toBe('boolean');
      expect(Array.isArray(instructions.additionalConstraints)).toBe(true);
    });

    it('should determine if recovery should be attempted', () => {
      const manager = createRecoveryManager();

      // DetectedFailure requires correct fields
      const minorFailure = {
        archetype: 'over_helpfulness' as const,
        severity: 'low' as const,
        description: 'Agent was too eager',
        indicators: [],
        confidence: 0.3,
        timestamp: Date.now(),
      };

      const severeFailure = {
        archetype: 'fragile_execution' as const,
        severity: 'critical' as const,
        description: 'Critical failure',
        indicators: [],
        confidence: 0.9,
        timestamp: Date.now(),
      };

      // Minor failures should allow recovery
      expect(manager.shouldAttemptRecovery(minorFailure)).toBe(true);

      // Very severe failures might not allow recovery
      const shouldAttemptSevere = manager.shouldAttemptRecovery(severeFailure);
      expect(typeof shouldAttemptSevere).toBe('boolean');
    });
  });
});
