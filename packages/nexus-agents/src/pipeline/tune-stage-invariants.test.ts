/**
 * Tests pinning observability-feedback and tune-stage invariants (#4289, ADR 0020).
 *
 * Verifies that:
 * 1. `signal.fitness_declined` remains strictly a remediation/tech-debt signal (flag_tech_debt)
 *    and never mutates routing adjustments in TuneAdjustmentStore or triggers audit logs,
 *    even when TuneStage runs in enforce mode (`enabled: true`).
 * 2. `computeAdaptiveThresholds` remains purely decoupled from codebase fitness scores,
 *    evaluating solely over observed TaskOutcome history in OutcomeStore.
 * 3. The empty/unmeasured cases (missing dimension, empty outcome stores) are named and safe.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ILogger } from '../core/index.js';
import { getTuneAdjustmentStore, resetTuneAdjustmentStore } from '../core/index.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import { OutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { computeAdaptiveThresholds } from '../orchestration/outcomes/adaptive-thresholds.js';
import { EventBus } from './event-bus.js';
import type { PipelineEvent } from './event-types.js';
import { createTuneStage, intendedActionFor } from './tune-stage.js';

function createSpyLogger(): ILogger {
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

describe('TuneStage & AdaptiveThresholds Invariants (#4289, ADR 0020)', () => {
  afterEach(() => {
    resetTuneAdjustmentStore();
  });

  describe('signal.fitness_declined is non-mutating (Option B)', () => {
    it('produces flag_tech_debt intended action and formats detail with or without dimension', () => {
      const withDim: PipelineEvent = {
        type: 'signal.fitness_declined',
        timestamp: 100,
        score: 72,
        floor: 90,
        dimension: 'canonicalPaths',
      };
      const withoutDim: PipelineEvent = {
        type: 'signal.fitness_declined',
        timestamp: 101,
        score: 65,
        floor: 90,
      };

      const actionWithDim = intendedActionFor(withDim);
      expect(actionWithDim?.kind).toBe('flag_tech_debt');
      expect(actionWithDim?.detail).toContain('(dimension: canonicalPaths)');

      const actionWithoutDim = intendedActionFor(withoutDim);
      expect(actionWithoutDim?.kind).toBe('flag_tech_debt');
      expect(actionWithoutDim?.detail).not.toContain('dimension:');
      expect(actionWithoutDim?.detail).toContain('fitness 65 below floor 90');
    });

    it('never mutates TuneAdjustmentStore or calls demote when enabled=true', () => {
      resetTuneAdjustmentStore();
      const bus = new EventBus();
      const logger = createSpyLogger();
      createTuneStage(bus, { logger, enabled: true });

      const store = getTuneAdjustmentStore();
      for (const cli of CLI_NAMES) {
        expect(store.effectiveMultiplier(cli)).toBe(1.0);
      }

      bus.emit({
        type: 'signal.fitness_declined',
        timestamp: 200,
        score: 50,
        floor: 90,
        dimension: 'layerSeparation',
      });

      // Crucial invariant: zero CLIs demoted by fitness decline
      expect(store.list()).toHaveLength(0);
      for (const cli of CLI_NAMES) {
        expect(store.effectiveMultiplier(cli)).toBe(1.0);
      }

      // Handled as non-routing, shadow-only action
      expect(logger.info).toHaveBeenCalledWith(
        'TuneStage (enforce) — non-routing action, shadow-only',
        expect.objectContaining({
          kind: 'flag_tech_debt',
          signal: 'signal.fitness_declined',
        })
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('never emits tune.demote or tune.reversal audit records on fitness signals', () => {
      resetTuneAdjustmentStore();
      const bus = new EventBus();
      const auditLog = vi.fn();
      createTuneStage(bus, { enabled: true, auditLogger: { log: auditLog } });

      bus.emit({
        type: 'signal.fitness_declined',
        timestamp: 300,
        score: 40,
        floor: 90,
        dimension: 'configSimplicity',
      });

      expect(auditLog).not.toHaveBeenCalled();
    });

    it('does not record intended demotions in TuneAdjustmentStore for fitness signals in shadow mode', () => {
      resetTuneAdjustmentStore();
      const bus = new EventBus();
      const logger = createSpyLogger();
      createTuneStage(bus, { logger, enabled: false });

      bus.emit({
        type: 'signal.fitness_declined',
        timestamp: 400,
        score: 55,
        floor: 90,
      });

      const store = getTuneAdjustmentStore();
      expect(store.demotionStats()).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        'TuneStage (shadow) — intended action',
        expect.objectContaining({ kind: 'flag_tech_debt' })
      );
    });
  });

  describe('computeAdaptiveThresholds domain isolation', () => {
    it('remains a pure function of task outcomes unaffected by fitness audit events', () => {
      const store = new OutcomeStore();
      const bus = new EventBus();
      createTuneStage(bus, { enabled: true });

      // Record 5 outcomes for claude in code_generation
      for (let i = 0; i < 5; i++) {
        store.append({
          id: `t-${String(i)}`,
          cli: 'claude',
          category: 'code_generation',
          model: 'claude-sonnet',
          success: true,
          durationMs: 1000,
          timestamp: new Date().toISOString(),
          source: 'delegate',
        });
      }

      const before = computeAdaptiveThresholds(store, 'claude', 'code_generation');
      expect(before.sampleCount).toBe(5);
      expect(before.confidence).toBeGreaterThan(0);

      // Emit a critical fitness decline on the pipeline bus
      bus.emit({
        type: 'signal.fitness_declined',
        timestamp: 5000,
        score: 10,
        floor: 90,
        dimension: 'governanceIntegration',
      });

      // Adaptive threshold calculation is unchanged: decoupled domain
      const after = computeAdaptiveThresholds(store, 'claude', 'code_generation');
      expect(after).toEqual(before);
    });

    it('names the empty store case truthfully with zero confidence and default baseline', () => {
      const emptyStore = new OutcomeStore();
      const res = computeAdaptiveThresholds(emptyStore, 'claude', 'code_generation');

      expect(res.sampleCount).toBe(0);
      expect(res.confidence).toBe(0);
      expect(res.baseline).toBe(0.7);
      expect(res.maxBonus).toBe(10);
      expect(res.trend).toBe('stable');
    });
  });
});
