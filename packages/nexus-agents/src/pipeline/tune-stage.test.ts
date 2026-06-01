/**
 * Tests for the shadow-mode TuneStage (#3147, epic #3143 P2).
 */

import { describe, it, expect, vi } from 'vitest';
import type { ILogger } from '../core/index.js';
import { EventBus } from './event-bus.js';
import type { PipelineEvent } from './event-types.js';
import { createTuneStage, intendedActionFor } from './tune-stage.js';

function spyLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: ILogger) {
      return this;
    }),
    setLevel: vi.fn(),
  };
}

const fitnessSignal: PipelineEvent = {
  type: 'signal.fitness_declined',
  timestamp: 1,
  score: 62,
  floor: 90,
  dimension: 'security_review',
};
const voteSignal: PipelineEvent = {
  type: 'signal.vote_rejected',
  timestamp: 2,
  proposalId: 'p-1',
  approvalPercentage: 30,
};

describe('intendedActionFor (#3147)', () => {
  it('maps each signal to its bounded action kind', () => {
    expect(intendedActionFor(fitnessSignal)?.kind).toBe('flag_tech_debt');
    expect(
      intendedActionFor({
        type: 'signal.swarm_unhealthy',
        timestamp: 3,
        agentId: 'gemini',
        reason: 'timeouts',
      })?.kind
    ).toBe('downweight_agent');
    expect(intendedActionFor(voteSignal)?.kind).toBe('record_rejection');
  });

  it('returns undefined for non-signal events', () => {
    expect(
      intendedActionFor({ type: 'task.created', timestamp: 4 } as PipelineEvent)
    ).toBeUndefined();
  });
});

describe('createTuneStage shadow mode (#3147)', () => {
  it('logs the intended action and mutates nothing when a signal is emitted (default = shadow)', () => {
    const bus = new EventBus();
    const logger = spyLogger();
    createTuneStage(bus, { logger });

    bus.emit(fitnessSignal);

    expect(logger.info).toHaveBeenCalledWith(
      'TuneStage (shadow) — intended action',
      expect.objectContaining({ kind: 'flag_tech_debt', signal: 'signal.fitness_declined' })
    );
    // shadow mode performs no mutating action — only an info log
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('ignores non-signal events', () => {
    const bus = new EventBus();
    const logger = spyLogger();
    createTuneStage(bus, { logger });
    bus.emit({ type: 'task.created', timestamp: 9 } as PipelineEvent);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('enabled=true fails closed (logs no-op, does NOT mutate) — PR-4 not implemented', () => {
    const bus = new EventBus();
    const logger = spyLogger();
    createTuneStage(bus, { logger, enabled: true });
    bus.emit(voteSignal);
    expect(logger.warn).toHaveBeenCalledWith(
      'TuneStage enabled but bounded mutation is not implemented yet; no-op',
      expect.objectContaining({ kind: 'record_rejection' })
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('unsubscribe stops the stage', () => {
    const bus = new EventBus();
    const logger = spyLogger();
    const unsub = createTuneStage(bus, { logger });
    unsub();
    bus.emit(fitnessSignal);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
