/**
 * PolicyEvaluator tests (Issue #923, Phase D)
 *
 * Tests policy evaluation at stage boundaries with mode awareness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PolicyEngine } from './policy-engine.js';
import { EventBus } from './event-bus.js';
import { evaluatePipelinePolicy, getPolicyMode } from './policy-evaluator.js';
import type { PolicyContext, PolicyRule } from './policy-engine.js';
import { createAuditTrail } from '../security/audit-trail.js';
import { securityAuditEventToInput } from '../security/audit-bridge.js';
import type { AuditEvent as SecurityAuditEvent } from '../security/audit-trail.js';

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

describe('evaluatePipelinePolicy', () => {
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
    const result = evaluatePipelinePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('WARN mode: returns allowed=true even with violations', () => {
    engine.registerRule(createBlockingRule('r1'));
    const result = evaluatePipelinePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.ruleId).toBe('r1');
  });

  it('BLOCK mode: returns allowed=false on violations', () => {
    engine.registerRule(createBlockingRule('r1'));
    const result = evaluatePipelinePolicy({ engine, eventBus, mode: 'block' }, ctx);
    expect(result.allowed).toBe(false);
    expect(result.violations).toHaveLength(1);
  });

  it('OFF mode: skips evaluation entirely', () => {
    const spy = vi.fn(() => ({ allow: true as const }));
    engine.registerRule({ id: 'spy-rule', priority: 50, evaluate: spy });
    const result = evaluatePipelinePolicy({ engine, eventBus, mode: 'off' }, ctx);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('collects multiple violations', () => {
    engine.registerRule(createBlockingRule('r1'));
    engine.registerRule(createBlockingRule('r2'));
    engine.registerRule(createPassingRule('r3'));
    const result = evaluatePipelinePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    expect(result.violations).toHaveLength(2);
    const ids = result.violations.map((v) => v.ruleId);
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
  });

  it('emits policy.evaluated events on violations', () => {
    engine.registerRule(createBlockingRule('r1'));
    evaluatePipelinePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    const events = eventBus.query({ type: 'policy.evaluated' });
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe('policy.evaluated');
  });

  it('does not emit events when no violations', () => {
    engine.registerRule(createPassingRule('r1'));
    evaluatePipelinePolicy({ engine, eventBus, mode: 'warn' }, ctx);
    expect(eventBus.query({ type: 'policy.evaluated' })).toHaveLength(0);
  });

  it('works without eventBus', () => {
    engine.registerRule(createBlockingRule('r1'));
    const result = evaluatePipelinePolicy({ engine, mode: 'warn' }, ctx);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(1);
  });

  it('preserves escalateTo from rule decision', () => {
    engine.registerRule({
      id: 'escalate',
      priority: 50,
      evaluate: () => ({ allow: false, reason: 'needs user', escalateTo: 'user' }),
    });
    const result = evaluatePipelinePolicy({ engine, mode: 'warn' }, ctx);
    expect(result.violations[0]!.escalateTo).toBe('user');
  });

  it('returns correct mode in result', () => {
    const r1 = evaluatePipelinePolicy({ engine, mode: 'warn' }, ctx);
    const r2 = evaluatePipelinePolicy({ engine, mode: 'block' }, ctx);
    const r3 = evaluatePipelinePolicy({ engine, mode: 'off' }, ctx);
    expect(r1.mode).toBe('warn');
    expect(r2.mode).toBe('block');
    expect(r3.mode).toBe('off');
  });

  it('treats a throwing rule as a violation (fail-closed) instead of crashing', () => {
    engine.registerRule({
      id: 'throws',
      priority: 50,
      evaluate: () => {
        throw new Error('rule blew up');
      },
    });
    engine.registerRule(createPassingRule('passes'));

    const result = evaluatePipelinePolicy({ engine, eventBus, mode: 'warn' }, ctx);

    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.ruleId).toBe('throws');
    expect(result.violations[0]!.reason.toLowerCase()).toContain('threw');
  });

  it('continues evaluating remaining rules after a rule throws', () => {
    const laterRule = vi.fn(() => ({ allow: true as const }));
    engine.registerRule({
      id: 'throws',
      priority: 50,
      evaluate: () => {
        throw new Error('boom');
      },
    });
    engine.registerRule({ id: 'later', priority: 50, evaluate: laterRule });

    evaluatePipelinePolicy({ engine, eventBus, mode: 'warn' }, ctx);

    expect(laterRule).toHaveBeenCalledOnce();
  });

  it('BLOCK mode: throwing rule halts the pipeline (allowed=false)', () => {
    engine.registerRule({
      id: 'throws',
      priority: 50,
      evaluate: () => {
        throw new Error('boom');
      },
    });
    const result = evaluatePipelinePolicy({ engine, eventBus, mode: 'block' }, ctx);
    expect(result.allowed).toBe(false);
  });
});

describe('evaluatePipelinePolicy — durable dual-emit (#3710)', () => {
  let engine: PolicyEngine;
  let eventBus: EventBus;
  const ctx = createContext({ stageType: 'execute', stageId: 'consensus-to-execute' });

  beforeEach(() => {
    engine = new PolicyEngine();
    eventBus = new EventBus();
  });

  /** Capture every event appended to a durable trail (mirrors the production sink). */
  function captureTrail(): {
    trail: ReturnType<typeof createAuditTrail>;
    events: SecurityAuditEvent[];
  } {
    const events: SecurityAuditEvent[] = [];
    const trail = createAuditTrail((e) => events.push(e));
    return { trail, events };
  }

  it('dual-emit: BOTH the in-memory bus AND the durable trail receive the violation', () => {
    engine.registerRule(createBlockingRule('r1'));
    const { trail, events } = captureTrail();

    evaluatePipelinePolicy({ engine, eventBus, mode: 'warn', auditTrail: trail }, ctx);

    // Bus emit unchanged (back-compat).
    expect(eventBus.query({ type: 'policy.evaluated' })).toHaveLength(1);
    // Durable sink also received exactly one policy_gate event.
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('policy_gate');
  });

  it('mode/ruleIds/stageType ROUND-TRIP into the persisted durable AuditEvent (warn)', () => {
    engine.registerRule(createBlockingRule('rule-A'));
    const { trail, events } = captureTrail();

    evaluatePipelinePolicy({ engine, eventBus, mode: 'warn', auditTrail: trail }, ctx);

    const sec = events[0]!;
    expect(sec.type).toBe('policy_gate');
    if (sec.type !== 'policy_gate') throw new Error('unreachable');
    // The security-event fields carry the soak/enforce signal + rules + stage.
    expect(sec.mode).toBe('warn');
    expect(sec.ruleIds).toEqual(['rule-A']);
    expect(sec.stageType).toBe('execute');

    // …and they survive the durable mapping into the persisted AuditEvent.metadata.
    const durable = securityAuditEventToInput(sec);
    expect(durable.metadata?.['mode']).toBe('warn');
    expect(durable.metadata?.['ruleIds']).toEqual(['rule-A']);
    expect(durable.metadata?.['stageType']).toBe('execute');
  });

  it('mode round-trips as block so soak(warn) is distinguishable from enforce(block)', () => {
    engine.registerRule(createBlockingRule('rule-B'));
    const { trail, events } = captureTrail();

    evaluatePipelinePolicy({ engine, eventBus, mode: 'block', auditTrail: trail }, ctx);

    const sec = events[0]!;
    if (sec.type !== 'policy_gate') throw new Error('unreachable');
    expect(sec.mode).toBe('block');
    expect(sec.allowed).toBe(false); // enforce denies
    expect(securityAuditEventToInput(sec).metadata?.['mode']).toBe('block');
  });

  it('one-append-per-event: count parity between bus emits and durable appends', () => {
    engine.registerRule(createBlockingRule('r1'));
    engine.registerRule(createBlockingRule('r2'));
    engine.registerRule(createBlockingRule('r3'));
    const { trail, events } = captureTrail();

    evaluatePipelinePolicy({ engine, eventBus, mode: 'warn', auditTrail: trail }, ctx);

    const busCount = eventBus.query({ type: 'policy.evaluated' }).length;
    expect(busCount).toBe(3);
    expect(events).toHaveLength(3); // exactly one durable record per violation
    expect(trail.size).toBe(3); // no duplicate appends
  });

  it('no-sink path is byte-identical: omitting auditTrail produces no durable side effect', () => {
    engine.registerRule(createBlockingRule('r1'));
    // Reference run WITH a trail to prove the trail is the only difference.
    const { trail, events } = captureTrail();
    const withTrail = evaluatePipelinePolicy(
      { engine, eventBus: new EventBus(), mode: 'warn', auditTrail: trail },
      ctx
    );
    // Run WITHOUT a trail.
    const noTrail = evaluatePipelinePolicy({ engine, eventBus: new EventBus(), mode: 'warn' }, ctx);

    // Returned result is identical regardless of the sink.
    expect(noTrail).toEqual(withTrail);
    // The no-sink run produced no durable events at all.
    expect(events).toHaveLength(1); // only the with-trail run appended
  });

  it('no violations: durable trail receives nothing', () => {
    engine.registerRule(createPassingRule('ok'));
    const { trail, events } = captureTrail();
    evaluatePipelinePolicy({ engine, eventBus, mode: 'warn', auditTrail: trail }, ctx);
    expect(events).toHaveLength(0);
    expect(trail.size).toBe(0);
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
