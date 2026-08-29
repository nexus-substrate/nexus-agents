/**
 * Tests for the improvement_review → pipeline-bus fitness signal emitter
 * (#3147, epic #3143 P2; scope per #3289 Option 2 — observability signals route
 * through the typed pipeline bus).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ILogger } from '../../core/index.js';
import type { FitnessAudit, FitnessFinding } from '../../governance/fitness-score.js';
import type {
  PipelineEvent,
  IEventBus,
  EventFilter,
  EventHandler,
} from '../../pipeline/event-types.js';
import { emitFitnessDeclinedSignal } from './improvement-review-signals.js';
import { EventBus } from '../../pipeline/event-bus.js';
import { startTuneStage, shutdownTuneStage } from '../../pipeline/tune-stage.js';

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

function captureBus(emitImpl?: (e: PipelineEvent) => void): {
  bus: IEventBus;
  emitted: PipelineEvent[];
} {
  const emitted: PipelineEvent[] = [];
  const bus: IEventBus = {
    emit: (e: PipelineEvent) => {
      if (emitImpl) emitImpl(e);
      emitted.push(e);
    },
    subscribe: (_f: EventFilter, _h: EventHandler) => () => undefined,
    query: () => [],
    get totalEmitted() {
      return emitted.length;
    },
    get bufferSize() {
      return emitted.length;
    },
  };
  return { bus, emitted };
}

function audit(score: number, findings: readonly FitnessFinding[] = []): FitnessAudit {
  return {
    score,
    dimensions: {
      canonicalPaths: 20,
      explicitBehavior: 15,
      determinism: 15,
      observability: 15,
      configSimplicity: 10,
      layerSeparation: 10,
      operatorErgonomics: 10,
      governanceIntegration: 5,
    },
    findings,
    timestamp: '2026-06-01T00:00:00Z',
    version: 'test',
  };
}

function finding(dimension: FitnessFinding['dimension'], pointsDeducted: number): FitnessFinding {
  return { dimension, severity: 'warning', description: 'd', pointsDeducted };
}

describe('emitFitnessDeclinedSignal (#3147)', () => {
  it('emits signal.fitness_declined with score + floor when score is below floor', () => {
    const { bus, emitted } = captureBus();
    emitFitnessDeclinedSignal(audit(62), 90, bus, spyLogger());
    expect(emitted).toHaveLength(1);
    const ev = emitted[0];
    if (ev?.type === 'signal.fitness_declined') {
      expect(ev.score).toBe(62);
      expect(ev.floor).toBe(90);
    } else {
      throw new Error('expected signal.fitness_declined');
    }
  });

  it('attributes the worst-offending dimension (max points deducted)', () => {
    const { emitted, bus } = captureBus();
    emitFitnessDeclinedSignal(
      audit(60, [finding('observability', 3), finding('layerSeparation', 8)]),
      90,
      bus,
      spyLogger()
    );
    const ev = emitted[0];
    if (ev?.type === 'signal.fitness_declined') {
      expect(ev.dimension).toBe('layerSeparation');
    } else {
      throw new Error('expected signal.fitness_declined');
    }
  });

  it('omits dimension when there are no findings', () => {
    const { emitted, bus } = captureBus();
    emitFitnessDeclinedSignal(audit(80), 90, bus, spyLogger());
    const ev = emitted[0];
    if (ev?.type === 'signal.fitness_declined') {
      expect(ev.dimension).toBeUndefined();
    } else {
      throw new Error('expected signal.fitness_declined');
    }
  });

  it('is a no-op when score is at or above floor', () => {
    const { emitted, bus } = captureBus();
    emitFitnessDeclinedSignal(audit(90), 90, bus, spyLogger());
    emitFitnessDeclinedSignal(audit(95), 90, bus, spyLogger());
    expect(emitted).toHaveLength(0);
  });

  it('swallows + logs a bus.emit error (emission must never break the review path)', () => {
    const logger = spyLogger();
    const { bus } = captureBus(() => {
      throw new Error('bus boom');
    });
    expect(() => {
      emitFitnessDeclinedSignal(audit(50), 90, bus, logger);
    }).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to emit signal.fitness_declined',
      expect.objectContaining({ error: expect.stringContaining('bus boom') })
    );
  });
});

describe('end-to-end: declined fitness → signal → shadow TuneStage (#3147)', () => {
  afterEach(() => {
    shutdownTuneStage();
  });

  it('a below-floor audit emitted on the typed bus is consumed by the wired TuneStage', () => {
    const bus = new EventBus();
    const tuneLogger = spyLogger();
    startTuneStage(bus, { logger: tuneLogger, enabled: false }); // shadow (default is now enforce, #3323)

    emitFitnessDeclinedSignal(audit(62, [finding('determinism', 10)]), 90, bus, spyLogger());

    expect(tuneLogger.info).toHaveBeenCalledWith(
      'TuneStage (shadow) — intended action',
      expect.objectContaining({ kind: 'flag_tech_debt', signal: 'signal.fitness_declined' })
    );
  });
});

describe('emitFitnessDeclinedSignal — non-auditable results (#5014)', () => {
  function bus(): { emit: ReturnType<typeof vi.fn> } {
    return { emit: vi.fn() };
  }
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  it('emits nothing when the audit could not run', () => {
    // `auditable: false` is the not-source-repo sentinel: score 0 means "could
    // not audit", not "fitness is low". `detectFitnessSignals` has refused this
    // since #3621; this emitter was handed the same audit object and did not,
    // so `improvement_review` run from the global npm install published
    // `signal.fitness_declined { score: 0, floor: 90 }` and `tune-stage` turned
    // it into a "fitness 0 below floor 90" tech-debt flag for a repo nobody
    // audited. The response payload carries no fitness field, so the fabricated
    // signal was invisible at the tool boundary.
    const b = bus();

    emitFitnessDeclinedSignal(
      {
        score: 0,
        auditable: false,
        findings: [],
        dimensions: {},
        timestamp: '',
        version: '',
      } as never,
      90,
      b as never,
      logger as never
    );

    expect(b.emit).not.toHaveBeenCalled();
  });

  it('still emits for a genuine below-floor audit', () => {
    // The pair: refusing the sentinel must not silence real low fitness.
    const b = bus();

    emitFitnessDeclinedSignal(
      {
        score: 40,
        auditable: true,
        findings: [],
        dimensions: {},
        timestamp: '',
        version: '',
      } as never,
      90,
      b as never,
      logger as never
    );

    expect(b.emit).toHaveBeenCalledTimes(1);
  });
});
