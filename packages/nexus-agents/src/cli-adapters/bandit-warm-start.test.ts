/** Regression fixture freezes the pre-extraction algorithm from #5275. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { createLogger, getErrorMessage, getTimeProvider, type ILogger } from '../core/index.js';
import { isPersistenceEnabled } from '../config/learning-persistence.js';
import { CliNameSchema } from '../config/model-capabilities-types.js';
import {
  getOutcomeStore,
  OutcomeStore,
  setOutcomeStore,
  resetOutcomeStore,
} from '../orchestration/outcomes/outcome-store.js';
import { PersistentOutcomeStore } from '../orchestration/outcomes/outcome-store-persistence.js';
import { OutcomeCliSchema, TaskOutcomeSchema } from '../orchestration/outcomes/outcome-types.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import { generateSyntheticPriors, runWarmUp, SYNTHETIC_MARKER } from '../cli/warm-up.js';
import { LinUCBBandit } from './linucb-bandit.js';
import { warmStartBandit } from './bandit-warm-start.js';
import { ApiArmIdSchema } from './types-core.js';

// Freeze the outcome cli union on origin/release/10.0 before #6291 B2.
const PreviousOutcomeCliSchema = z.union([CliNameSchema, ApiArmIdSchema, z.literal('unknown')]);
const PreviousTaskOutcomeSchema = TaskOutcomeSchema.extend({ cli: PreviousOutcomeCliSchema });

const NOW = '2026-10-04T12:00:00.000Z';
const ARMS = ['claude', 'gemini', 'codex', 'opencode'];
const logger = createLogger({ component: 'warm-start-test' });
function outcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    id: 'fixture',
    cli: 'claude',
    model: 'claude-default',
    category: 'code_generation',
    success: true,
    durationMs: 100,
    timestamp: NOW,
    source: 'manual',
    ...overrides,
  };
}

function previousWarmStart(bandit: LinUCBBandit, logger: ILogger): void {
  try {
    let replayed = 0;
    if (isPersistenceEnabled()) {
      // Use 30-day lookback — stale all-time data was overriding
      // specialization matrix changes (e.g., architecture claude→gemini) (#1667)
      const WARM_START_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
      const since = new Date(getTimeProvider().now() - WARM_START_LOOKBACK_MS).toISOString();
      const outcomes = getOutcomeStore().query({
        since,
        excludeQualitySignals: ['e2e-eval'],
      });
      if (outcomes.length > 0) {
        replayed = bandit.warmStart(outcomes);
        logger.info('LinUCB warm-started from recent outcomes', {
          outcomesAvailable: outcomes.length,
          outcomesReplayed: replayed,
          lookbackDays: 30,
        });
      }
    }
    // Always seed specialization priors — not just cold-start (#1667).
    // This ensures primaryCli preferences from TASK_SPECIALIZATION_MATRIX
    // always influence LinUCB, even when warm-start data disagrees.
    const priors = generateSyntheticPriors();
    bandit.seedPriors(priors, replayed === 0 ? 3 : 1);
    if (replayed === 0) {
      const result = runWarmUp(logger);
      if (!result.skipped) {
        // Mirror the 30-day path's filter (#2824 bullet) — pre-fix this
        // cold-start fallback queried with no filter, replaying any
        // e2e-eval synthetic outcomes that survived from prior test
        // runs into LinUCB. The 30-day branch above carefully excludes
        // them; the fallback didn't.
        const outcomes = getOutcomeStore().query({ excludeQualitySignals: ['e2e-eval'] });
        bandit.warmStart(outcomes);
      }
      logger.info('LinUCB cold-start seeded from specialization matrix', {
        syntheticOutcomes: result.seeded,
      });
    }
  } catch (error: unknown) {
    logger.warn('LinUCB warm-start failed, starting cold', {
      error: getErrorMessage(error),
    });
  }
}

describe('shared bandit warm start (#5275)', () => {
  let fixture: string;
  let store: OutcomeStore;
  beforeEach(() => {
    fixture = mkdtempOutsideRepo('nexus-5275-warm-');
    vi.stubEnv('NEXUS_DATA_DIR', join(fixture, 'data'));
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    store = new OutcomeStore();
    setOutcomeStore(store);
  });
  afterEach(() => {
    resetOutcomeStore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(fixture, { recursive: true, force: true });
  });

  it('seeds a neutral endpoint prior before cold-start selection (#7151)', () => {
    // Existing stale synthetic rows isolate prior seeding from fallback replay.
    store.append(
      outcome({ qualitySignals: [SYNTHETIC_MARKER], timestamp: '2026-08-01T00:00:00.000Z' })
    );
    const endpoint = 'api:gw-prod';
    const bandit = new LinUCBBandit(['claude', endpoint]);
    warmStartBandit(bandit, logger, { persist: false });
    expect(bandit.getStats().find((arm) => arm.name === endpoint)).toEqual({
      name: endpoint,
      pullCount: 3,
      avgReward: 0.5,
    });
    // An unseeded endpoint wins at this shared neutral context solely through
    // its maximal uncertainty; the neutral prior removes that cold-start bias.
    const context = {
      taskComplexity: 0.5,
      contextLengthNormalized: 0.5,
      isCodeTask: 0,
      isReasoningTask: 0,
      budgetUtilization: 0.5,
      timePressure: 0.5,
    };
    const cold = new LinUCBBandit(['claude', endpoint]);
    cold.seedPriors(generateSyntheticPriors(), 3);
    expect(cold.select(context).armName).toBe(endpoint);
    expect(bandit.select(context).armName).toBe('claude');
  });

  it('seeds a new endpoint neutrally even when recent CLI evidence exists', () => {
    store.append(outcome());
    const bandit = new LinUCBBandit(['claude', 'api:gw-new']);
    warmStartBandit(bandit, logger);
    expect(bandit.getStats()[1]).toEqual({
      name: 'api:gw-new',
      pullCount: 1,
      avgReward: 0.5,
    });
  });

  it.each(['recent', 'empty', 'stale', 'disabled'] as const)(
    'matches the previous algorithm byte-for-byte on a %s fixture',
    (fixtureKind) => {
      const outcomes =
        fixtureKind === 'recent'
          ? [
              outcome(),
              outcome({ cli: 'codex', success: false }),
              outcome({ qualitySignals: ['e2e-eval'] }),
            ]
          : fixtureKind === 'stale'
            ? [outcome({ timestamp: '2026-08-01T00:00:00.000Z' })]
            : [];
      if (fixtureKind === 'disabled') vi.stubEnv('NEXUS_PERSIST_LEARNING', 'false');
      for (const row of outcomes) store.append(row);
      const previous = new LinUCBBandit(ARMS);
      previousWarmStart(previous, logger);
      const previousRows = store.query();
      store = new OutcomeStore();
      for (const row of outcomes) store.append(row);
      setOutcomeStore(store);
      const shared = new LinUCBBandit(ARMS);
      warmStartBandit(shared, logger);
      expect(JSON.stringify(shared.getDetailedStats())).toBe(
        JSON.stringify(previous.getDetailedStats())
      );
      expect(shared.getWarmStartModelStats()).toEqual(previous.getWarmStartModelStats());
      expect(store.query()).toEqual(previousRows);
    }
  );

  it('loads pre-10.0 JSONL and preserves the previous routing warm-start state (#6291 B2)', () => {
    const arms = [...ARMS, 'api:anthropic', 'api:openai', 'api:google', 'api:custom-openai'];
    const rows = arms.flatMap((cli, index) => [
      outcome({ id: `success-${String(index)}`, cli: PreviousOutcomeCliSchema.parse(cli) }),
      outcome({
        id: `failure-${String(index)}`,
        cli: PreviousOutcomeCliSchema.parse(cli),
        success: false,
        failureCategory: 'timeout',
      }),
    ]);
    rows.push(
      outcome({ id: 'unknown', cli: 'unknown' }),
      outcome({ id: 'stale', timestamp: '2026-08-01T00:00:00.000Z' }),
      outcome({ id: 'eval', qualitySignals: ['e2e-eval'] })
    );
    for (const row of rows) store.append(row);
    const before = new LinUCBBandit(arms);
    previousWarmStart(before, logger);
    const filePath = join(fixture, 'legacy-outcomes.jsonl');
    const bytes = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
    const lines = bytes.trimEnd().split('\n');
    expect(lines).toHaveLength(19);
    for (const line of lines) {
      const raw: unknown = JSON.parse(line);
      expect(TaskOutcomeSchema.parse(raw)).toStrictEqual(PreviousTaskOutcomeSchema.parse(raw));
    }
    writeFileSync(filePath, bytes);
    const hydrated = new PersistentOutcomeStore({ filePath, dataDir: fixture });
    expect(hydrated.query()).toEqual(store.query());
    setOutcomeStore(hydrated);
    const after = new LinUCBBandit(arms);
    const result = warmStartBandit(after, logger);
    expect(result).toMatchObject({
      status: 'complete',
      outcomesReplayed: 16,
      empiricalOutcomesReplayed: 16,
      fallbackUsed: false,
    });
    expect(after.getDetailedStats()).toEqual(before.getDetailedStats());
    expect(after.getWarmStartModelStats()).toEqual(before.getWarmStartModelStats());
    expect(after.getStats().map((arm) => arm.pullCount)).toEqual([3, 3, 3, 3, 2, 2, 2, 2]);
    expect(readFileSync(filePath, 'utf8')).toBe(bytes);
  });

  it('round-trips a gateway outcome through disk and warm-starts its own arm (#6291 B2)', () => {
    const filePath = join(fixture, 'gateway-outcomes.jsonl');
    const gateway = TaskOutcomeSchema.parse({ ...outcome(), cli: 'api:gw-prod' });
    const writer = new PersistentOutcomeStore({ filePath, dataDir: fixture });
    writer.append(gateway);
    const hydrated = new PersistentOutcomeStore({ filePath, dataDir: fixture });
    expect(hydrated.query()).toEqual(writer.query());
    expect(hydrated.query()[0]).toMatchObject(gateway);
    expect(OutcomeCliSchema.parse(hydrated.query()[0]?.cli)).toBe('api:gw-prod');
    setOutcomeStore(hydrated);
    const bandit = new LinUCBBandit(['api:gw-prod', 'opencode']);
    expect(warmStartBandit(bandit, logger).empiricalOutcomesReplayed).toBe(1);
    expect(bandit.getStats()[0]).toEqual({ name: 'api:gw-prod', pullCount: 2, avgReward: 0.6 });
    expect(bandit.getWarmStartModelStats()[0]?.arm).toBe('api:gw-prod');
  });

  it('replays only the last 30 days, including the boundary', () => {
    const cutoff = Date.parse(NOW) - 30 * 24 * 60 * 60 * 1000;
    store.append(outcome({ id: 'boundary', timestamp: new Date(cutoff).toISOString() }));
    store.append(
      outcome({ id: 'stale', timestamp: new Date(cutoff - 1).toISOString(), success: false })
    );
    const bandit = new LinUCBBandit(ARMS);
    const reconstruction = warmStartBandit(bandit, logger);
    expect(reconstruction.outcomesReplayed).toBe(1);
    expect(bandit.getWarmStartModelStats()[0]?.replayedCount).toBe(1);
  });

  it('excludes e2e-eval from the recent replay', () => {
    store.append(outcome());
    store.append(outcome({ id: 'eval', qualitySignals: ['e2e-eval'], success: false }));
    const bandit = new LinUCBBandit(ARMS);
    expect(warmStartBandit(bandit, logger).outcomesReplayed).toBe(1);
    expect(bandit.getWarmStartModelStats()[0]?.successCount).toBe(1);
  });

  it.each([0, 1])('weights specialization priors correctly with %i recent outcomes', (count) => {
    // Stale synthetic marker makes runWarmUp skip, isolating prior weight.
    store.append(
      outcome({
        id: 'synthetic',
        qualitySignals: [SYNTHETIC_MARKER],
        timestamp: '2026-08-01T00:00:00.000Z',
      })
    );
    if (count > 0) store.append(outcome());
    const expected = new LinUCBBandit(ARMS);
    if (count > 0) expected.warmStart([outcome()]);
    expected.seedPriors(generateSyntheticPriors(), count === 0 ? 3 : 1);
    const bandit = new LinUCBBandit(ARMS);
    warmStartBandit(bandit, logger);
    expect(bandit.getDetailedStats()).toEqual(expected.getDetailedStats());
  });

  it('retains the cold fallback and excludes e2e-eval from its all-time replay', () => {
    store.append(
      outcome({
        id: 'eval',
        model: 'eval-only',
        cli: 'claude',
        qualitySignals: ['e2e-eval'],
        success: false,
      })
    );
    store.append(outcome({ id: 'stale', cli: 'codex', timestamp: '2026-08-01T00:00:00.000Z' }));
    const bandit = new LinUCBBandit(ARMS);
    const reconstruction = warmStartBandit(bandit, logger);
    expect(reconstruction.outcomesReplayed).toBe(0);
    expect(reconstruction.fallbackUsed).toBe(true);
    expect(reconstruction.fallbackOutcomesReplayed).toBe(store.size - 1);
    expect(
      bandit.getWarmStartModelStats().find((row) => row.model === 'eval-only')
    ).toBeUndefined();
  });

  it('counts matched arms and distinguishes synthetic priors from empirical evidence', () => {
    store.append(outcome({ cli: 'gemini', qualitySignals: [SYNTHETIC_MARKER] }));
    store.append(outcome({ cli: 'codex' }));
    const result = warmStartBandit(new LinUCBBandit(['gemini']), logger);
    expect(result.outcomesReplayed).toBe(1);
    expect(result.empiricalOutcomesReplayed).toBe(0);
    expect(result.reconstructedAt).toBe(NOW);
  });

  it('keeps the legacy failure handling and reports a failed reconstruction', () => {
    vi.spyOn(store, 'query').mockImplementation(() => {
      throw new Error('unreadable fixture');
    });
    const bandit = new LinUCBBandit(ARMS);
    const warn = vi.spyOn(logger, 'warn');
    const result = warmStartBandit(bandit, logger);
    expect(result.status).toBe('failed');
    expect(result.outcomesReplayed).toBe(0);
    expect(bandit.getStats().map((arm) => arm.pullCount)).toEqual([0, 0, 0, 0]);
    expect(warn).toHaveBeenCalledWith('LinUCB warm-start failed, starting cold', {
      error: 'unreadable fixture',
    });
  });

  it('persist:false replays the same fallback in memory and leaves the store untouched', () => {
    const memoryOnly = new LinUCBBandit(ARMS);
    const dry = warmStartBandit(memoryOnly, logger, { persist: false });
    expect(store.size).toBe(0);
    const persisted = new LinUCBBandit(ARMS);
    const wet = warmStartBandit(persisted, logger);
    expect(store.size).toBeGreaterThan(0);
    expect(dry.fallbackOutcomesReplayed).toBe(wet.fallbackOutcomesReplayed);
    expect(dry.fallbackOutcomesReplayed).toBeGreaterThan(0);
    expect(memoryOnly.getDetailedStats()).toEqual(persisted.getDetailedStats());
  });

  it('persist:false skips the fallback replay when synthetic rows already exist, like runWarmUp', () => {
    store.append(
      outcome({
        id: 'old-synthetic',
        qualitySignals: [SYNTHETIC_MARKER],
        timestamp: '2026-08-01T00:00:00.000Z',
      })
    );
    const result = warmStartBandit(new LinUCBBandit(ARMS), logger, { persist: false });
    expect(result.fallbackUsed).toBe(true);
    expect(result.fallbackOutcomesReplayed).toBe(0);
    expect(store.size).toBe(1);
  });
});
