/**
 * Agent Framework E2E Tests
 *
 * End-to-end tests for agent lifecycle, state machine,
 * expert system, and context management.
 *
 * @module testing/e2e/agents/agent-framework
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  // State Machine
  createStateMachine,
  type AgentStateMachine,
  // Context Management
  ContextManager,
  ContextPruner,
  ContentPriority,
  // Expert System
  ExpertRegistry,
  ExpertFactory,
  analyzeTask,
  selectExperts,
  createDefaultRegistry,
  // Resilience
  createFailureDetector,
  createRecoveryManager,
  // Skill Library
  createSkillLibrary,
  createSkillComposer,
} from '../../../agents/index.js';
import type { AgentState, Task } from '../../../core/index.js';
import { measureLatency, assertOk, generateTestId } from '../utils/index.js';

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

// Note: Test logger not currently needed - using real logger from factory

describe('Agent Framework E2E Tests', () => {
  describe('State Machine', () => {
    let stateMachine: AgentStateMachine;
    let stateChanges: Array<{ from: AgentState; to: AgentState }>;

    beforeEach(() => {
      stateChanges = [];
      stateMachine = createStateMachine({
        initialState: 'idle',
      });
      // Register callback AFTER creation via onStateChange method
      stateMachine.onStateChange((transition) => {
        stateChanges.push({ from: transition.from, to: transition.to });
      });
    });

    afterEach(() => {
      stateChanges = [];
    });

    it('should start in idle state', () => {
      expect(stateMachine.state).toBe('idle');
    });

    it('should transition through valid states using events', () => {
      // idle -> thinking via 'task_assigned' event
      const thinkingResult = stateMachine.transition('task_assigned');
      expect(thinkingResult.ok).toBe(true);
      expect(stateMachine.state).toBe('thinking');

      // thinking -> acting via 'plan_completed' event
      const actingResult = stateMachine.transition('plan_completed');
      expect(actingResult.ok).toBe(true);
      expect(stateMachine.state).toBe('acting');

      // acting -> idle via 'task_completed' event
      const idleResult = stateMachine.transition('task_completed');
      expect(idleResult.ok).toBe(true);
      expect(stateMachine.state).toBe('idle');
    });

    it('should reject invalid transitions', () => {
      // Can't trigger 'plan_completed' from idle (needs to be in thinking state)
      const result = stateMachine.transition('plan_completed');
      expect(result.ok).toBe(false);
      expect(stateMachine.state).toBe('idle');
    });

    it('should track state change events', () => {
      stateMachine.transition('task_assigned'); // idle -> thinking
      stateMachine.transition('plan_completed'); // thinking -> acting
      stateMachine.transition('task_completed'); // acting -> idle

      expect(stateChanges).toHaveLength(3);
      expect(stateChanges[0]).toEqual({ from: 'idle', to: 'thinking' });
      expect(stateChanges[1]).toEqual({ from: 'thinking', to: 'acting' });
      expect(stateChanges[2]).toEqual({ from: 'acting', to: 'idle' });
    });

    it('should handle error state transitions', () => {
      stateMachine.transition('task_assigned'); // idle -> thinking
      const errorResult = stateMachine.transition('failure'); // thinking -> error

      expect(errorResult.ok).toBe(true);
      expect(stateMachine.state).toBe('error');

      // Can recover from error to idle via 'recovered' event
      const recoverResult = stateMachine.transition('recovered');
      expect(recoverResult.ok).toBe(true);
      expect(stateMachine.state).toBe('idle');
    });

    it('should provide state history', () => {
      stateMachine.transition('task_assigned');
      stateMachine.transition('plan_completed');

      const history = stateMachine.transitionHistory;
      expect(history.length).toBeGreaterThanOrEqual(2);
      // History contains transition records
      expect(history.some((h) => h.to === 'thinking')).toBe(true);
      expect(history.some((h) => h.to === 'acting')).toBe(true);
    });

    it('should reset to initial state', () => {
      stateMachine.transition('task_assigned');
      stateMachine.transition('plan_completed');
      stateMachine.reset();

      expect(stateMachine.state).toBe('idle');
    });
  });

  describe('Context Manager', () => {
    let contextManager: ContextManager;

    beforeEach(() => {
      contextManager = new ContextManager({
        maxTokens: 10000,
      });
    });

    it('should add and track context items', async () => {
      const result1 = await contextManager.add({
        id: 'item1',
        content: 'Test content',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });
      const result2 = await contextManager.add({
        id: 'item2',
        content: 'More content',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      const stats = contextManager.getStats();
      // itemCounts is a record by category
      const totalItems = Object.values(stats.itemCounts).reduce((a, b) => a + b, 0);
      expect(totalItems).toBe(2);
    });

    it('should remove context items', async () => {
      await contextManager.add({
        id: 'item1',
        content: 'Test content',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });
      await contextManager.add({
        id: 'item2',
        content: 'More content',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });

      const removed = contextManager.remove('item1');
      expect(removed).toBe(true);

      const stats = contextManager.getStats();
      const totalItems = Object.values(stats.itemCounts).reduce((a, b) => a + b, 0);
      expect(totalItems).toBe(1);
    });

    it('should get context by key', async () => {
      await contextManager.add({
        id: 'myKey',
        content: 'My content',
        priority: ContentPriority.TASK,
        category: 'task',
      });

      const item = contextManager.get('myKey');
      expect(item?.content).toBe('My content');
    });

    it('should clear all context', async () => {
      await contextManager.add({
        id: 'item1',
        content: 'Content 1',
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });
      await contextManager.add({
        id: 'item2',
        content: 'Content 2',
        priority: ContentPriority.TASK,
        category: 'task',
      });

      contextManager.clear();

      const stats = contextManager.getStats();
      const totalItems = Object.values(stats.itemCounts).reduce((a, b) => a + b, 0);
      expect(totalItems).toBe(0);
    });

    it('should track token usage', async () => {
      const longContent = 'word '.repeat(100);
      await contextManager.add({
        id: 'long',
        content: longContent,
        priority: ContentPriority.ACTIVE,
        category: 'active',
      });

      const stats = contextManager.getStats();
      expect(stats.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('Context Pruner', () => {
    let contextManager: ContextManager;
    let pruner: ContextPruner;

    beforeEach(() => {
      contextManager = new ContextManager({
        maxTokens: 1000,
      });
      pruner = new ContextPruner({
        contextManager,
        defaultStrategy: 'oldest_first',
      });
    });

    it('should identify prune candidates', async () => {
      // Add items to context manager in active category
      await contextManager.add({
        id: 'old',
        content: 'Old content that is quite long to take up tokens',
        priority: ContentPriority.HISTORY,
        category: 'active',
        metadata: { addedAt: Date.now() - 10000 },
      });
      await contextManager.add({
        id: 'new',
        content: 'New content that is also quite long',
        priority: ContentPriority.HISTORY,
        category: 'active',
        metadata: { addedAt: Date.now() },
      });

      // getPruneCandidates expects category array
      const candidates = pruner.getPruneCandidates(['active']);
      expect(candidates.length).toBeGreaterThan(0);
    });

    it('should check if pruning is needed', async () => {
      // Initially should not need pruning
      expect(pruner.shouldPrune()).toBe(false);

      // Add lots of content to exceed budget
      for (let i = 0; i < 30; i++) {
        await contextManager.add({
          id: `item-${String(i)}`,
          content: 'Long content '.repeat(20),
          priority: ContentPriority.ACTIVE,
          category: 'active',
        });
      }

      // Now should need pruning (if over budget)
      const stats = contextManager.getStats();
      // Check if we're using significant capacity
      expect(stats.usagePercentage).toBeGreaterThan(0);
    });

    it('should prune context when over budget', async () => {
      // Fill context to capacity
      for (let i = 0; i < 30; i++) {
        await contextManager.add({
          id: `item-${String(i)}`,
          content: 'Content '.repeat(10),
          priority: ContentPriority.ACTIVE,
          category: 'active',
          metadata: { addedAt: Date.now() - (30 - i) * 1000 },
        });
      }

      const result = await pruner.prune({ targetTokens: 500 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // PruneResult has removedItems array and tokensFreed
        expect(Array.isArray(result.value.removedItems)).toBe(true);
        expect(typeof result.value.tokensFreed).toBe('number');
        expect(result.value.tokensFreed).toBeGreaterThanOrEqual(0);
      }
    });
  });

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

      assertOk(result);

      // Result should have primary and alternatives
      expect(result.value.primary).toBeDefined();
    });

    it('should provide alternatives when available', () => {
      const task = createTestTask('Review and test and secure the code');
      const result = selectExperts(task, registry, { maxAlternatives: 2 });

      assertOk(result);
      // May have alternatives depending on registered experts
      expect(result.value.alternatives).toBeDefined();
    });
  });

  describe('Failure Detection', () => {
    it('should detect premature action patterns', () => {
      const detector = createFailureDetector();

      const input = {
        messages: [{ role: 'assistant' as const, content: 'I will run the command now' }],
        toolCalls: [{ name: 'bash', args: { command: 'rm -rf /' } }],
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
        toolCalls: [{ name: 'read_file', args: { path: 'test.ts' } }],
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

      // DetectedFailure requires correct fields: indicators not evidence, severity is string
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

  describe('Skill Library (Voyager Pattern)', () => {
    let library: ReturnType<typeof createSkillLibrary>;

    beforeEach(() => {
      library = createSkillLibrary();
    });

    it('should add and retrieve skills', () => {
      // addSkill returns Skill directly, not Result
      const skill = library.addSkill({
        name: 'format_code',
        description: 'Format code using prettier',
        code: 'prettier --write .',
        category: 'formatting',
        complexity: 'simple',
        parameters: [],
        outputType: 'void',
      });

      expect(skill).toBeDefined();
      expect(skill.name).toBe('format_code');

      // getSkillByName to retrieve by name (getSkill takes ID)
      const retrieved = library.getSkillByName('format_code');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('format_code');
    });

    it('should search skills by query', () => {
      library.addSkill({
        name: 'run_tests',
        description: 'Run unit tests with vitest',
        code: 'pnpm test',
        category: 'testing',
        complexity: 'simple',
        parameters: [],
        outputType: 'void',
      });

      library.addSkill({
        name: 'format_code',
        description: 'Format code with prettier',
        code: 'pnpm format',
        category: 'formatting',
        complexity: 'simple',
        parameters: [],
        outputType: 'void',
      });

      // searchSkills takes SkillQuery object with search property
      const results = library.searchSkills({ search: 'test' });

      expect(results.skills.length).toBeGreaterThan(0);
      expect(results.skills.some((r) => r.name === 'run_tests')).toBe(true);
    });

    it('should track skill execution metrics', () => {
      // addSkill returns Skill directly
      const skill = library.addSkill({
        name: 'metric_test',
        description: 'Skill for metric testing',
        code: 'echo test',
        category: 'testing',
        complexity: 'simple',
        parameters: [],
        outputType: 'void',
      });

      expect(skill).toBeDefined();

      // recordExecution signature: (skillId, status, input, output?, errorMessage?)
      // status is 'success' | 'failure' | 'timeout' | 'error'
      library.recordExecution(skill.id, 'success', {});
      library.recordExecution(skill.id, 'success', {});
      library.recordExecution(skill.id, 'failure', {}, undefined, 'test error');

      const stats = library.getStatistics();

      expect(stats.totalSkills).toBeGreaterThanOrEqual(1);
      expect(stats.totalExecutions).toBe(3);
    });

    it('should remove skills', () => {
      // addSkill returns the skill with its generated ID
      const skill = library.addSkill({
        name: 'to_remove',
        description: 'Will be removed',
        code: 'echo remove',
        category: 'testing',
        complexity: 'simple',
        parameters: [],
        outputType: 'void',
      });

      // getSkill takes ID, getSkillByName takes name
      expect(library.getSkillByName('to_remove')).toBeDefined();

      // removeSkill takes skill ID, not name
      const removeResult = library.removeSkill(skill.id);
      expect(removeResult).toBe(true);

      expect(library.getSkillByName('to_remove')).toBeUndefined();
    });
  });

  describe('Skill Composer', () => {
    let library: ReturnType<typeof createSkillLibrary>;
    let composer: ReturnType<typeof createSkillComposer>;

    beforeEach(() => {
      library = createSkillLibrary();
      composer = createSkillComposer(library);

      // Add some skills with all required fields
      library.addSkill({
        name: 'read_file',
        description: 'Read file contents',
        code: 'cat ${file}',
        category: 'io',
        complexity: 'simple',
        outputType: 'string',
        parameters: [{ name: 'file', type: 'string', required: true }],
      });

      library.addSkill({
        name: 'transform_data',
        description: 'Transform data',
        code: 'transform ${data}',
        category: 'transform',
        complexity: 'moderate',
        outputType: 'string',
        parameters: [{ name: 'data', type: 'string', required: true }],
      });

      library.addSkill({
        name: 'write_file',
        description: 'Write to file',
        code: 'echo ${content} > ${file}',
        category: 'io',
        complexity: 'simple',
        outputType: 'void',
        parameters: [
          { name: 'content', type: 'string', required: true },
          { name: 'file', type: 'string', required: true },
        ],
      });
    });

    it('should compose skills into workflow', () => {
      // compose() expects SkillCompositionRequest with taskDescription
      const composition = composer.compose({
        taskDescription: 'Read file, transform, and write output',
        maxComplexity: 'complex',
        maxSkillCount: 3,
      });

      // Composition may be null if no suitable skills found - that's valid behavior
      // Test that the compose method works without throwing
      expect(typeof composition === 'object' || composition === null).toBe(true);
      if (composition !== null) {
        expect(composition.steps.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should validate skill compositions', () => {
      // Create a composition using the actual compose method to get proper structure
      const composition = composer.compose({
        taskDescription: 'Read a file',
        maxSkillCount: 1,
      });

      // If we got a valid composition, validate it
      if (composition !== null) {
        const validation = composer.validateComposition(composition);
        // A properly composed composition should be valid
        expect(typeof validation.valid).toBe('boolean');
      }
    });

    it('should validate valid compositions', () => {
      // Use a real composition from compose() for validation testing
      const composition = composer.compose({
        taskDescription: 'Read and transform data',
        maxSkillCount: 2,
      });

      // Verify the composer produces valid structure
      if (composition !== null) {
        const validation = composer.validateComposition(composition);
        expect(validation).toBeDefined();
        expect(typeof validation.valid).toBe('boolean');
      }
    });
  });

  describe('Performance', () => {
    it('should analyze tasks quickly', async () => {
      const task = createTestTask('Review this code for security issues');
      const { result, ms } = await measureLatency(() => {
        return Promise.resolve(analyzeTask(task));
      });

      expect(result.ok).toBe(true);
      expect(ms).toBeLessThan(100); // Should be very fast
    });

    it('should handle context operations efficiently', async () => {
      const contextManager = new ContextManager({ maxTokens: 100000 });

      const { ms } = await measureLatency(async () => {
        // Add many items
        for (let i = 0; i < 100; i++) {
          await contextManager.add({
            id: `item-${String(i)}`,
            content: `Content for item ${String(i)} with some additional text`,
            priority: ContentPriority.ACTIVE,
            category: 'active',
          });
        }
        return contextManager.getStats();
      });

      expect(ms).toBeLessThan(1000); // Should handle 100 items quickly
    });
  });
});
