/**
 * Tests for withStep helper + step bus integration (#1930).
 */
import { describe, it, expect, expectTypeOf, beforeEach, afterEach } from 'vitest';
import { withStep, currentStepId } from './with-step.js';
import { stepBus } from './step-bus.js';
import type { StepEvent } from './step-events.js';

describe('withStep', () => {
  let events: StepEvent[];
  let handler: (e: StepEvent) => void;

  beforeEach(() => {
    events = [];
    handler = (e: StepEvent): void => {
      events.push(e);
    };
    stepBus.on('step', handler);
  });

  afterEach(() => {
    stepBus.off('step', handler);
  });

  it('emits step.started then step.completed for a successful step', async () => {
    const result = await withStep({ name: 'test' }, () => Promise.resolve(42));
    expect(result).toBe(42);
    expect(events).toHaveLength(2);
    expect(events[0]?.event).toBe('step.started');
    expect(events[0]?.name).toBe('test');
    expect(events[1]?.event).toBe('step.completed');
    if (events[1]?.event === 'step.completed') {
      expect(events[1].status).toBe('ok');
      expect(events[1].durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits step.failed and rethrows on error', async () => {
    const boom = new Error('kaboom');
    await expect(
      withStep({ name: 'fail-test' }, () => {
        throw boom;
      })
    ).rejects.toBe(boom);
    expect(events).toHaveLength(2);
    expect(events[1]?.event).toBe('step.failed');
    if (events[1]?.event === 'step.failed') {
      expect(events[1].status).toBe('failed');
      expect(events[1].summary).toBe('kaboom');
    }
  });

  it('categorizes timeout errors', async () => {
    await expect(
      withStep({ name: 'x' }, () => {
        throw new Error('Request timed out after 30s');
      })
    ).rejects.toThrow();
    const failed = events.find((e) => e.event === 'step.failed');
    expect(failed?.event).toBe('step.failed');
    if (failed?.event === 'step.failed') {
      expect(failed.errorCategory).toBe('timeout');
    }
  });

  it('categorizes rate limit errors', async () => {
    await expect(
      withStep({ name: 'x' }, () => {
        throw new Error('API rate limit exceeded');
      })
    ).rejects.toThrow();
    const failed = events.find((e) => e.event === 'step.failed');
    if (failed?.event === 'step.failed') {
      expect(failed.errorCategory).toBe('rate_limit');
    }
  });

  it('propagates parentStepId via AsyncLocalStorage', async () => {
    let innerParent: string | undefined;
    let outerId = '';
    await withStep({ name: 'outer' }, async (ctx) => {
      outerId = ctx.stepId;
      expect(currentStepId()).toBe(ctx.stepId);
      await withStep({ name: 'inner' }, () => {
        innerParent = events.find((e) => e.name === 'inner')?.parentStepId;
        return Promise.resolve();
      });
    });
    expect(innerParent).toBe(outerId);
    expect(currentStepId()).toBeUndefined();
  });

  it('honors explicit parent override', async () => {
    await withStep({ name: 'leaf', parent: 'custom-parent-id' }, () => Promise.resolve());
    expect(events[0]?.parentStepId).toBe('custom-parent-id');
  });

  it('honors parent:null to force root', async () => {
    await withStep({ name: 'outer' }, async () => {
      await withStep({ name: 'root-inside', parent: null }, () => Promise.resolve());
    });
    const rootInside = events.find((e) => e.name === 'root-inside');
    expect(rootInside?.parentStepId).toBeUndefined();
  });

  it('setSummary appears on completed event', async () => {
    await withStep({ name: 'x' }, (ctx) => {
      ctx.setSummary('42 papers, 3 clusters');
      return Promise.resolve();
    });
    const completed = events.find((e) => e.event === 'step.completed');
    if (completed?.event === 'step.completed') {
      expect(completed.summary).toBe('42 papers, 3 clusters');
    }
  });

  it('truncates summary over 120 chars', async () => {
    const longText = 'x'.repeat(200);
    await withStep({ name: 'x' }, (ctx) => {
      ctx.setSummary(longText);
      return Promise.resolve();
    });
    const completed = events.find((e) => e.event === 'step.completed');
    if (completed?.event === 'step.completed') {
      expect(completed.summary?.length).toBeLessThanOrEqual(120);
      expect(completed.summary?.endsWith('…')).toBe(true);
    }
  });

  it('attrs are forwarded on both started and completed', async () => {
    await withStep({ name: 'x', attrs: { iteration: 3 } }, () => Promise.resolve());
    expect(events[0]?.attrs).toEqual({ iteration: 3 });
    expect(events[1]?.attrs).toEqual({ iteration: 3 });
  });

  it('emits no `kind` — the field had no reader and two of its members no producer (#5097)', async () => {
    // Renderer and logger bridge never read `kind`; `workflow.node` / `cli.call`
    // had zero producers. Pin the produced shape so the vocabulary cannot
    // silently re-grow a field nothing consumes.
    await expect(
      withStep({ name: 'shape', attrs: { a: 1 } }, () => {
        throw new Error('boom');
      })
    ).rejects.toThrow();
    await withStep({ name: 'shape', attrs: { a: 1 } }, () => Promise.resolve());
    expect(events.map((e) => Object.keys(e).sort())).toEqual([
      ['attrs', 'event', 'name', 'startedAt', 'stepId'],
      ['attrs', 'durationMs', 'errorCategory', 'event', 'name', 'status', 'stepId', 'summary'],
      ['attrs', 'event', 'name', 'startedAt', 'stepId'],
      ['attrs', 'durationMs', 'event', 'name', 'status', 'stepId'],
    ]);
    expectTypeOf<StepEvent>().not.toHaveProperty('kind');
  });
});
