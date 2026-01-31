/**
 * Unified Routing Types Tests
 *
 * Tests for the unified routing decision types and builder.
 *
 * @module cli-adapters/unified-routing-types.test
 */

import { describe, it, expect } from 'vitest';
import {
  RoutingDecisionBuilder,
  createRoutingDecisionBuilder,
  createSimpleRoutingDecision,
  UnifiedRoutingDecisionSchema,
} from './unified-routing-types.js';
import type { CliName } from './types-core.js';

describe('UnifiedRoutingDecision', () => {
  describe('RoutingDecisionBuilder', () => {
    it('should build a valid routing decision with all required fields', () => {
      const decision = new RoutingDecisionBuilder()
        .withSelectedCli('claude' as CliName)
        .withConfidence(0.95)
        .withReason('High quality response expected')
        .withStrategy('composite')
        .withDecisionTime(42)
        .build();

      expect(decision.selectedCli).toBe('claude');
      expect(decision.confidence).toBe(0.95);
      expect(decision.reason).toBe('High quality response expected');
      expect(decision.strategy).toBe('composite');
      expect(decision.decisionTimeMs).toBe(42);
      expect(decision.alternatives).toEqual([]);
      expect(decision.stagesExecuted).toEqual([]);
    });

    it('should clamp confidence to 0-1 range', () => {
      const decisionHigh = new RoutingDecisionBuilder()
        .withSelectedCli('claude' as CliName)
        .withConfidence(1.5)
        .withReason('Test')
        .withStrategy('direct')
        .withDecisionTime(10)
        .build();

      expect(decisionHigh.confidence).toBe(1);

      const decisionLow = new RoutingDecisionBuilder()
        .withSelectedCli('claude' as CliName)
        .withConfidence(-0.5)
        .withReason('Test')
        .withStrategy('direct')
        .withDecisionTime(10)
        .build();

      expect(decisionLow.confidence).toBe(0);
    });

    it('should include optional fields when set', () => {
      const decision = new RoutingDecisionBuilder()
        .withSelectedCli('gemini' as CliName)
        .withConfidence(0.8)
        .withReason('Multimodal task')
        .withStrategy('quality')
        .withDecisionTime(25)
        .withAlternatives(['claude' as CliName, 'codex' as CliName])
        .withStagesExecuted(['budget', 'topsis', 'linucb'])
        .withBudgetStatus(true)
        .withComplexity('complex')
        .withTokenEstimate(5000)
        .withTopsisScore(0.72)
        .withUcbScore(1.35)
        .build();

      expect(decision.alternatives).toEqual(['claude', 'codex']);
      expect(decision.stagesExecuted).toEqual(['budget', 'topsis', 'linucb']);
      expect(decision.withinBudget).toBe(true);
      expect(decision.estimatedComplexity).toBe('complex');
      expect(decision.estimatedTokens).toBe(5000);
      expect(decision.topsisScore).toBe(0.72);
      expect(decision.ucbScore).toBe(1.35);
    });

    it('should include cascade-specific fields', () => {
      const decision = new RoutingDecisionBuilder()
        .withSelectedCli('claude' as CliName)
        .withConfidence(0.9)
        .withReason('Agreement reached')
        .withStrategy('agreement_cascade')
        .withDecisionTime(150)
        .withCascadeInfo({
          resolvedAtStage: 1,
          consensusReached: true,
          agreementScore: 0.85,
        })
        .build();

      expect(decision.resolvedAtStage).toBe(1);
      expect(decision.consensusReached).toBe(true);
      expect(decision.agreementScore).toBe(0.85);
    });

    it('should include metadata when set', () => {
      const decision = new RoutingDecisionBuilder()
        .withSelectedCli('codex' as CliName)
        .withConfidence(0.75)
        .withReason('Code task')
        .withStrategy('zero_router')
        .withDecisionTime(30)
        .withMetadata({ taskType: 'code_implementation', source: 'mcp' })
        .build();

      expect(decision.metadata).toEqual({ taskType: 'code_implementation', source: 'mcp' });
    });

    it('should merge metadata from multiple calls', () => {
      const decision = new RoutingDecisionBuilder()
        .withSelectedCli('claude' as CliName)
        .withConfidence(0.9)
        .withReason('Test')
        .withStrategy('direct')
        .withDecisionTime(10)
        .withMetadata({ key1: 'value1' })
        .withMetadata({ key2: 'value2' })
        .build();

      expect(decision.metadata).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should throw when required field is missing - selectedCli', () => {
      expect(() =>
        new RoutingDecisionBuilder()
          .withConfidence(0.9)
          .withReason('Test')
          .withStrategy('direct')
          .withDecisionTime(10)
          .build()
      ).toThrow('selectedCli is required');
    });

    it('should throw when required field is missing - confidence', () => {
      expect(() =>
        new RoutingDecisionBuilder()
          .withSelectedCli('claude' as CliName)
          .withReason('Test')
          .withStrategy('direct')
          .withDecisionTime(10)
          .build()
      ).toThrow('confidence is required');
    });

    it('should throw when required field is missing - reason', () => {
      expect(() =>
        new RoutingDecisionBuilder()
          .withSelectedCli('claude' as CliName)
          .withConfidence(0.9)
          .withStrategy('direct')
          .withDecisionTime(10)
          .build()
      ).toThrow('reason is required');
    });

    it('should throw when required field is missing - strategy', () => {
      expect(() =>
        new RoutingDecisionBuilder()
          .withSelectedCli('claude' as CliName)
          .withConfidence(0.9)
          .withReason('Test')
          .withDecisionTime(10)
          .build()
      ).toThrow('strategy is required');
    });

    it('should throw when required field is missing - decisionTimeMs', () => {
      expect(() =>
        new RoutingDecisionBuilder()
          .withSelectedCli('claude' as CliName)
          .withConfidence(0.9)
          .withReason('Test')
          .withStrategy('direct')
          .build()
      ).toThrow('decisionTimeMs is required');
    });
  });

  describe('createRoutingDecisionBuilder', () => {
    it('should create a new builder instance', () => {
      const builder = createRoutingDecisionBuilder();
      expect(builder).toBeInstanceOf(RoutingDecisionBuilder);
    });
  });

  describe('createSimpleRoutingDecision', () => {
    it('should create a minimal routing decision', () => {
      const decision = createSimpleRoutingDecision('claude' as CliName, 'Direct selection', 5);

      expect(decision.selectedCli).toBe('claude');
      expect(decision.confidence).toBe(1.0);
      expect(decision.reason).toBe('Direct selection');
      expect(decision.strategy).toBe('direct');
      expect(decision.decisionTimeMs).toBe(5);
      expect(decision.alternatives).toEqual([]);
      expect(decision.stagesExecuted).toEqual(['direct']);
    });
  });

  describe('UnifiedRoutingDecisionSchema', () => {
    it('should validate a correct routing decision', () => {
      const decision = {
        selectedCli: 'claude',
        confidence: 0.9,
        reason: 'Test reason',
        strategy: 'composite',
        decisionTimeMs: 42,
        alternatives: ['gemini'],
        stagesExecuted: ['budget', 'topsis'],
      };

      const result = UnifiedRoutingDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });

    it('should reject invalid confidence values', () => {
      const decision = {
        selectedCli: 'claude',
        confidence: 1.5, // Out of range
        reason: 'Test reason',
        strategy: 'composite',
        decisionTimeMs: 42,
        alternatives: [],
        stagesExecuted: [],
      };

      const result = UnifiedRoutingDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });

    it('should reject invalid strategy values', () => {
      const decision = {
        selectedCli: 'claude',
        confidence: 0.9,
        reason: 'Test reason',
        strategy: 'invalid_strategy', // Not in enum
        decisionTimeMs: 42,
        alternatives: [],
        stagesExecuted: [],
      };

      const result = UnifiedRoutingDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });

    it('should accept all valid strategy values', () => {
      const strategies = [
        'composite',
        'quality',
        'budget',
        'confidence_cascade',
        'agreement_cascade',
        'zero_router',
        'preference',
        'topsis',
        'linucb',
        'direct',
      ];

      for (const strategy of strategies) {
        const decision = {
          selectedCli: 'claude',
          confidence: 0.9,
          reason: 'Test',
          strategy,
          decisionTimeMs: 10,
          alternatives: [],
          stagesExecuted: [],
        };

        const result = UnifiedRoutingDecisionSchema.safeParse(decision);
        expect(result.success).toBe(true);
      }
    });

    it('should validate optional fields correctly', () => {
      const decision = {
        selectedCli: 'claude',
        confidence: 0.9,
        reason: 'Test',
        strategy: 'composite',
        decisionTimeMs: 42,
        alternatives: [],
        stagesExecuted: [],
        withinBudget: true,
        estimatedComplexity: 'complex',
        estimatedTokens: 1000,
        topsisScore: 0.8,
        ucbScore: 1.2,
        resolvedAtStage: 2,
        consensusReached: true,
        agreementScore: 0.95,
        metadata: { custom: 'data' },
      };

      const result = UnifiedRoutingDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });
  });
});
