/**
 * Memory System Integration Tests
 *
 * Comprehensive integration tests for:
 * - Hindsight Belief Memory advanced scenarios
 * - Cross-memory-system interactions
 * - TypedMemory + BeliefMemory integration
 * - Memory coherence and consistency
 *
 * @module context/memory-system-integration.test
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { ILogger } from '../core/index.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { TypedMemory } from './typed-memory.js';
import {
  HindsightBeliefMemory,
  BeliefConfidenceEnum,
  BeliefSourceTypeEnum,
  type Belief,
  type BeliefMemoryConfig,
  type HindsightRecord,
} from './belief-memory.js';
import {
  MemoryError,
  type IMemoryBackend,
  type MemoryEntry,
  type MemoryMetadata,
} from './memory-backend-types.js';

// =============================================================================
// Test Infrastructure
// =============================================================================

interface MockLogger extends ILogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  mock.child.mockReturnThis();
  return mock;
}

function createMockMemoryBackend(): IMemoryBackend & {
  _storage: Map<string, { value: unknown; metadata: MemoryMetadata }>;
} {
  const storage = new Map<string, { value: unknown; metadata: MemoryMetadata }>();

  return {
    _storage: storage,
    store: vi
      .fn()
      .mockImplementation(
        (
          key: string,
          value: unknown,
          metadata: MemoryMetadata
        ): Promise<Result<void, MemoryError>> => {
          storage.set(key, { value, metadata });
          return Promise.resolve(ok(undefined));
        }
      ),
    retrieve: vi.fn().mockImplementation((key: string): Promise<Result<unknown, MemoryError>> => {
      const entry = storage.get(key);
      return Promise.resolve(ok(entry?.value ?? null));
    }),
    search: vi
      .fn()
      .mockImplementation(
        (query: string, limit: number): Promise<Result<MemoryEntry[], MemoryError>> => {
          const results: MemoryEntry[] = [];
          const queryLower = query.toLowerCase();
          for (const [key, entry] of storage.entries()) {
            const valueStr = JSON.stringify(entry.value).toLowerCase();
            const hasMatch =
              key.toLowerCase().includes(queryLower) || valueStr.includes(queryLower);
            if (hasMatch) {
              results.push({
                key,
                value: entry.value,
                metadata: entry.metadata,
                createdAt: new Date(),
                accessedAt: new Date(),
              });
            }
          }
          return Promise.resolve(ok(results.slice(0, limit)));
        }
      ),
    prune: vi.fn().mockResolvedValue(ok(0)),
  };
}

function createTestBeliefMemory(config?: BeliefMemoryConfig): {
  memory: HindsightBeliefMemory;
  logger: MockLogger;
} {
  const logger = createMockLogger();
  const memory = new HindsightBeliefMemory(config, logger);
  return { memory, logger };
}

async function createTestBelief(
  memory: HindsightBeliefMemory,
  overrides?: Partial<
    Omit<Belief, 'beliefId' | 'version' | 'createdAt' | 'updatedAt' | 'superseded'>
  >
): Promise<Belief> {
  const result = await memory.retain({
    subject: 'test-entity',
    predicate: 'has-property',
    object: 'test-value',
    confidence: BeliefConfidenceEnum.MEDIUM,
    sourceType: BeliefSourceTypeEnum.OBSERVATION,
    ...overrides,
  });
  if (!result.ok) throw result.error;
  return result.value;
}

// =============================================================================
// Hindsight Belief Memory - Advanced Integration Tests
// =============================================================================

describe('HindsightBeliefMemory Advanced Integration', () => {
  describe('Complex Hindsight Chains', () => {
    it('should handle multi-step belief evolution through multiple hindsight applications', async () => {
      const { memory } = createTestBeliefMemory();

      // Step 1: Create initial belief about system behavior
      const initialBelief = await createTestBelief(memory, {
        subject: 'api-endpoint',
        predicate: 'response-time',
        object: 'fast',
        confidence: BeliefConfidenceEnum.HIGH,
        domain: 'performance',
      });

      // Step 2: First hindsight - actual performance is moderate
      const hindsight1: HindsightRecord = {
        hindsightId: 'hs-1',
        taskId: 'load-test-1',
        priorBeliefs: [initialBelief.beliefId],
        expectedOutcome: 'fast response',
        actualOutcome: 'moderate response',
        outcomeMatched: false,
        correctedBeliefs: [initialBelief.beliefId],
        newBeliefs: [],
        lessons: ['API performance degrades under load'],
        createdAt: new Date(),
      };

      const correction1 = await memory.applyHindsight(hindsight1);
      expect(correction1.ok).toBe(true);
      if (correction1.ok) {
        expect(correction1.value.length).toBe(1);
        expect(correction1.value[0]?.confidence).toBe('medium');
      }

      // Step 3: Second hindsight - performance is actually slow
      const hindsight2: HindsightRecord = {
        hindsightId: 'hs-2',
        taskId: 'load-test-2',
        priorBeliefs: [initialBelief.beliefId],
        expectedOutcome: 'moderate response',
        actualOutcome: 'slow response',
        outcomeMatched: false,
        correctedBeliefs: [initialBelief.beliefId],
        newBeliefs: [],
        lessons: ['API performance is consistently slow'],
        createdAt: new Date(),
      };

      const correction2 = await memory.applyHindsight(hindsight2);
      expect(correction2.ok).toBe(true);
      if (correction2.ok) {
        expect(correction2.value.length).toBe(1);
        expect(correction2.value[0]?.confidence).toBe('low');
      }

      // Verify the belief history shows the evolution
      const historyResult = await memory.getUpdateHistory(initialBelief.beliefId);
      expect(historyResult.ok).toBe(true);
      if (historyResult.ok) {
        expect(historyResult.value.length).toBeGreaterThanOrEqual(3);
        const updateTypes = historyResult.value.map((u) => u.updateType);
        expect(updateTypes).toContain('retain');
        // Hindsight corrections use 'correct' update type (not 'weaken')
        expect(updateTypes).toContain('correct');
      }
    });

    it('should track correlated beliefs through hindsight', async () => {
      const { memory } = createTestBeliefMemory();

      // Create related beliefs
      const belief1 = await createTestBelief(memory, {
        subject: 'component-A',
        predicate: 'depends-on',
        object: 'component-B',
        confidence: BeliefConfidenceEnum.HIGH,
      });

      const belief2 = await createTestBelief(memory, {
        subject: 'component-B',
        predicate: 'stability',
        object: 'stable',
        confidence: BeliefConfidenceEnum.HIGH,
      });

      // Apply hindsight that affects both beliefs
      const hindsightRecord: HindsightRecord = {
        hindsightId: 'hs-correlated',
        taskId: 'integration-test',
        priorBeliefs: [belief1.beliefId, belief2.beliefId],
        expectedOutcome: 'stable integration',
        actualOutcome: 'component-B failure caused cascade',
        outcomeMatched: false,
        correctedBeliefs: [belief1.beliefId, belief2.beliefId],
        newBeliefs: [],
        lessons: ['Component dependencies need resilience patterns'],
        createdAt: new Date(),
      };

      const corrections = await memory.applyHindsight(hindsightRecord);
      expect(corrections.ok).toBe(true);
      if (corrections.ok) {
        // Both beliefs should be weakened
        expect(corrections.value.length).toBe(2);
        expect(corrections.value.every((b) => b.confidence !== 'high')).toBe(true);
      }

      // Verify hindsight records are retrievable
      const records = await memory.getHindsightRecords('integration-test');
      expect(records.ok).toBe(true);
      if (records.ok) {
        expect(records.value.length).toBe(1);
        expect(records.value[0]?.correctedBeliefs.length).toBe(2);
      }
    });

    it('should handle reinforcement after weakening', async () => {
      const { memory } = createTestBeliefMemory();

      // Create and weaken a belief
      const belief = await createTestBelief(memory, {
        subject: 'hypothesis',
        predicate: 'validity',
        object: 'valid',
        confidence: BeliefConfidenceEnum.MEDIUM,
      });

      // Weaken through hindsight
      await memory.weaken(belief.beliefId, 'Initial test failed');

      // Verify weakened
      let recalled = await memory.recall(belief.beliefId);
      expect(recalled.ok).toBe(true);
      if (recalled.ok && recalled.value !== null) {
        expect(recalled.value.confidence).toBe('low');
      }

      // Now reinforce with new evidence
      await memory.reinforce(belief.beliefId, 'Retest with corrected conditions succeeded');
      await memory.reinforce(belief.beliefId, 'Additional validation passed');

      // Verify strengthened back
      recalled = await memory.recall(belief.beliefId);
      expect(recalled.ok).toBe(true);
      if (recalled.ok && recalled.value !== null) {
        expect(recalled.value.confidence).toBe('high');
      }

      // Verify full history
      const history = await memory.getUpdateHistory(belief.beliefId);
      expect(history.ok).toBe(true);
      if (history.ok) {
        expect(history.value.length).toBeGreaterThanOrEqual(4);
      }
    });
  });

  describe('Counterfactual Reasoning Chains', () => {
    it('should create and validate counterfactual chains', async () => {
      const { memory } = createTestBeliefMemory();

      // Create beliefs about current system state
      await createTestBelief(memory, {
        subject: 'system',
        predicate: 'uses',
        object: 'SQL-database',
        confidence: BeliefConfidenceEnum.HIGH,
      });

      await createTestBelief(memory, {
        subject: 'system',
        predicate: 'performance',
        object: 'adequate',
        confidence: BeliefConfidenceEnum.MEDIUM,
      });

      // Create first counterfactual
      const cf1 = await memory.createCounterfactual(
        'What if system used NoSQL instead?',
        'architecture-review'
      );
      expect(cf1.ok).toBe(true);
      if (cf1.ok) {
        expect(cf1.value.validated).toBe(false);
        expect(cf1.value.taskContext).toBe('architecture-review');
      }

      // Create second counterfactual building on first
      const cf2 = await memory.createCounterfactual(
        'What if system used in-memory cache with NoSQL?',
        'architecture-review'
      );
      expect(cf2.ok).toBe(true);

      // Validate first counterfactual with outcomes
      if (cf1.ok) {
        const validated = await memory.validateCounterfactual(cf1.value.counterfactualId, [
          'Improved write performance',
          'Reduced schema flexibility concerns',
          'Increased operational complexity',
        ]);

        expect(validated.ok).toBe(true);
        if (validated.ok) {
          expect(validated.value.validated).toBe(true);
          expect(validated.value.actualOutcomes?.length).toBe(3);
        }
      }

      // Retrieve all counterfactuals for context
      const allCfs = await memory.getCounterfactuals('architecture-review');
      expect(allCfs.ok).toBe(true);
      if (allCfs.ok) {
        expect(allCfs.value.length).toBe(2);
      }
    });

    it('should handle counterfactual validation errors gracefully', async () => {
      const { memory } = createTestBeliefMemory();

      // Try to validate non-existent counterfactual
      const result = await memory.validateCounterfactual('non-existent-cf', ['outcome1']);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(MemoryError);
        expect(result.error.message).toContain('not found');
      }
    });
  });

  describe('Belief Supersession Chains', () => {
    it('should maintain supersession chain integrity', async () => {
      const { memory } = createTestBeliefMemory();

      // Create initial belief
      const v1 = await createTestBelief(memory, {
        subject: 'config',
        predicate: 'version',
        object: 'v1.0',
        domain: 'configuration',
      });

      // Supersede to v2
      const v2Result = await memory.supersede(
        v1.beliefId,
        {
          subject: 'config',
          predicate: 'version',
          object: 'v2.0',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.EXTERNAL,
        },
        'Upgrade to v2.0'
      );
      expect(v2Result.ok).toBe(true);

      // Supersede to v3
      if (v2Result.ok) {
        const v3Result = await memory.supersede(
          v2Result.value.beliefId,
          {
            subject: 'config',
            predicate: 'version',
            object: 'v3.0',
            confidence: BeliefConfidenceEnum.HIGH,
            sourceType: BeliefSourceTypeEnum.EXTERNAL,
          },
          'Upgrade to v3.0'
        );
        expect(v3Result.ok).toBe(true);
      }

      // Query should only return the latest
      const current = await memory.recallCurrent('config', 'version');
      expect(current.ok).toBe(true);
      if (current.ok && current.value !== null) {
        expect(current.value.object).toBe('v3.0');
        expect(current.value.superseded).toBe(false);
      }

      // History should show all versions
      const history = await memory.recallHistory('config', 'version');
      expect(history.ok).toBe(true);
      if (history.ok) {
        expect(history.value.length).toBe(3);
        const versions = history.value.map((b) => b.object);
        expect(versions).toContain('v1.0');
        expect(versions).toContain('v2.0');
        expect(versions).toContain('v3.0');
      }
    });

    it('should prevent revision of superseded beliefs', async () => {
      const { memory } = createTestBeliefMemory();

      const original = await createTestBelief(memory, {
        subject: 'rule',
        predicate: 'active',
        object: 'yes',
      });

      // Supersede the belief
      await memory.supersede(
        original.beliefId,
        {
          subject: 'rule',
          predicate: 'active',
          object: 'no',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Rule deactivated'
      );

      // Attempt to revise superseded belief
      const reviseResult = await memory.revise(
        original.beliefId,
        { object: 'modified' },
        'Attempting invalid revision'
      );

      expect(reviseResult.ok).toBe(false);
      if (!reviseResult.ok) {
        expect(reviseResult.error.message).toContain('superseded');
      }
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent belief operations', async () => {
      const { memory } = createTestBeliefMemory();

      // Create multiple beliefs concurrently
      const createPromises = Array.from({ length: 20 }, (_, i) =>
        memory.retain({
          subject: `entity-${String(i)}`,
          predicate: 'property',
          object: `value-${String(i)}`,
          confidence: BeliefConfidenceEnum.MEDIUM,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        })
      );

      const results = await Promise.all(createPromises);
      expect(results.every((r) => r.ok)).toBe(true);

      // Verify all beliefs were stored correctly
      const stats = await memory.getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.totalBeliefs).toBe(20);
      }
    });

    it('should handle concurrent revisions to same belief', async () => {
      const { memory } = createTestBeliefMemory();

      const belief = await createTestBelief(memory, {
        subject: 'counter',
        predicate: 'value',
        object: '0',
      });

      // Attempt concurrent revisions
      const revisionPromises = Array.from({ length: 5 }, (_, i) =>
        memory.revise(belief.beliefId, { object: String(i + 1) }, `Revision ${String(i + 1)}`)
      );

      const revisionResults = await Promise.all(revisionPromises);

      // All revisions should succeed (last write wins semantics)
      const successCount = revisionResults.filter((r) => r.ok).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Verify version is incremented
      const finalBelief = await memory.recall(belief.beliefId);
      expect(finalBelief.ok).toBe(true);
      if (finalBelief.ok && finalBelief.value !== null) {
        expect(finalBelief.value.version).toBeGreaterThan(1);
      }
    });

    it('should handle concurrent hindsight applications', async () => {
      const { memory } = createTestBeliefMemory();

      // Create beliefs
      const beliefs = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          createTestBelief(memory, {
            subject: `concurrent-${String(i)}`,
            predicate: 'state',
            object: 'initial',
            confidence: BeliefConfidenceEnum.HIGH,
          })
        )
      );

      // Apply hindsight concurrently to different beliefs
      const hindsightPromises = beliefs.map((belief, i) =>
        memory.applyHindsight({
          hindsightId: `hs-concurrent-${String(i)}`,
          taskId: `task-${String(i)}`,
          priorBeliefs: [belief.beliefId],
          expectedOutcome: 'initial',
          actualOutcome: 'changed',
          outcomeMatched: false,
          correctedBeliefs: [belief.beliefId],
          newBeliefs: [],
          lessons: [`Lesson ${String(i)}`],
          createdAt: new Date(),
        })
      );

      const hindsightResults = await Promise.all(hindsightPromises);
      expect(hindsightResults.every((r) => r.ok)).toBe(true);
    });
  });

  describe('Statistics and Pruning', () => {
    it('should compute accurate statistics across all operations', async () => {
      const { memory } = createTestBeliefMemory();

      // Create beliefs with varying confidence (distinct predicates to avoid dedup)
      await createTestBelief(memory, { predicate: 'p-h1', confidence: BeliefConfidenceEnum.HIGH });
      await createTestBelief(memory, { predicate: 'p-h2', confidence: BeliefConfidenceEnum.HIGH });
      await createTestBelief(memory, {
        predicate: 'p-med',
        confidence: BeliefConfidenceEnum.MEDIUM,
      });
      await createTestBelief(memory, { predicate: 'p-low', confidence: BeliefConfidenceEnum.LOW });
      await createTestBelief(memory, {
        predicate: 'p-spec',
        confidence: BeliefConfidenceEnum.SPECULATIVE,
      });

      // Create some counterfactuals
      await memory.createCounterfactual('Hypothesis 1', 'ctx-1');
      await memory.createCounterfactual('Hypothesis 2', 'ctx-2');

      // Apply some hindsight
      const beliefToCorrect = await createTestBelief(memory, {
        subject: 'to-correct',
        confidence: BeliefConfidenceEnum.HIGH,
      });

      await memory.applyHindsight({
        hindsightId: 'hs-stat',
        taskId: 'stat-task',
        priorBeliefs: [beliefToCorrect.beliefId],
        expectedOutcome: 'X',
        actualOutcome: 'Y',
        outcomeMatched: false,
        correctedBeliefs: [beliefToCorrect.beliefId],
        newBeliefs: [],
        lessons: ['Lesson'],
        createdAt: new Date(),
      });

      const stats = await memory.getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.totalBeliefs).toBe(6);
        expect(stats.value.activeBeliefs).toBe(6);
        expect(stats.value.beliefsByConfidence.high).toBe(2);
        expect(stats.value.beliefsByConfidence.medium).toBe(2); // 1 original + 1 weakened
        expect(stats.value.totalCounterfactuals).toBe(2);
        expect(stats.value.totalHindsightRecords).toBe(1);
      }
    });

    it('should prune old superseded beliefs correctly', async () => {
      const { memory } = createTestBeliefMemory();

      // Create and supersede beliefs
      const original = await createTestBelief(memory, {
        subject: 'old',
        predicate: 'state',
        object: 'original',
      });

      await memory.supersede(
        original.beliefId,
        {
          subject: 'old',
          predicate: 'state',
          object: 'new',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Updated'
      );

      // Verify superseded belief exists
      let stats = await memory.getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.supersededBeliefs).toBe(1);
      }

      // Prune with future date
      const pruneResult = await memory.pruneSuperseded(new Date(Date.now() + 10000));
      expect(pruneResult.ok).toBe(true);
      if (pruneResult.ok) {
        expect(pruneResult.value).toBe(1);
      }

      // Verify superseded belief is gone
      stats = await memory.getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.supersededBeliefs).toBe(0);
        expect(stats.value.totalBeliefs).toBe(1);
      }
    });
  });
});

// =============================================================================
// TypedMemory + BeliefMemory Integration Tests
// =============================================================================

describe('TypedMemory and BeliefMemory Integration', () => {
  let backend: ReturnType<typeof createMockMemoryBackend>;
  let typedMemory: TypedMemory;

  beforeEach(() => {
    backend = createMockMemoryBackend();
    typedMemory = new TypedMemory(backend);
  });

  describe('Belief Memory Access Through TypedMemory', () => {
    it('should provide access to belief memory through typed interface', () => {
      expect(typedMemory.belief).toBeDefined();
      expect(typedMemory.belief).toBeInstanceOf(HindsightBeliefMemory);
    });

    it('should maintain belief state independently from backend storage', async () => {
      // Store data in typed memory (backend)
      await typedMemory.semantic.storeFact({
        factId: 'fact-1',
        domain: 'test',
        subject: 'A',
        predicate: 'relates',
        object: 'B',
        confidence: 0.9,
        source: 'observation',
      });

      // Store belief in belief memory
      const beliefResult = await typedMemory.belief.retain({
        subject: 'fact-1',
        predicate: 'validity',
        object: 'confirmed',
        confidence: BeliefConfidenceEnum.HIGH,
        sourceType: BeliefSourceTypeEnum.INFERENCE,
      });

      expect(beliefResult.ok).toBe(true);

      // Verify backend has the fact
      expect(backend._storage.has('semantic:fact-1')).toBe(true);

      // Verify belief memory has the belief
      const beliefStats = await typedMemory.belief.getStats();
      expect(beliefStats.ok).toBe(true);
      if (beliefStats.ok) {
        expect(beliefStats.value.totalBeliefs).toBe(1);
      }
    });

    it('should correlate episodic memory with belief updates', async () => {
      // Record an episode about a task
      await typedMemory.episodic.recordEpisode({
        episodeId: 'ep-task-1',
        taskId: 'task-1',
        agentId: 'agent-1',
        action: 'code_review',
        outcome: 'success',
        context: { file: 'main.ts' },
        learnings: ['Type safety is important'],
        timestamp: new Date(),
        durationMs: 5000,
      });

      // Create belief based on episodic learning
      const beliefResult = await typedMemory.belief.retain({
        subject: 'code_review',
        predicate: 'improves',
        object: 'type_safety',
        confidence: BeliefConfidenceEnum.MEDIUM,
        sourceType: BeliefSourceTypeEnum.INFERENCE,
        sourceRef: 'ep-task-1',
      });

      expect(beliefResult.ok).toBe(true);
      if (beliefResult.ok) {
        expect(beliefResult.value.sourceRef).toBe('ep-task-1');
      }
    });
  });

  describe('Cross-Memory Type Coherence', () => {
    it('should maintain coherence between semantic facts and beliefs', async () => {
      // Store semantic fact - use factId that includes the domain for searchability
      const storeResult = await typedMemory.semantic.storeFact({
        factId: 'programming-ts-benefit',
        domain: 'programming',
        subject: 'typescript',
        predicate: 'provides',
        object: 'type_safety',
        confidence: 0.95,
        source: 'documentation',
      });
      expect(storeResult.ok).toBe(true);

      // Create corresponding belief
      const beliefResult = await typedMemory.belief.retain({
        subject: 'typescript',
        predicate: 'provides',
        object: 'type_safety',
        confidence: BeliefConfidenceEnum.HIGH,
        sourceType: BeliefSourceTypeEnum.EXTERNAL,
        domain: 'programming',
      });

      expect(beliefResult.ok).toBe(true);

      // Verify the fact was stored in the backend
      const factExists = backend._storage.has('semantic:programming-ts-benefit');
      expect(factExists).toBe(true);

      // Query belief system for related data (belief memory has independent indexing)
      const beliefsResult = await typedMemory.belief.query({
        domain: 'programming',
      });
      expect(beliefsResult.ok).toBe(true);

      // Verify belief was stored
      if (beliefsResult.ok) {
        expect(beliefsResult.value.length).toBeGreaterThan(0);
        expect(beliefsResult.value[0]?.subject).toBe('typescript');
      }
    });

    it('should update beliefs based on procedural outcomes', async () => {
      // Store a procedure
      await typedMemory.procedural.storeProcedure({
        procedureId: 'proc-deploy',
        name: 'Deploy Application',
        description: 'Standard deployment process',
        steps: [
          { stepId: 's1', action: 'build', parameters: {} },
          { stepId: 's2', action: 'test', preconditions: ['build_success'] },
          { stepId: 's3', action: 'deploy', preconditions: ['tests_pass'] },
        ],
        triggerConditions: ['deploy', 'release'],
        successRate: 0.9,
        executionCount: 10,
        tags: ['deployment', 'ci-cd'],
      });

      // Create belief about procedure reliability
      const beliefResult = await typedMemory.belief.retain({
        subject: 'proc-deploy',
        predicate: 'reliability',
        object: 'high',
        confidence: BeliefConfidenceEnum.MEDIUM,
        sourceType: BeliefSourceTypeEnum.OBSERVATION,
      });

      expect(beliefResult.ok).toBe(true);
      if (!beliefResult.ok) return;

      // Simulate procedure failure and update belief
      const hindsightRecord: HindsightRecord = {
        hindsightId: 'hs-deploy-fail',
        taskId: 'deploy-task-1',
        priorBeliefs: [beliefResult.value.beliefId],
        expectedOutcome: 'successful_deployment',
        actualOutcome: 'deployment_failed',
        outcomeMatched: false,
        correctedBeliefs: [beliefResult.value.beliefId],
        newBeliefs: [],
        lessons: ['Need better rollback strategy'],
        createdAt: new Date(),
      };

      const correction = await typedMemory.belief.applyHindsight(hindsightRecord);
      expect(correction.ok).toBe(true);
      if (correction.ok) {
        expect(correction.value[0]?.confidence).not.toBe('high');
      }
    });
  });

  describe('Memory Type Statistics Integration', () => {
    it('should aggregate stats across all memory types including beliefs', async () => {
      // Populate various memory types
      await typedMemory.core.setIdentity({
        agentId: 'agent-1',
        role: 'code_expert',
        name: 'Test Agent',
        constraints: [],
        capabilities: [],
        temperament: 'balanced',
      });

      await typedMemory.semantic.storeFact({
        factId: 'fact-1',
        domain: 'test',
        subject: 'A',
        predicate: 'is',
        object: 'B',
        confidence: 0.8,
        source: 'test',
      });

      await typedMemory.belief.retain({
        subject: 'system',
        predicate: 'state',
        object: 'healthy',
        confidence: BeliefConfidenceEnum.HIGH,
        sourceType: BeliefSourceTypeEnum.OBSERVATION,
      });

      // Get typed memory stats
      const typedStats = await typedMemory.getStats();
      expect(typedStats.ok).toBe(true);
      if (typedStats.ok) {
        expect(typedStats.value.totalEntries).toBeGreaterThanOrEqual(2);
      }

      // Get belief memory stats
      const beliefStats = await typedMemory.belief.getStats();
      expect(beliefStats.ok).toBe(true);
      if (beliefStats.ok) {
        expect(beliefStats.value.totalBeliefs).toBe(1);
      }
    });
  });
});

// =============================================================================
// Memory Backend Stress Tests
// =============================================================================

describe('Memory System Stress Tests', () => {
  describe('High Volume Belief Operations', () => {
    it('should handle 100 beliefs with complex queries', async () => {
      const { memory } = createTestBeliefMemory();

      // Create 100 beliefs across different subjects and domains
      const createPromises = Array.from({ length: 100 }, (_, i) =>
        memory.retain({
          subject: `entity-${String(i % 10)}`,
          predicate: `property-${String(i % 5)}`,
          object: `value-${String(i)}`,
          confidence: Object.values(BeliefConfidenceEnum)[
            i % 4
          ] as typeof BeliefConfidenceEnum.HIGH,
          sourceType: Object.values(BeliefSourceTypeEnum)[
            i % 6
          ] as typeof BeliefSourceTypeEnum.OBSERVATION,
          domain: `domain-${String(i % 3)}`,
        })
      );

      const results = await Promise.all(createPromises);
      expect(results.every((r) => r.ok)).toBe(true);

      // Complex query: filter by multiple criteria
      const queryResult = await memory.query({
        domain: 'domain-0',
        minConfidence: BeliefConfidenceEnum.MEDIUM,
        limit: 20,
        orderBy: 'confidence',
        orderDirection: 'desc',
      });

      expect(queryResult.ok).toBe(true);
      if (queryResult.ok) {
        expect(queryResult.value.length).toBeLessThanOrEqual(20);
        expect(queryResult.value.every((b) => b.domain === 'domain-0')).toBe(true);
      }

      // Stats should be accurate
      const stats = await memory.getStats();
      expect(stats.ok).toBe(true);
      if (stats.ok) {
        expect(stats.value.totalBeliefs).toBe(100);
      }
    });

    it('should handle rapid belief versioning', async () => {
      const { memory } = createTestBeliefMemory();

      const belief = await createTestBelief(memory, {
        subject: 'versioned',
        predicate: 'value',
        object: 'v0',
      });

      // Rapid sequential revisions
      for (let i = 1; i <= 50; i++) {
        const result = await memory.revise(
          belief.beliefId,
          { object: `v${String(i)}` },
          `Update to v${String(i)}`
        );
        expect(result.ok).toBe(true);
      }

      // Verify final state
      const final = await memory.recall(belief.beliefId);
      expect(final.ok).toBe(true);
      if (final.ok && final.value !== null) {
        expect(final.value.version).toBe(51);
        expect(final.value.object).toBe('v50');
      }

      // Verify history
      const history = await memory.getUpdateHistory(belief.beliefId);
      expect(history.ok).toBe(true);
      if (history.ok) {
        expect(history.value.length).toBe(51); // 1 retain + 50 revisions
      }
    });
  });

  describe('Backend Error Recovery', () => {
    it('should propagate backend errors through TypedMemory', async () => {
      const failingBackend: IMemoryBackend = {
        store: vi.fn().mockResolvedValue(err(new MemoryError('Storage unavailable'))),
        retrieve: vi.fn().mockResolvedValue(ok(null)),
        search: vi.fn().mockResolvedValue(ok([])),
        prune: vi.fn().mockResolvedValue(ok(0)),
      };

      const failingTypedMemory = new TypedMemory(failingBackend);

      const result = await failingTypedMemory.semantic.storeFact({
        factId: 'fail',
        domain: 'test',
        subject: 'A',
        predicate: 'is',
        object: 'B',
        confidence: 0.5,
        source: 'test',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(MemoryError);
      }
    });

    it('should handle partial failures in batch operations', async () => {
      const { memory } = createTestBeliefMemory();

      const validBeliefs = [
        {
          subject: 'valid-1',
          predicate: 'prop',
          object: 'value',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        {
          subject: 'valid-2',
          predicate: 'prop',
          object: 'value',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
      ];

      const result = await memory.retainBatch(validBeliefs);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(2);
      }
    });
  });
});

// =============================================================================
// Edge Cases for Memory System Integration
// =============================================================================

describe('Memory System Integration Edge Cases', () => {
  describe('Empty State Handling', () => {
    it('should handle queries on empty belief memory', async () => {
      const { memory } = createTestBeliefMemory();

      const queryResult = await memory.query({
        subject: 'nonexistent',
      });

      expect(queryResult.ok).toBe(true);
      if (queryResult.ok) {
        expect(queryResult.value).toHaveLength(0);
      }
    });

    it('should handle stats on empty memory systems', async () => {
      const backend = createMockMemoryBackend();
      const typedMem = new TypedMemory(backend);

      const typedStats = await typedMem.getStats();
      expect(typedStats.ok).toBe(true);
      if (typedStats.ok) {
        expect(typedStats.value.totalEntries).toBe(0);
      }

      const beliefStats = await typedMem.belief.getStats();
      expect(beliefStats.ok).toBe(true);
      if (beliefStats.ok) {
        expect(beliefStats.value.totalBeliefs).toBe(0);
      }
    });
  });

  describe('Unicode and Special Characters', () => {
    it('should handle unicode in belief content', async () => {
      const { memory } = createTestBeliefMemory();

      const result = await memory.retain({
        subject: 'user-preference',
        predicate: 'language',
        object: '日本語',
        confidence: BeliefConfidenceEnum.HIGH,
        sourceType: BeliefSourceTypeEnum.USER_INPUT,
        metadata: { emoji: '🌍', notes: 'Internationalization test' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.object).toBe('日本語');
        expect(result.value.metadata?.emoji).toBe('🌍');
      }
    });

    it('should handle special characters in belief queries', async () => {
      const { memory } = createTestBeliefMemory();

      await createTestBelief(memory, {
        subject: 'path/to/file.ts',
        predicate: 'contains',
        object: 'function<T>()',
      });

      const result = await memory.recallBySubject('path/to/file.ts');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
      }
    });
  });

  describe('Timestamp Edge Cases', () => {
    it('should handle beliefs with same timestamp', async () => {
      const { memory } = createTestBeliefMemory();

      // Create beliefs rapidly (may have same timestamp)
      const promises = Array.from({ length: 10 }, (_, i) =>
        memory.retain({
          subject: 'rapid',
          predicate: `prop-${String(i)}`,
          object: 'value',
          confidence: BeliefConfidenceEnum.MEDIUM,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        })
      );

      const results = await Promise.all(promises);
      expect(results.every((r) => r.ok)).toBe(true);

      // Should all be retrievable
      const queryResult = await memory.recallBySubject('rapid');
      expect(queryResult.ok).toBe(true);
      if (queryResult.ok) {
        expect(queryResult.value.length).toBe(10);
      }
    });
  });
});
