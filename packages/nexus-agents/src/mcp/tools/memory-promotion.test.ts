/**
 * Tests for memory-promotion.ts - MemoryPromoter class
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryPromoter,
  DEFAULT_PROMOTION_CONFIG,
  type MemoryPromotionConfig,
} from './memory-promotion.js';
import { BeliefConfidence, BeliefSourceType } from '../../context/belief-core-types.js';
import { MemoryImportance } from '../../context/memory-backend-types.js';
import type { Belief } from '../../context/belief-core-types.js';
import type { SessionLearning } from '../../context/session-memory-types.js';
import type { HindsightBeliefMemory } from '../../context/belief-memory.js';
import type { AgenticMemoryBackend } from '../../context/agentic-memory.js';
import { ok, err } from '../../core/result.js';
import { MemoryError } from '../../context/memory-backend-types.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockBeliefs() {
  return {
    retain: vi.fn(),
  } as unknown as HindsightBeliefMemory;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockAgentic() {
  return {
    storeWithAttributes: vi.fn(),
  } as unknown as AgenticMemoryBackend;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeLearning(overrides: Partial<SessionLearning> = {}) {
  return {
    pattern: 'use-dependency-injection',
    context: 'testing',
    confidence: 0.85,
    source: 'session-1',
    ...overrides,
  } as SessionLearning;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeBelief(overrides: Partial<Belief> = {}) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    beliefId: 'belief-1',
    subject: 'testing',
    predicate: 'learned-pattern',
    object: 'use-di',
    confidence: BeliefConfidence.HIGH,
    sourceType: BeliefSourceType.OBSERVATION,
    sourceRef: 'session',
    version: 1,
    createdAt: thirtyDaysAgo,
    updatedAt: thirtyDaysAgo,
    superseded: false,
    ...overrides,
  } as Belief;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
}

const silentLogger = makeLogger();

describe('DEFAULT_PROMOTION_CONFIG', () => {
  it('should have expected default values', () => {
    expect(DEFAULT_PROMOTION_CONFIG.sessionToBeliefConfidence).toBe(0.75);
    expect(DEFAULT_PROMOTION_CONFIG.beliefToAgenticMinConfidence).toBe(BeliefConfidence.MEDIUM);
    expect(DEFAULT_PROMOTION_CONFIG.beliefStabilizationMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(DEFAULT_PROMOTION_CONFIG.autoPromoteOnSessionEnd).toBe(true);
  });
});

describe('MemoryPromoter', () => {
  let mockBeliefs: HindsightBeliefMemory;
  let mockAgentic: AgenticMemoryBackend;
  let promoter: MemoryPromoter;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockBeliefs = createMockBeliefs();
    mockAgentic = createMockAgentic();
    (mockBeliefs.retain as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.resolve(ok({ beliefId: 'new-belief' }))
    );
    (mockAgentic.storeWithAttributes as ReturnType<typeof vi.fn>).mockReturnValue(
      Promise.resolve(ok({ ok: true }))
    );
    promoter = new MemoryPromoter(mockBeliefs, mockAgentic, {}, silentLogger);
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe('constructor', () => {
    it('should merge partial config with defaults', () => {
      const custom: Partial<MemoryPromotionConfig> = { sessionToBeliefConfidence: 0.9 };
      const p = new MemoryPromoter(mockBeliefs, mockAgentic, custom, silentLogger);
      expect(p).toBeDefined();
    });

    it('should work without logger (uses default)', () => {
      const p = new MemoryPromoter(mockBeliefs, null);
      expect(p).toBeDefined();
    });

    it('should accept null agentic backend', () => {
      const p = new MemoryPromoter(mockBeliefs, null, {}, silentLogger);
      expect(p).toBeDefined();
    });
  });

  // =========================================================================
  // promoteLearningsToBelief
  // =========================================================================

  describe('promoteLearningsToBelief', () => {
    it('should promote learnings meeting confidence threshold', async () => {
      const learnings = [makeLearning({ confidence: 0.85 })];
      const result = await promoter.promoteLearningsToBelief(learnings);
      expect(result).toBe(1);
      expect(mockBeliefs.retain).toHaveBeenCalledOnce();
    });

    it('should skip learnings below confidence threshold', async () => {
      const learnings = [makeLearning({ confidence: 0.5 })];
      const result = await promoter.promoteLearningsToBelief(learnings);
      expect(result).toBe(0);
      expect(mockBeliefs.retain).not.toHaveBeenCalled();
    });

    it('should promote exactly at threshold', async () => {
      const learnings = [makeLearning({ confidence: 0.75 })];
      const result = await promoter.promoteLearningsToBelief(learnings);
      expect(result).toBe(1);
    });

    it('should handle empty learnings array', async () => {
      const result = await promoter.promoteLearningsToBelief([]);
      expect(result).toBe(0);
    });

    it('should count only successful promotions', async () => {
      (mockBeliefs.retain as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(Promise.resolve(ok({ beliefId: 'b1' })))
        .mockRejectedValueOnce(new Error('fail'));
      const learnings = [makeLearning({ confidence: 0.9 }), makeLearning({ confidence: 0.8 })];
      const result = await promoter.promoteLearningsToBelief(learnings);
      expect(result).toBe(1);
    });

    it('should map high confidence (>=0.9) to HIGH belief confidence', async () => {
      await promoter.promoteLearningsToBelief([makeLearning({ confidence: 0.95 })]);
      const retainCall = (mockBeliefs.retain as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(retainCall.confidence).toBe(BeliefConfidence.HIGH);
    });

    it('should map medium confidence (0.75-0.89) to MEDIUM belief confidence', async () => {
      await promoter.promoteLearningsToBelief([makeLearning({ confidence: 0.8 })]);
      const retainCall = (mockBeliefs.retain as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(retainCall.confidence).toBe(BeliefConfidence.MEDIUM);
    });

    it('should pass correct retain arguments', async () => {
      const learning = makeLearning({
        context: 'my-context',
        pattern: 'my-pattern',
        source: 'my-source',
        confidence: 0.95,
      });
      await promoter.promoteLearningsToBelief([learning]);
      expect(mockBeliefs.retain).toHaveBeenCalledWith({
        subject: 'my-context',
        predicate: 'learned-pattern',
        object: 'my-pattern',
        confidence: BeliefConfidence.HIGH,
        sourceType: BeliefSourceType.OBSERVATION,
        sourceRef: 'my-source',
      });
    });

    it('should use fallback sourceRef when source is undefined', async () => {
      const learning = { ...makeLearning({ confidence: 0.9 }) };
      // Remove source to simulate undefined source
      delete (learning as Record<string, unknown>)['source'];
      await promoter.promoteLearningsToBelief([learning]);
      const retainCall = (mockBeliefs.retain as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(retainCall.sourceRef).toBe('session-learning');
    });

    it('should promote multiple learnings and count correctly', async () => {
      const learnings = [
        makeLearning({ confidence: 0.9 }),
        makeLearning({ confidence: 0.6 }),
        makeLearning({ confidence: 0.8 }),
      ];
      const result = await promoter.promoteLearningsToBelief(learnings);
      expect(result).toBe(2);
      expect(mockBeliefs.retain).toHaveBeenCalledTimes(2);
    });

    it('should respect custom confidence threshold', async () => {
      const strict = new MemoryPromoter(
        mockBeliefs,
        mockAgentic,
        { sessionToBeliefConfidence: 0.95 },
        silentLogger
      );
      const learnings = [makeLearning({ confidence: 0.9 })];
      const result = await strict.promoteLearningsToBelief(learnings);
      expect(result).toBe(0);
    });

    it('should log info when learnings are promoted', async () => {
      await promoter.promoteLearningsToBelief([makeLearning({ confidence: 0.9 })]);
      expect(silentLogger.info).toHaveBeenCalledWith('Promoted learnings to beliefs', { count: 1 });
    });
  });

  // =========================================================================
  // promoteBeliefToAgentic
  // =========================================================================

  describe('promoteBeliefToAgentic', () => {
    it('should return 0 when agentic backend is null', async () => {
      const noAgentic = new MemoryPromoter(mockBeliefs, null, {}, silentLogger);
      const result = await noAgentic.promoteBeliefToAgentic([makeBelief()]);
      expect(result).toBe(0);
    });

    it('should promote eligible beliefs', async () => {
      const result = await promoter.promoteBeliefToAgentic([makeBelief()]);
      expect(result).toBe(1);
      expect(mockAgentic.storeWithAttributes).toHaveBeenCalledOnce();
    });

    it('should skip superseded beliefs', async () => {
      const belief = makeBelief({ superseded: true });
      const result = await promoter.promoteBeliefToAgentic([belief]);
      expect(result).toBe(0);
      expect(mockAgentic.storeWithAttributes).not.toHaveBeenCalled();
    });

    it('should skip beliefs below confidence threshold', async () => {
      const belief = makeBelief({ confidence: BeliefConfidence.SPECULATIVE });
      const result = await promoter.promoteBeliefToAgentic([belief]);
      expect(result).toBe(0);
    });

    it('should skip beliefs not yet stabilized', async () => {
      const belief = makeBelief({ createdAt: new Date() });
      const result = await promoter.promoteBeliefToAgentic([belief]);
      expect(result).toBe(0);
    });

    it('should handle empty beliefs array', async () => {
      const result = await promoter.promoteBeliefToAgentic([]);
      expect(result).toBe(0);
    });

    it('should handle storeWithAttributes failure gracefully', async () => {
      (mockAgentic.storeWithAttributes as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('store failed')
      );
      const result = await promoter.promoteBeliefToAgentic([makeBelief()]);
      expect(result).toBe(0);
    });

    it('should handle non-ok result from storeWithAttributes', async () => {
      (mockAgentic.storeWithAttributes as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        Promise.resolve(err(new MemoryError('nope')))
      );
      const result = await promoter.promoteBeliefToAgentic([makeBelief()]);
      expect(result).toBe(0);
    });

    it('should construct correct key for agentic store', async () => {
      const belief = makeBelief({ subject: 'foo', predicate: 'bar' });
      await promoter.promoteBeliefToAgentic([belief]);
      const call = (mockAgentic.storeWithAttributes as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[0]).toBe('belief:foo:bar');
    });

    it('should pass belief data as value', async () => {
      const belief = makeBelief({
        subject: 's',
        predicate: 'p',
        object: 'o',
        confidence: BeliefConfidence.HIGH,
        sourceType: BeliefSourceType.OBSERVATION,
        beliefId: 'b-42',
      });
      await promoter.promoteBeliefToAgentic([belief]);
      const call = (mockAgentic.storeWithAttributes as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[1]).toEqual({
        subject: 's',
        predicate: 'p',
        object: 'o',
        confidence: BeliefConfidence.HIGH,
        sourceType: BeliefSourceType.OBSERVATION,
        beliefId: 'b-42',
      });
    });

    it('should map HIGH confidence to HIGH importance', async () => {
      const belief = makeBelief({ confidence: BeliefConfidence.HIGH });
      await promoter.promoteBeliefToAgentic([belief]);
      const call = (mockAgentic.storeWithAttributes as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[2].importance).toBe(MemoryImportance.HIGH);
    });

    it('should map MEDIUM confidence to MEDIUM importance', async () => {
      const belief = makeBelief({ confidence: BeliefConfidence.MEDIUM });
      await promoter.promoteBeliefToAgentic([belief]);
      const call = (mockAgentic.storeWithAttributes as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[2].importance).toBe(MemoryImportance.MEDIUM);
    });

    it('should map LOW confidence to LOW importance', async () => {
      const lowThreshold = new MemoryPromoter(
        mockBeliefs,
        mockAgentic,
        { beliefToAgenticMinConfidence: BeliefConfidence.LOW },
        silentLogger
      );
      const belief = makeBelief({ confidence: BeliefConfidence.LOW });
      await lowThreshold.promoteBeliefToAgentic([belief]);
      const call = (mockAgentic.storeWithAttributes as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[2].importance).toBe(MemoryImportance.LOW);
    });

    it('should pass predicate and sourceType as tags', async () => {
      const belief = makeBelief({
        predicate: 'learned-pattern',
        sourceType: BeliefSourceType.INFERENCE,
      });
      await promoter.promoteBeliefToAgentic([belief]);
      const call = (mockAgentic.storeWithAttributes as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[2].tags).toEqual(['learned-pattern', BeliefSourceType.INFERENCE]);
    });

    it('should log info when beliefs are promoted', async () => {
      await promoter.promoteBeliefToAgentic([makeBelief()]);
      expect(silentLogger.info).toHaveBeenCalledWith('Promoted beliefs to AgenticMemory', {
        count: 1,
      });
    });
  });

  // =========================================================================
  // runPromotionPipeline
  // =========================================================================

  describe('runPromotionPipeline', () => {
    it('should return complete stats for mixed inputs', async () => {
      const learnings = [makeLearning({ confidence: 0.9 }), makeLearning({ confidence: 0.3 })];
      const beliefs = [makeBelief(), makeBelief({ superseded: true })];
      const stats = await promoter.runPromotionPipeline(learnings, beliefs);
      expect(stats).toEqual({
        learningsEvaluated: 2,
        learningsPromotedToBelief: 1,
        beliefsEvaluated: 2,
        beliefsPromotedToAgentic: 1,
        errors: 0,
      });
    });

    it('should return zeros for empty inputs', async () => {
      const stats = await promoter.runPromotionPipeline([], []);
      expect(stats).toEqual({
        learningsEvaluated: 0,
        learningsPromotedToBelief: 0,
        beliefsEvaluated: 0,
        beliefsPromotedToAgentic: 0,
        errors: 0,
      });
    });

    it('should still promote learnings when agentic is null', async () => {
      const noAgentic = new MemoryPromoter(mockBeliefs, null, {}, silentLogger);
      const stats = await noAgentic.runPromotionPipeline(
        [makeLearning({ confidence: 0.9 })],
        [makeBelief()]
      );
      expect(stats.learningsPromotedToBelief).toBe(1);
      expect(stats.beliefsPromotedToAgentic).toBe(0);
    });
  });

  // =========================================================================
  // Confidence mapping edge cases
  // =========================================================================

  describe('confidence mapping boundaries', () => {
    it('should map confidence=0.9 to HIGH', async () => {
      await promoter.promoteLearningsToBelief([makeLearning({ confidence: 0.9 })]);
      const call = (mockBeliefs.retain as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.confidence).toBe(BeliefConfidence.HIGH);
    });

    it('should map confidence=0.89 to MEDIUM', async () => {
      await promoter.promoteLearningsToBelief([makeLearning({ confidence: 0.89 })]);
      const call = (mockBeliefs.retain as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.confidence).toBe(BeliefConfidence.MEDIUM);
    });

    it('should map confidence=0.5 to LOW (below threshold, not promoted)', async () => {
      // With custom low threshold to allow promotion
      const low = new MemoryPromoter(
        mockBeliefs,
        mockAgentic,
        { sessionToBeliefConfidence: 0.4 },
        silentLogger
      );
      await low.promoteLearningsToBelief([makeLearning({ confidence: 0.5 })]);
      const call = (mockBeliefs.retain as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.confidence).toBe(BeliefConfidence.LOW);
    });

    it('should map confidence=0.3 to SPECULATIVE (with low threshold)', async () => {
      const low = new MemoryPromoter(
        mockBeliefs,
        mockAgentic,
        { sessionToBeliefConfidence: 0.1 },
        silentLogger
      );
      await low.promoteLearningsToBelief([makeLearning({ confidence: 0.3 })]);
      const call = (mockBeliefs.retain as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.confidence).toBe(BeliefConfidence.SPECULATIVE);
    });
  });
});
