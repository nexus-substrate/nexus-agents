/**
 * nexus-agents/mcp - Memory Promotion Pipeline
 *
 * Implements automatic memory promotion between layers:
 * - SessionLearning → Belief (high-confidence learnings become structured knowledge)
 * - Belief → AgenticMemory (stable beliefs become searchable knowledge graph entries)
 *
 * @module mcp/tools/memory-promotion
 * (Source: Issue #746 Phase 4 - Memory Promotion Pipeline)
 */

import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { HindsightBeliefMemory } from '../../context/belief-memory.js';
import { BeliefConfidence, BeliefSourceType } from '../../context/belief-core-types.js';
import type { Belief } from '../../context/belief-core-types.js';
import type { AgenticMemoryBackend } from '../../context/agentic-memory.js';
import type { SessionLearning } from '../../context/session-memory-types.js';
import { MemoryImportance } from '../../context/memory-backend-types.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for memory promotion thresholds.
 * Based on research analysis: arXiv:2512.21567 (Decision-Theoretic Memory)
 */
export interface MemoryPromotionConfig {
  /** Minimum confidence for SessionLearning → Belief promotion (default: 0.75) */
  readonly sessionToBeliefConfidence: number;
  /** Minimum confidence level for Belief → Agentic promotion (default: 'medium') */
  readonly beliefToAgenticMinConfidence: BeliefConfidence;
  /** Minimum belief age in ms before promotion to AgenticMemory (default: 7 days) */
  readonly beliefStabilizationMs: number;
  /** Whether to auto-promote on session end (default: true) */
  readonly autoPromoteOnSessionEnd: boolean;
}

/** Default promotion configuration. */
export const DEFAULT_PROMOTION_CONFIG: MemoryPromotionConfig = {
  sessionToBeliefConfidence: 0.75,
  beliefToAgenticMinConfidence: BeliefConfidence.MEDIUM,
  beliefStabilizationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  autoPromoteOnSessionEnd: true,
};

// ============================================================================
// Promotion Statistics
// ============================================================================

/**
 * Statistics from a promotion run.
 */
export interface PromotionStats {
  readonly learningsEvaluated: number;
  readonly learningsPromotedToBelief: number;
  readonly beliefsEvaluated: number;
  readonly beliefsPromotedToAgentic: number;
  readonly errors: number;
}

// ============================================================================
// MemoryPromoter
// ============================================================================

/**
 * Handles memory promotion between layers.
 * Stateless utility class - instantiate with dependencies for each promotion run.
 */
export class MemoryPromoter {
  private readonly beliefs: HindsightBeliefMemory;
  private readonly agentic: AgenticMemoryBackend | null;
  private readonly config: MemoryPromotionConfig;
  private readonly log: ILogger;

  constructor(
    beliefs: HindsightBeliefMemory,
    agentic: AgenticMemoryBackend | null,
    config: Partial<MemoryPromotionConfig> = {},
    logger?: ILogger
  ) {
    this.beliefs = beliefs;
    this.agentic = agentic;
    this.config = { ...DEFAULT_PROMOTION_CONFIG, ...config };
    this.log = logger ?? createLogger({ component: 'MemoryPromoter' });
  }

  /**
   * Promote high-confidence session learnings to structured beliefs.
   * Returns the number of learnings successfully promoted.
   */
  async promoteLearningsToBelief(learnings: readonly SessionLearning[]): Promise<number> {
    let promoted = 0;
    for (const learning of learnings) {
      if (learning.confidence >= this.config.sessionToBeliefConfidence) {
        const success = await this.promoteSingleLearning(learning);
        if (success) promoted++;
      }
    }
    if (promoted > 0) {
      this.log.info('Promoted learnings to beliefs', { count: promoted });
    }
    return promoted;
  }

