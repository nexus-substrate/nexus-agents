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
    // #2932: BUILT_IN_RULES was reduced from 5 to 1 — `security-review`,
    // `bounded-iteration`, `cost-budget`, and `high-risk-approval` each read
    // a metadata key (`securityReviewRequired`, `stageAttempts`,
    // `costAccumulator`, `highRisk`) that no producer ever wrote, so every
    // comparison evaluated against undefined and every rule allowed. They
    // were aspirational scaffolding, not real gates. Re-add when a producer
    // subsystem exists.
    it('exports just the trust-tier rule', () => {
      expect(BUILT_IN_RULES).toHaveLength(1);
      expect(BUILT_IN_RULES[0]?.id).toBe('trust-tier');
    });
  });

  // Audit #2824: trustTier producers (issue-triage, pr-reviewer, secure-handler)
  // write the tier as a string per trust-types.ts (TrustTier = '1' | '2' | '3' |
  // '4'). The earlier number-only coercion silently inerted the rule for every
  // real call site. These tests pin the string-acceptance + invalid-input
  // shape so a future revert can't re-inert the gate.
  describe('trust-tier rule (string-tier coercion regression)', () => {
    const trustTierRule = BUILT_IN_RULES.find((r) => r.id === 'trust-tier');

    it('blocks execute stage when trustTier is the string "3"', () => {
      expect(trustTierRule).toBeDefined();
      const result = trustTierRule?.evaluate(
        makeContext({ stageType: 'execute', pipelineState: { trustTier: '3' } })
      );
      expect(result?.allow).toBe(false);
      // Narrow to the deny variant before asserting escalateTo
      if (result && !result.allow) {
        expect(result.escalateTo).toBe('user');
      }
    });

    it('blocks execute stage when trustTier is the string "4"', () => {
      const result = trustTierRule?.evaluate(
        makeContext({ stageType: 'execute', pipelineState: { trustTier: '4' } })
      );
      expect(result?.allow).toBe(false);
    });

    it('allows execute stage when trustTier is the string "1" or "2"', () => {
      for (const tier of ['1', '2'] as const) {
        const result = trustTierRule?.evaluate(
          makeContext({ stageType: 'execute', pipelineState: { trustTier: tier } })
        );
        expect(result?.allow).toBe(true);
      }
    });

    it('blocks execute stages when trustTier is missing (#2957/#2994 fail-closed default)', () => {
      // Pre-#2957 a missing trustTier fell open. With the producer-side
      // wiring landing in the same PR, callers MUST now set
      // metadata.trustTier — anything that doesn't is treated as
      // tier '4' (untrusted) and blocked at execute.
      const result = trustTierRule?.evaluate(
        makeContext({ stageType: 'execute', pipelineState: {} })
      );
      expect(result?.allow).toBe(false);
      if (result?.allow === false) {
        expect(result.reason).toMatch(/Missing or invalid trustTier|untrusted/i);
      }
    });

    it('blocks execute stages when trustTier is a non-numeric string', () => {
      // Non-numeric string fails Number.isFinite; defaults to 4 just like missing.
      const result = trustTierRule?.evaluate(
        makeContext({ stageType: 'execute', pipelineState: { trustTier: 'abc' } })
      );
      expect(result?.allow).toBe(false);
    });

    it('still allows non-execute stages when trustTier is missing', () => {
      // The default-to-untrusted only blocks `execute`; planning / analysis
      // stages continue to allow so the pipeline can reach the boundary.
      const result = trustTierRule?.evaluate(makeContext({ stageType: 'plan', pipelineState: {} }));
      expect(result?.allow).toBe(true);
    });
  });
});
