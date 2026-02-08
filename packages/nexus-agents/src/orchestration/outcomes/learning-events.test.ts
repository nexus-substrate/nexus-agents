/**
 * Tests for learning events — event emission helpers (Issue #901, Phase 4).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../pipeline/event-bus.js';
import type { PipelineEvent } from '../../pipeline/event-types.js';
import { emitThresholdUpdate, emitTrendDetected } from './learning-events.js';

// ============================================================================
// Tests
// ============================================================================

describe('emitThresholdUpdate', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('emits a learning.threshold_updated event', () => {
    const events: PipelineEvent[] = [];
    bus.subscribe({}, (e) => events.push(e));

    emitThresholdUpdate(bus, {
      cli: 'claude',
      category: 'code_generation',
      oldBaseline: 0.7,
      newBaseline: 0.82,
      trend: 'improving',
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('learning.threshold_updated');
  });

  it('includes correct payload fields', () => {
    const events: PipelineEvent[] = [];
    bus.subscribe({}, (e) => events.push(e));

    emitThresholdUpdate(bus, {
      cli: 'gemini',
      category: 'research',
      oldBaseline: 0.7,
      newBaseline: 0.55,
      trend: 'declining',
    });

    const event = events[0] as PipelineEvent & Record<string, unknown>;
    expect(event['cli']).toBe('gemini');
    expect(event['category']).toBe('research');
    expect(event['oldBaseline']).toBe(0.7);
    expect(event['newBaseline']).toBe(0.55);
    expect(event['trend']).toBe('declining');
    expect(typeof event.timestamp).toBe('number');
  });

  it('increments bus totalEmitted count', () => {
    emitThresholdUpdate(bus, {
      cli: 'codex',
      category: 'testing',
      oldBaseline: 0.7,
      newBaseline: 0.7,
      trend: 'stable',
    });

    expect(bus.totalEmitted).toBe(1);
  });
});

describe('emitTrendDetected', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('emits a learning.trend_detected event', () => {
    const events: PipelineEvent[] = [];
    bus.subscribe({}, (e) => events.push(e));

    emitTrendDetected(bus, {
      cli: 'claude',
      category: 'architecture',
      trend: 'improving',
      confidence: 0.8,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('learning.trend_detected');
  });

  it('includes correct payload fields', () => {
    const events: PipelineEvent[] = [];
    bus.subscribe({}, (e) => events.push(e));

    emitTrendDetected(bus, {
      cli: 'codex',
      category: 'devops',
      trend: 'declining',
      confidence: 0.3,
    });

    const event = events[0] as PipelineEvent & Record<string, unknown>;
    expect(event['cli']).toBe('codex');
    expect(event['category']).toBe('devops');
    expect(event['trend']).toBe('declining');
    expect(event['confidence']).toBe(0.3);
    expect(typeof event.timestamp).toBe('number');
  });

  it('notifies multiple subscribers', () => {
    let callCount = 0;
    bus.subscribe({}, () => {
      callCount++;
    });
    bus.subscribe({}, () => {
      callCount++;
    });

    emitTrendDetected(bus, {
      cli: 'gemini',
      category: 'planning',
      trend: 'stable',
      confidence: 0.5,
    });

    expect(callCount).toBe(2);
  });

  it('event is queryable from bus buffer', () => {
    emitTrendDetected(bus, {
      cli: 'claude',
      category: 'security_review',
      trend: 'improving',
      confidence: 1.0,
    });

    const results = bus.query({ type: 'learning.trend_detected' });
    expect(results).toHaveLength(1);
    expect(results[0]?.type).toBe('learning.trend_detected');
  });
});
