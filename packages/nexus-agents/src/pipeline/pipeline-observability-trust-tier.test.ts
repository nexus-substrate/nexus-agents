import { beforeEach, describe, expect, it } from 'vitest';
import { getPipelineEventBus, resetPipelineEventBus } from './event-bus.js';
import { emitPipelineStageEvent } from './pipeline-observability.js';

describe('stage-entry trust provenance reaches the real event bus', () => {
  beforeEach(() => {
    resetPipelineEventBus();
  });

  it.each(['3', 'unmeasured'])('retains the reported tier %s on a stage.started event', (tier) => {
    emitPipelineStageEvent('dev-pipeline', 'plan', 'started', {
      callerTrustTier: tier,
      trustTier: tier,
      inputSanitization: 'unmeasured',
    });

    expect(getPipelineEventBus().query({ type: 'stage.started' })).toEqual([
      expect.objectContaining({
        type: 'stage.started',
        stageId: 'plan',
        callerTrustTier: tier,
        trustTier: tier,
        inputSanitization: 'unmeasured',
      }),
    ]);
  });

  it('retains measured sanitizer modification counts on stage.started', () => {
    const counts = { tagsRemoved: 2, commentsRemoved: 1, fieldsModified: 3 };
    emitPipelineStageEvent('dev-pipeline', 'implement', 'started', {
      callerTrustTier: '2',
      inputSanitization: 'modified',
      inputSanitizationCounts: counts,
    });

    expect(getPipelineEventBus().query({ type: 'stage.started' })).toEqual([
      expect.objectContaining({
        callerTrustTier: '2',
        inputSanitization: 'modified',
        inputSanitizationCounts: counts,
      }),
    ]);
  });

  it('does not invent provenance when a generic stage event has no measurements', () => {
    emitPipelineStageEvent('dev-pipeline', 'plan', 'started');

    const [event] = getPipelineEventBus().query({ type: 'stage.started' });
    expect(event).not.toHaveProperty('callerTrustTier');
    expect(event).not.toHaveProperty('inputSanitization');
  });
});
