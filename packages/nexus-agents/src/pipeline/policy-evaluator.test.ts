/**
 * PolicyEvaluator tests (Issue #923, Phase D)
 *
 * Tests policy evaluation at stage boundaries with mode awareness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PolicyEngine } from './policy-engine.js';
import { EventBus } from './event-bus.js';
import { evaluatePolicy, getPolicyMode } from './policy-evaluator.js';
import type { PolicyContext, PolicyRule } from './policy-engine.js';

// ============================================================================
// Helpers
// ============================================================================

function createContext(overrides?: Partial<PolicyContext>): PolicyContext {
  return {
    taskId: 'task-1',
    stageId: 'stage-1',
    stageType: 'execute',
    pipelineState: {},
    ...overrides,
  };
}

function createBlockingRule(id: string): PolicyRule {
  return {
    id,
    priority: 50,
    evaluate: () => ({ allow: false, reason: `${id} violation` }),
  };
}

function createPassingRule(id: string): PolicyRule {
  return {
    id,
    priority: 50,
    evaluate: () => ({ allow: true }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('evaluatePolicy', () => {
  let engine: PolicyEngine;
  let eventBus: EventBus;
  const ctx = createContext();

  beforeEach(() => {
    engine = new PolicyEngine();
    eventBus = new EventBus();
  });

  it('returns allowed with no violations when all rules pass', () => {
    engine.registerRule(createPassingRule('r1'));
    engine.registerRule(createPassingRule('r2'));
    const result = evaluatePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('WARN mode: returns allowed=true even with violations', () => {
    engine.registerRule(createBlockingRule('r1'));
    const result = evaluatePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.ruleId).toBe('r1');
  });

  it('BLOCK mode: returns allowed=false on violations', () => {
    engine.registerRule(createBlockingRule('r1'));
    const result = evaluatePolicy({ engine, eventBus, mode: 'block' }, ctx);
    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('OFF mode: skips evaluation entirely', () => {
    const spy = vi.fn(() => ({ allow: true as const }));
    engine.registerRule({ id: 'spy-rule', priority: 50, evaluate: spy });
    const result = evaluatePolicy({ engine, eventBus, mode: 'off' }, ctx);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('collects multiple violations', () => {
    engine.registerRule(createBlockingRule('r1'));
    engine.registerRule(createBlockingRule('r2'));
    engine.registerRule(createPassingRule('r3'));
    const result = evaluatePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    expect(result.violations).toHaveLength(2);
    const ids = result.violations.map((v) => v.ruleId);
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
  });

  it('emits policy.evaluated events on violations', () => {
    engine.registerRule(createBlockingRule('r1'));
    evaluatePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    const events = eventBus.query({ type: 'policy.evaluated' });
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe('policy.evaluated');
  });

  it('does not emit events when no violations', () => {
    engine.registerRule(createPassingRule('r1'));
    evaluatePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    expect(eventBus.query({ type: 'policy.evaluated' })).toHaveLength(0);
  });

  it('works without eventBus', () => {
    engine.registerRule(createBlockingRule('r1'));
    const result = evaluatePolicy({ engine, mode: 'warn' }, ctx);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(1);
  });

  it('preserves escalateTo from rule decision', () => {
    engine.registerRule({
      id: 'escalate',
      priority: 50,
      evaluate: () => ({ allow: false, reason: 'needs user', escalateTo: 'user' }),
    });
    const result = evaluatePolicy({ engine, mode: 'warn' }, ctx);
    expect(result.violations[0]!.escalateTo).toBe('user');
  });

  it('returns correct mode in result', () => {
    const r1 = evaluatePolicy({ engine, mode: 'warn' }, ctx);
    const r2 = evaluatePolicy({ engine, mode: 'block' }, ctx);
    const r3 = evaluatePolicy({ engine, mode: 'off' }, ctx);
    expect(r1.mode).toBe('warn');
    expect(r2.mode).toBe('block');
    expect(r3.mode).toBe('off');
  });
});

describe('getPolicyMode', () => {
  const savedPolicy = process.env['NEXUS_V2_POLICY_MODE'];
  const savedMode = process.env['NEXUS_V2_MODE'];

  afterEach(() => {
    if (savedPolicy !== undefined) process.env['NEXUS_V2_POLICY_MODE'] = savedPolicy;
    else delete process.env['NEXUS_V2_POLICY_MODE'];
    if (savedMode !== undefined) process.env['NEXUS_V2_MODE'] = savedMode;
    else delete process.env['NEXUS_V2_MODE'];
  });

  it('defaults to block in full mode', () => {
    delete process.env['NEXUS_V2_POLICY_MODE'];
    delete process.env['NEXUS_V2_MODE'];
    expect(getPolicyMode()).toBe('block');
  });

  it('reads off from env', () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'off';
    expect(getPolicyMode()).toBe('off');
  });

  it('reads block from env', () => {
    process.env['NEXUS_V2_POLICY_MODE'] = 'block';
    expect(getPolicyMode()).toBe('block');
  });

  it('defaults to warn in partial mode', () => {
    delete process.env['NEXUS_V2_POLICY_MODE'];
    process.env['NEXUS_V2_MODE'] = 'partial';
    expect(getPolicyMode()).toBe('warn');
  });
});
