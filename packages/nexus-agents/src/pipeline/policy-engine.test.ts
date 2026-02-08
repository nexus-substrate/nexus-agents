/**
 * PolicyEngine tests (Issue #913, Phase 5-1)
 *
 * Tests rule registration, evaluation, priority ordering,
 * and built-in rules.
 */
import { describe, it, expect } from 'vitest';

import {
  PolicyEngine,
  BUILT_IN_RULES,
  type PolicyRule,
  type PolicyContext,
} from './policy-engine.js';
import type { PolicyGateSpec } from './task-contract.js';

// ============================================================================
// Fixtures
// ============================================================================

function makeContext(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    taskId: 'task-1',
    stageId: 'stage-1',
    stageType: 'execute',
    pipelineState: {},
    ...overrides,
  };
}

function makeGate(overrides: Partial<PolicyGateSpec> = {}): PolicyGateSpec {
  return {
    id: 'gate-1',
    afterStage: 'analyze',
    beforeStage: 'execute',
    rules: [],
    onFail: 'block',
    ...overrides,
  };
}

function allowRule(id: string, priority: number): PolicyRule {
  return {
    id,
    priority,
    evaluate: () => ({ allow: true }),
  };
}

function blockRule(id: string, priority: number, reason: string): PolicyRule {
  return {
    id,
    priority,
    evaluate: () => ({ allow: false, reason }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('PolicyEngine', () => {
  describe('registerRule', () => {
    it('registers a rule', () => {
      const engine = new PolicyEngine();
      engine.registerRule(allowRule('test', 50));
      expect(engine.listRules()).toHaveLength(1);
    });

    it('rejects duplicate rule IDs', () => {
      const engine = new PolicyEngine();
      engine.registerRule(allowRule('dup', 50));
      expect(() => {
        engine.registerRule(allowRule('dup', 60));
      }).toThrow('duplicate');
    });
  });

  describe('evaluate', () => {
    it('allows when no rules match gate', () => {
      const engine = new PolicyEngine();
      engine.registerRule(allowRule('other', 50));
      const gate = makeGate({ rules: ['missing'] });
      const result = engine.evaluate(gate, makeContext());
      expect(result.allow).toBe(true);
    });

    it('evaluates matching rules by priority', () => {
      const engine = new PolicyEngine();
      engine.registerRule(allowRule('low', 10));
      engine.registerRule(blockRule('high', 90, 'blocked'));
      const gate = makeGate({ rules: ['low', 'high'] });
      const result = engine.evaluate(gate, makeContext());
      expect(result.allow).toBe(false);
    });

    it('short-circuits on first block', () => {
      const engine = new PolicyEngine();
      let callCount = 0;
      engine.registerRule({
        id: 'blocker',
        priority: 100,
        evaluate: () => {
          callCount++;
          return { allow: false, reason: 'stop' };
        },
      });
      engine.registerRule({
        id: 'never-reached',
        priority: 50,
        evaluate: () => {
          callCount++;
          return { allow: true };
        },
      });
      const gate = makeGate({ rules: ['blocker', 'never-reached'] });
      engine.evaluate(gate, makeContext());
      expect(callCount).toBe(1);
    });

    it('allows when all rules pass', () => {
      const engine = new PolicyEngine();
      engine.registerRule(allowRule('a', 80));
      engine.registerRule(allowRule('b', 60));
      const gate = makeGate({ rules: ['a', 'b'] });
      const result = engine.evaluate(gate, makeContext());
      expect(result.allow).toBe(true);
    });
  });

  describe('listRules', () => {
    it('returns rules sorted by priority descending', () => {
      const engine = new PolicyEngine();
      engine.registerRule(allowRule('low', 10));
      engine.registerRule(allowRule('high', 90));
      engine.registerRule(allowRule('mid', 50));
      const rules = engine.listRules();
      expect(rules[0]?.id).toBe('high');
      expect(rules[1]?.id).toBe('mid');
      expect(rules[2]?.id).toBe('low');
    });
  });

  describe('built-in rules', () => {
    it('exports 5 built-in rules', () => {
      expect(BUILT_IN_RULES).toHaveLength(5);
    });

    it('bounded-iteration blocks exceeded retries', () => {
      const rule = BUILT_IN_RULES.find((r) => r.id === 'bounded-iteration');
      expect(rule).toBeDefined();
      const ctx = makeContext({
        pipelineState: { stageAttempts: 5 },
        stageId: 'retry-stage',
      });
      const result = rule?.evaluate(ctx);
      expect(result?.allow).toBe(false);
    });

    it('bounded-iteration allows under limit', () => {
      const rule = BUILT_IN_RULES.find((r) => r.id === 'bounded-iteration');
      const ctx = makeContext({
        pipelineState: { stageAttempts: 1 },
      });
      const result = rule?.evaluate(ctx);
      expect(result?.allow).toBe(true);
    });

    it('cost-budget blocks over budget', () => {
      const rule = BUILT_IN_RULES.find((r) => r.id === 'cost-budget');
      expect(rule).toBeDefined();
      const ctx = makeContext({
        pipelineState: {
          costAccumulator: 90,
          costBudget: 100,
        },
      });
      const result = rule?.evaluate(ctx);
      expect(result?.allow).toBe(false);
    });

    it('cost-budget allows when no budget set', () => {
      const rule = BUILT_IN_RULES.find((r) => r.id === 'cost-budget');
      const ctx = makeContext({
        pipelineState: {},
      });
      const result = rule?.evaluate(ctx);
      expect(result?.allow).toBe(true);
    });
  });
});
