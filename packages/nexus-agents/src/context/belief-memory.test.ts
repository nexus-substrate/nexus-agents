/**
 * nexus-agents/context - Hindsight Belief Memory Tests
 *
 * Comprehensive tests for the Hindsight Belief Memory implementation.
 * (Source: Issue #336, arXiv:2512.12818)
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import type { ILogger } from '../core/index.js';
import { MemoryError } from './memory-backend-types.js';
import {
  HindsightBeliefMemory,
  BeliefConfidenceEnum,
  BeliefSourceTypeEnum,
  type Belief,
  type BeliefMemoryConfig,
  type HindsightRecord,
} from './belief-memory.js';

// ============================================================================
// Test Helpers
// ============================================================================

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

function createTestMemory(config?: BeliefMemoryConfig): {
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

// ============================================================================
// Tests
// ============================================================================

describe('HindsightBeliefMemory', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const { memory } = createTestMemory();
      expect(memory).toBeInstanceOf(HindsightBeliefMemory);
    });

    it('should create with custom config', () => {
      const { memory } = createTestMemory({
        maxBeliefsPerSubject: 50,
        defaultConfidence: BeliefConfidenceEnum.HIGH,
      });
      expect(memory).toBeInstanceOf(HindsightBeliefMemory);
    });

    it('should throw on invalid config', () => {
      expect(() => {
        new HindsightBeliefMemory({ maxBeliefsPerSubject: -1 });
      }).toThrow(MemoryError);
    });

    it('should log initialization', () => {
      const { logger } = createTestMemory();
      expect(logger.info).toHaveBeenCalledWith(
        'HindsightBeliefMemory initialized',
        expect.any(Object)
      );
    });
  });

  describe('retain', () => {
    it('should retain a new belief', async () => {
      const { memory } = createTestMemory();

      const result = await memory.retain({
        subject: 'user-123',
        predicate: 'prefers',
        object: 'dark-theme',
        confidence: BeliefConfidenceEnum.HIGH,
        sourceType: BeliefSourceTypeEnum.USER_INPUT,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.beliefId).toMatch(/^belief_/);
        expect(result.value.subject).toBe('user-123');
        expect(result.value.predicate).toBe('prefers');
        expect(result.value.object).toBe('dark-theme');
        expect(result.value.confidence).toBe('high');
        expect(result.value.version).toBe(1);
        expect(result.value.superseded).toBe(false);
      }
    });

    it('should retain belief with optional fields', async () => {
      const { memory } = createTestMemory();

      const result = await memory.retain({
        subject: 'system',
        predicate: 'runs-on',
        object: 'linux',
        confidence: BeliefConfidenceEnum.MEDIUM,
        sourceType: BeliefSourceTypeEnum.OBSERVATION,
        domain: 'infrastructure',
        sourceRef: 'scan-123',
        metadata: { scannedAt: new Date().toISOString() },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe('infrastructure');
        expect(result.value.sourceRef).toBe('scan-123');
        expect(result.value.metadata).toHaveProperty('scannedAt');
      }
    });

    it('should reject invalid belief data', async () => {
      const { memory } = createTestMemory();

      const result = await memory.retain({
        subject: '', // Invalid: empty subject
        predicate: 'has',
        object: 'value',
        confidence: BeliefConfidenceEnum.LOW,
        sourceType: BeliefSourceTypeEnum.EXTERNAL,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(MemoryError);
        expect(result.error.message).toContain('Invalid belief data');
      }
    });

    it('should retain batch of beliefs', async () => {
      const { memory } = createTestMemory();

      const result = await memory.retainBatch([
        {
          subject: 'entity-1',
          predicate: 'type',
          object: 'A',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.EXTERNAL,
        },
        {
          subject: 'entity-2',
          predicate: 'type',
          object: 'B',
          confidence: BeliefConfidenceEnum.MEDIUM,
          sourceType: BeliefSourceTypeEnum.EXTERNAL,
        },
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.subject).toBe('entity-1');
        expect(result.value[1]?.subject).toBe('entity-2');
      }
    });
  });

  describe('recall', () => {
    it('should recall belief by ID', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory);

      const result = await memory.recall(belief.beliefId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value?.beliefId).toBe(belief.beliefId);
      }
    });

    it('should return null for non-existent ID', async () => {
      const { memory } = createTestMemory();

      const result = await memory.recall('non-existent-id');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('query', () => {
    it('should query by subject', async () => {
      const { memory } = createTestMemory();
      await createTestBelief(memory, { subject: 'user-A', predicate: 'likes' });
      await createTestBelief(memory, { subject: 'user-A', predicate: 'dislikes' });
      await createTestBelief(memory, { subject: 'user-B', predicate: 'likes' });

      const result = await memory.query({ subject: 'user-A' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value.every((b) => b.subject === 'user-A')).toBe(true);
      }
    });

    it('should query by predicate', async () => {
      const { memory } = createTestMemory();
      await createTestBelief(memory, { subject: 'X', predicate: 'contains' });
      await createTestBelief(memory, { subject: 'Y', predicate: 'contains' });
      await createTestBelief(memory, { subject: 'Z', predicate: 'excludes' });

      const result = await memory.query({ predicate: 'contains' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value.every((b) => b.predicate === 'contains')).toBe(true);
      }
    });

    it('should query by domain', async () => {
      const { memory } = createTestMemory();
      await createTestBelief(memory, { subject: 'A', domain: 'security' });
      await createTestBelief(memory, { subject: 'B', domain: 'security' });
      await createTestBelief(memory, { subject: 'C', domain: 'performance' });

      const result = await memory.query({ domain: 'security' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value.every((b) => b.domain === 'security')).toBe(true);
      }
    });

    it('should filter by minimum confidence', async () => {
      const { memory } = createTestMemory();
      await createTestBelief(memory, { confidence: BeliefConfidenceEnum.HIGH });
      await createTestBelief(memory, { confidence: BeliefConfidenceEnum.MEDIUM });
      await createTestBelief(memory, { confidence: BeliefConfidenceEnum.LOW });
      await createTestBelief(memory, { confidence: BeliefConfidenceEnum.SPECULATIVE });

      const result = await memory.query({ minConfidence: BeliefConfidenceEnum.MEDIUM });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        const confidences = result.value.map((b) => b.confidence);
        expect(confidences).toContain('high');
        expect(confidences).toContain('medium');
      }
    });

    it('should exclude superseded by default', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, { subject: 'old-subject' });
      await memory.supersede(
        belief.beliefId,
        {
          subject: 'old-subject',
          predicate: belief.predicate,
          object: 'new-value',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Updated information'
      );

      const result = await memory.query({ subject: 'old-subject' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.superseded).toBe(false);
      }
    });

    it('should include superseded when requested', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, { subject: 'versioned-subject' });
      await memory.supersede(
        belief.beliefId,
        {
          subject: 'versioned-subject',
          predicate: belief.predicate,
          object: 'newer-value',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Version 2'
      );

      const result = await memory.query({
        subject: 'versioned-subject',
        includeSuperseded: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('should respect limit', async () => {
      const { memory } = createTestMemory();
      for (let i = 0; i < 10; i++) {
        await createTestBelief(memory, { subject: 'limited-subject' });
      }

      const result = await memory.query({ subject: 'limited-subject', limit: 3 });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
      }
    });

    it('should order by confidence', async () => {
      const { memory } = createTestMemory();
      await createTestBelief(memory, {
        subject: 'ordered',
        confidence: BeliefConfidenceEnum.LOW,
      });
      await createTestBelief(memory, {
        subject: 'ordered',
        confidence: BeliefConfidenceEnum.HIGH,
      });
      await createTestBelief(memory, {
        subject: 'ordered',
        confidence: BeliefConfidenceEnum.MEDIUM,
      });

      const result = await memory.query({
        subject: 'ordered',
        orderBy: 'confidence',
        orderDirection: 'desc',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.confidence).toBe('high');
        expect(result.value[1]?.confidence).toBe('medium');
        expect(result.value[2]?.confidence).toBe('low');
      }
    });
  });

  describe('recallBySubject', () => {
    it('should return all beliefs for a subject', async () => {
      const { memory } = createTestMemory();
      await createTestBelief(memory, { subject: 'target', predicate: 'has' });
      await createTestBelief(memory, { subject: 'target', predicate: 'needs' });
      await createTestBelief(memory, { subject: 'other', predicate: 'has' });

      const result = await memory.recallBySubject('target');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });
  });

  describe('recallCurrent', () => {
    it('should return the current belief for subject-predicate', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, {
        subject: 'config',
        predicate: 'theme',
        object: 'light',
      });
      await memory.revise(belief.beliefId, { object: 'dark' }, 'User changed preference');

      const result = await memory.recallCurrent('config', 'theme');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).not.toBeNull();
        expect(result.value?.object).toBe('dark');
      }
    });
  });

  describe('recallHistory', () => {
    it('should return belief history', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, {
        subject: 'versioned',
        predicate: 'state',
        object: 'v1',
      });
      await memory.supersede(
        belief.beliefId,
        {
          subject: 'versioned',
          predicate: 'state',
          object: 'v2',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Upgrade'
      );

      const result = await memory.recallHistory('versioned', 'state');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('revise', () => {
    it('should update belief object', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, { object: 'original' });

      const result = await memory.revise(belief.beliefId, { object: 'updated' }, 'New info');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.object).toBe('updated');
        expect(result.value.version).toBe(2);
      }
    });

    it('should update belief confidence', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, { confidence: BeliefConfidenceEnum.LOW });

      const result = await memory.revise(
        belief.beliefId,
        { confidence: BeliefConfidenceEnum.HIGH },
        'Confirmed'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidence).toBe('high');
      }
    });

    it('should fail for non-existent belief', async () => {
      const { memory } = createTestMemory();

      const result = await memory.revise('fake-id', { object: 'x' }, 'test');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should fail for superseded belief', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory);
      await memory.supersede(
        belief.beliefId,
        {
          subject: belief.subject,
          predicate: belief.predicate,
          object: 'new',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Replaced'
      );

      const result = await memory.revise(belief.beliefId, { object: 'fail' }, 'Should fail');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('superseded');
      }
    });
  });

  describe('supersede', () => {
    it('should supersede existing belief with new one', async () => {
      const { memory } = createTestMemory();
      const original = await createTestBelief(memory, { object: 'old-value' });

      const result = await memory.supersede(
        original.beliefId,
        {
          subject: original.subject,
          predicate: original.predicate,
          object: 'new-value',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Updated knowledge'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.object).toBe('new-value');
        expect(result.value.version).toBe(1); // New belief starts at version 1
      }

      // Check original is marked superseded
      const originalNow = await memory.recall(original.beliefId);
      expect(originalNow.ok).toBe(true);
      if (originalNow.ok && originalNow.value !== null) {
        expect(originalNow.value.superseded).toBe(true);
        expect(originalNow.value.supersededBy).toBe(result.ok ? result.value.beliefId : undefined);
      }
    });
  });

  describe('reinforce', () => {
    it('should strengthen belief confidence', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, { confidence: BeliefConfidenceEnum.MEDIUM });

      const result = await memory.reinforce(belief.beliefId, 'Corroborating data found');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidence).toBe('high');
        expect(result.value.version).toBe(2);
      }
    });

    it('should not exceed high confidence', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, { confidence: BeliefConfidenceEnum.HIGH });

      const result = await memory.reinforce(belief.beliefId, 'More evidence');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidence).toBe('high');
      }
    });
  });

  describe('weaken', () => {
    it('should reduce belief confidence', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, { confidence: BeliefConfidenceEnum.MEDIUM });

      const result = await memory.weaken(belief.beliefId, 'Contradicting evidence');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidence).toBe('low');
        expect(result.value.version).toBe(2);
      }
    });

    it('should not go below speculative', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, {
        confidence: BeliefConfidenceEnum.SPECULATIVE,
      });

      const result = await memory.weaken(belief.beliefId, 'More doubt');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidence).toBe('speculative');
      }
    });
  });

  describe('applyHindsight', () => {
    it('should correct beliefs based on outcome mismatch', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory, {
        subject: 'prediction',
        predicate: 'outcome',
        object: 'success',
        confidence: BeliefConfidenceEnum.HIGH,
      });

      const hindsightRecord: HindsightRecord = {
        hindsightId: 'hs-1',
        taskId: 'task-1',
        priorBeliefs: [belief.beliefId],
        expectedOutcome: 'success',
        actualOutcome: 'failure',
        outcomeMatched: false,
        correctedBeliefs: [belief.beliefId],
        newBeliefs: [],
        lessons: ['Overconfident prediction'],
        createdAt: new Date(),
      };

      const result = await memory.applyHindsight(hindsightRecord);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.confidence).toBe('medium'); // Weakened from high
      }
    });
  });

  describe('counterfactual reasoning', () => {
    it('should create counterfactual scenario', async () => {
      const { memory } = createTestMemory();
      await createTestBelief(memory, {
        subject: 'system',
        predicate: 'uses',
        object: 'database-A',
      });

      const result = await memory.createCounterfactual(
        'What if system used database-B?',
        'migration-analysis'
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.counterfactualId).toMatch(/^cf_/);
        expect(result.value.hypothesis).toContain('database-B');
        expect(result.value.validated).toBe(false);
        expect(result.value.affectedBeliefs.length).toBeGreaterThan(0);
      }
    });

    it('should validate counterfactual with outcomes', async () => {
      const { memory } = createTestMemory();
      const cfResult = await memory.createCounterfactual('Test hypothesis', 'test-context');
      if (!cfResult.ok) throw cfResult.error;

      const result = await memory.validateCounterfactual(cfResult.value.counterfactualId, [
        'Outcome 1',
        'Outcome 2',
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.validated).toBe(true);
        expect(result.value.actualOutcomes).toHaveLength(2);
      }
    });

    it('should retrieve counterfactuals by task context', async () => {
      const { memory } = createTestMemory();
      await memory.createCounterfactual('Hypothesis A', 'context-X');
      await memory.createCounterfactual('Hypothesis B', 'context-X');
      await memory.createCounterfactual('Hypothesis C', 'context-Y');

      const result = await memory.getCounterfactuals('context-X');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
      }
    });
  });

  describe('audit and history', () => {
    it('should track update history', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory);
      await memory.revise(belief.beliefId, { object: 'v2' }, 'First revision');
      await memory.reinforce(belief.beliefId, 'Evidence');

      const result = await memory.getUpdateHistory(belief.beliefId);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(3); // retain + revise + reinforce
        expect(result.value[0]?.updateType).toBe('retain');
        expect(result.value[1]?.updateType).toBe('revise');
        expect(result.value[2]?.updateType).toBe('reinforce');
      }
    });

    it('should retrieve hindsight records by task', async () => {
      const { memory } = createTestMemory();
      const belief = await createTestBelief(memory);

      await memory.applyHindsight({
        hindsightId: 'hs-a',
        taskId: 'task-A',
        priorBeliefs: [belief.beliefId],
        expectedOutcome: 'X',
        actualOutcome: 'Y',
        outcomeMatched: false,
        correctedBeliefs: [belief.beliefId],
        newBeliefs: [],
        lessons: ['Lesson 1'],
        createdAt: new Date(),
      });

      const result = await memory.getHindsightRecords('task-A');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]?.hindsightId).toBe('hs-a');
      }
    });
  });

  describe('statistics', () => {
    it('should compute accurate stats', async () => {
      const { memory } = createTestMemory();

      await createTestBelief(memory, { confidence: BeliefConfidenceEnum.HIGH });
      await createTestBelief(memory, { confidence: BeliefConfidenceEnum.MEDIUM });
      const toSupersede = await createTestBelief(memory, {
        confidence: BeliefConfidenceEnum.LOW,
      });
      await memory.supersede(
        toSupersede.beliefId,
        {
          subject: toSupersede.subject,
          predicate: toSupersede.predicate,
          object: 'new',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Updated'
      );

      const result = await memory.getStats();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.totalBeliefs).toBe(4);
        expect(result.value.activeBeliefs).toBe(3);
        expect(result.value.supersededBeliefs).toBe(1);
        expect(result.value.beliefsByConfidence.high).toBe(2);
        expect(result.value.beliefsByConfidence.medium).toBe(1);
        expect(result.value.beliefsByConfidence.low).toBe(1);
      }
    });
  });

  describe('pruning', () => {
    it('should prune old superseded beliefs', async () => {
      const { memory } = createTestMemory();

      const belief = await createTestBelief(memory);
      await memory.supersede(
        belief.beliefId,
        {
          subject: belief.subject,
          predicate: belief.predicate,
          object: 'replacement',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Replaced'
      );

      // Prune with future date should remove the superseded belief
      const result = await memory.pruneSuperseded(new Date(Date.now() + 10000));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(1);
      }

      // Verify it's gone
      const stats = await memory.getStats();
      if (stats.ok) {
        expect(stats.value.supersededBeliefs).toBe(0);
      }
    });

    it('should not prune recent superseded beliefs', async () => {
      const { memory } = createTestMemory();

      const belief = await createTestBelief(memory);
      await memory.supersede(
        belief.beliefId,
        {
          subject: belief.subject,
          predicate: belief.predicate,
          object: 'replacement',
          confidence: BeliefConfidenceEnum.HIGH,
          sourceType: BeliefSourceTypeEnum.OBSERVATION,
        },
        'Replaced'
      );

      // Prune with past date should not remove anything
      const result = await memory.pruneSuperseded(new Date(Date.now() - 10000));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }
    });
  });
});

describe('BeliefConfidenceEnum', () => {
  it('should have correct values', () => {
    expect(BeliefConfidenceEnum.HIGH).toBe('high');
    expect(BeliefConfidenceEnum.MEDIUM).toBe('medium');
    expect(BeliefConfidenceEnum.LOW).toBe('low');
    expect(BeliefConfidenceEnum.SPECULATIVE).toBe('speculative');
  });
});

describe('BeliefSourceTypeEnum', () => {
  it('should have correct values', () => {
    expect(BeliefSourceTypeEnum.OBSERVATION).toBe('observation');
    expect(BeliefSourceTypeEnum.INFERENCE).toBe('inference');
    expect(BeliefSourceTypeEnum.EXTERNAL).toBe('external');
    expect(BeliefSourceTypeEnum.USER_INPUT).toBe('user_input');
    expect(BeliefSourceTypeEnum.HINDSIGHT).toBe('hindsight');
    expect(BeliefSourceTypeEnum.PRIOR).toBe('prior');
  });
});

// ============================================================================
// maxTotalBeliefs Capacity Limit (#1203)
// ============================================================================

describe('maxTotalBeliefs capacity limit', () => {
  it('should evict oldest superseded beliefs when over capacity', async () => {
    const { memory } = createTestMemory({ maxTotalBeliefs: 5 });

    // Create 3 beliefs and supersede them to make them eviction candidates
    const b1 = await createTestBelief(memory, { subject: 's1', predicate: 'p1' });
    const b2 = await createTestBelief(memory, { subject: 's2', predicate: 'p2' });
    await createTestBelief(memory, { subject: 's3', predicate: 'p3' });

    // Supersede b1 and b2 (this creates new beliefs + marks old ones superseded)
    await memory.supersede(
      b1.beliefId,
      {
        subject: 's1',
        predicate: 'p1',
        object: 'new-v1',
        confidence: BeliefConfidenceEnum.MEDIUM,
        sourceType: BeliefSourceTypeEnum.OBSERVATION,
      },
      'updated'
    );

    await memory.supersede(
      b2.beliefId,
      {
        subject: 's2',
        predicate: 'p2',
        object: 'new-v2',
        confidence: BeliefConfidenceEnum.MEDIUM,
        sourceType: BeliefSourceTypeEnum.OBSERVATION,
      },
      'updated'
    );

    // We now have 7 beliefs total (3 original + 2 superseded replacements + 2 = wait)
    // Actually: b1(superseded), b2(superseded), b3(active), new-b1(active), new-b2(active)
    // That's 5 after the first supersede, then 6 after the second → eviction triggers
    // The oldest superseded (b1) should be evicted

    const stats = await memory.getStats();
    expect(stats.ok).toBe(true);
    if (stats.ok) {
      expect(stats.value.totalBeliefs).toBeLessThanOrEqual(5);
    }
  });

  it('should not evict active beliefs even when over capacity', async () => {
    const { memory } = createTestMemory({ maxTotalBeliefs: 3 });

    // Create 4 active beliefs — none superseded, so none can be evicted
    await createTestBelief(memory, { subject: 's1', predicate: 'p1' });
    await createTestBelief(memory, { subject: 's2', predicate: 'p2' });
    await createTestBelief(memory, { subject: 's3', predicate: 'p3' });
    const b4 = await createTestBelief(memory, { subject: 's4', predicate: 'p4' });

    // All 4 are active — eviction only targets superseded beliefs
    const recall = await memory.recall(b4.beliefId);
    expect(recall.ok).toBe(true);
    if (recall.ok) expect(recall.value).not.toBeNull();

    const stats = await memory.getStats();
    expect(stats.ok).toBe(true);
    if (stats.ok) {
      // 4 beliefs exist because none are superseded for eviction
      expect(stats.value.totalBeliefs).toBe(4);
    }
  });

  it('should accept maxTotalBeliefs in config schema', () => {
    const { memory } = createTestMemory({ maxTotalBeliefs: 500 });
    expect(memory).toBeInstanceOf(HindsightBeliefMemory);
  });

  it('should use default maxTotalBeliefs of 10000', async () => {
    const { memory } = createTestMemory();
    // Default config should allow many beliefs without eviction
    for (let i = 0; i < 20; i++) {
      await createTestBelief(memory, {
        subject: `subj-${String(i)}`,
        predicate: `pred-${String(i)}`,
      });
    }
    const stats = await memory.getStats();
    expect(stats.ok).toBe(true);
    if (stats.ok) expect(stats.value.totalBeliefs).toBe(20);
  });
});