  /**
   * Promote stable, high-confidence beliefs to AgenticMemory knowledge graph.
   * Returns the number of beliefs successfully promoted.
   */
  async promoteBeliefToAgentic(beliefs: readonly Belief[]): Promise<number> {
    if (this.agentic === null) {
      this.log.debug('AgenticMemory unavailable, skipping belief promotion');
      return 0;
    }

    let promoted = 0;
    const now = Date.now();

    for (const belief of beliefs) {
      // Skip superseded beliefs
      if (belief.superseded) continue;

      // Check confidence threshold
      if (!this.meetsConfidenceThreshold(belief.confidence)) continue;

      // Check stabilization period
      const ageMs = now - belief.createdAt.getTime();
      if (ageMs < this.config.beliefStabilizationMs) continue;

      const success = await this.promoteSingleBelief(belief);
      if (success) promoted++;
    }

    if (promoted > 0) {
      this.log.info('Promoted beliefs to AgenticMemory', { count: promoted });
    }
    return promoted;
  }

  /**
   * Run full promotion pipeline: learnings → beliefs → agentic.
   */
  async runPromotionPipeline(
    learnings: readonly SessionLearning[],
    beliefs: readonly Belief[]
  ): Promise<PromotionStats> {
    const learningsPromoted = await this.promoteLearningsToBelief(learnings);
    const beliefsPromoted = await this.promoteBeliefToAgentic(beliefs);

    return {
      learningsEvaluated: learnings.length,
      learningsPromotedToBelief: learningsPromoted,
      beliefsEvaluated: beliefs.length,
      beliefsPromotedToAgentic: beliefsPromoted,
      errors: 0,
    };
  }

  /** Promote a single learning to a belief. */
  private async promoteSingleLearning(learning: SessionLearning): Promise<boolean> {
    try {
      const confidence = this.mapSessionConfidenceToBeliefConfidence(learning.confidence);
      await this.beliefs.retain({
        subject: learning.context,
        predicate: 'learned-pattern',
        object: learning.pattern,
        confidence,
        sourceType: BeliefSourceType.OBSERVATION,
        sourceRef: learning.source ?? 'session-learning',
      });
      return true;
    } catch (error) {
      this.log.debug('Failed to promote learning to belief', {
        pattern: learning.pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Promote a single belief to AgenticMemory. */
  private async promoteSingleBelief(belief: Belief): Promise<boolean> {
    if (this.agentic === null) return false;

    try {
      // Create a knowledge entry from the belief triple
      const key = `belief:${belief.subject}:${belief.predicate}`;
      const value = {
        subject: belief.subject,
        predicate: belief.predicate,
        object: belief.object,
        confidence: belief.confidence,
        sourceType: belief.sourceType,
        beliefId: belief.beliefId,
      };

      const result = await this.agentic.storeWithAttributes(key, value, {
        importance: this.mapConfidenceToImportance(belief.confidence),
        tags: [belief.predicate, belief.sourceType],
      });

      return result.ok;
    } catch (error) {
      this.log.debug('Failed to promote belief to AgenticMemory', {
        beliefId: belief.beliefId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Map session confidence (0-1) to belief confidence level. */
  private mapSessionConfidenceToBeliefConfidence(confidence: number): BeliefConfidence {
    if (confidence >= 0.9) return BeliefConfidence.HIGH;
    if (confidence >= 0.75) return BeliefConfidence.MEDIUM;
    if (confidence >= 0.5) return BeliefConfidence.LOW;
    return BeliefConfidence.SPECULATIVE;
  }

  /** Check if belief confidence meets minimum threshold. */
  private meetsConfidenceThreshold(confidence: BeliefConfidence): boolean {
    const order = [
      BeliefConfidence.SPECULATIVE,
      BeliefConfidence.LOW,
      BeliefConfidence.MEDIUM,
      BeliefConfidence.HIGH,
    ];
    const beliefIndex = order.indexOf(confidence);
    const thresholdIndex = order.indexOf(this.config.beliefToAgenticMinConfidence);
    return beliefIndex >= thresholdIndex;
  }

  /** Map belief confidence to memory importance for AgenticMemory. */
  private mapConfidenceToImportance(confidence: BeliefConfidence): MemoryImportance {
    switch (confidence) {
      case BeliefConfidence.HIGH:
        return MemoryImportance.HIGH;
      case BeliefConfidence.MEDIUM:
        return MemoryImportance.MEDIUM;
      default:
        return MemoryImportance.LOW;
    }
  }
}
