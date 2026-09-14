/**
 * Model-selection SHADOW glue for CompositeRouter (#4197), split out of
 * composite-router.ts in #6148. The router-level cases moved verbatim from
 * composite-router.test.ts; the PendingRoutingOutcomes cases exercise the
 * sibling directly.
 *
 * @module cli-adapters/composite-router-model-shadow.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompositeRouter } from './composite-router.js';
import { PendingRoutingOutcomes } from './composite-router-model-shadow.js';
import type { CompositeRoutingDecision } from './composite-router-types.js';
import type { DifficultyEstimate } from './zero-router-types.js';
import type { ICliAdapter, CliTask, CliName } from './types.js';
import type { ILogger } from '../core/index.js';
import {
  getModelSelectionShadowFailureCount,
  readModelSelectionShadowRecords,
  resetModelSelectionShadowFailureCount,
} from './model-selection-shadow.js';
import { resetModelSelectionReadinessLogging } from './model-selection-readiness.js';
import type { LinUCBBandit } from './linucb-bandit.js';
import { getModelSelectionShadowFile } from '../config/learning-persistence.js';
import { getDefaultModelForCli } from '../config/model-config-helpers.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';

/**
 * Creates a mock CLI adapter for testing.
 */
function createMockAdapter(name: CliName): ICliAdapter {
  return {
    name,
    transport: 'subprocess',
    capabilities: {
      reasoning: 8,
      contextWindow: 200000,
      codeGeneration: 9,
      speed: 7,
      cost: 5,
    },
    execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'mock response' } }),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, version: '1.0.0' }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getCapacity: vi.fn().mockResolvedValue({ remainingTokens: 100000 }),
    getModelInfo: vi.fn().mockReturnValue({ id: name, name }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as ICliAdapter;
}

/**
 * Creates test adapters map.
 */
function createTestAdapters(): Map<CliName, ICliAdapter> {
  const map = new Map<CliName, ICliAdapter>();
  map.set('claude', createMockAdapter('claude'));
  map.set('gemini', createMockAdapter('gemini'));
  map.set('codex', createMockAdapter('codex'));
  return map;
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function createExecutionScopedRouter(adapters: Map<CliName, ICliAdapter>): CompositeRouter {
  return new CompositeRouter(adapters, {
    enableZeroRouter: true,
    zeroRouterConfig: { enableCalibration: true },
    enableBudgetFilter: false,
    enableTopsisRanking: false,
    enableLinUCBSelection: true,
    enableCapacityBalancing: false,
    enableRoutingMemory: false,
    enableStrategyDistillation: false,
  });
}

function makeSpyLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ILogger;
}

/** The decision fields the pending-outcome map reads; the rest is never touched. */
type TrackedDecisionFields = Pick<
  CompositeRoutingDecision,
  'cliName' | 'difficultyEstimate' | 'difficultyTier' | 'model'
>;

/**
 * Builds a decision carrying only the fields `PendingRoutingOutcomes` reads.
 * The cast is deliberate: a full `CompositeRoutingDecision` needs an adapter
 * and a task profile the map never dereferences.
 */
function makeDecision(fields: Partial<TrackedDecisionFields> = {}): CompositeRoutingDecision {
  const tracked: TrackedDecisionFields = { cliName: 'claude', ...fields };
  return tracked as unknown as CompositeRoutingDecision;
}

function makeDifficultyEstimate(aggregateScore: number): DifficultyEstimate {
  return {
    dimensions: {
      reasoning: 0.5,
      knowledge: 0.5,
      creativity: 0.5,
      precision: 0.5,
      context_length: 0.5,
    },
    aggregateScore,
    level: 'medium',
    recommendedTier: 'balanced',
    confidence: 0.9,
    dominantDimension: 'reasoning',
  };
}

describe('PendingRoutingOutcomes', () => {
  let dir: string;
  let prevDataDir: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pending-outcomes-'));
    prevDataDir = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dir;
    resetModelSelectionShadowFailureCount();
    resetModelSelectionReadinessLogging();
  });

  afterEach(() => {
    delete process.env['NEXUS_ROUTE_MODEL_SHADOW'];
    if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = prevDataDir;
    rmSync(dir, { recursive: true, force: true });
    resetModelSelectionReadinessLogging();
  });

  it('take() returns the tracked entry once and undefined afterwards', () => {
    const pending = new PendingRoutingOutcomes(makeSpyLogger());
    const task: CliTask = { content: 'tracked task' };
    pending.track(
      task,
      makeDecision({
        cliName: 'gemini',
        difficultyEstimate: makeDifficultyEstimate(0.7),
      })
    );

    expect(pending.take(task)).toEqual({
      difficultyAttribution: { difficulty: 0.7, selectedCli: 'gemini' },
      modelShadow: undefined,
    });
    expect(pending.take(task)).toBeUndefined();
  });

  it('take() is keyed by task identity, not content', () => {
    const pending = new PendingRoutingOutcomes(makeSpyLogger());
    pending.track({ content: 'same' }, makeDecision());
    expect(pending.take({ content: 'same' })).toBeUndefined();
  });

  it('track() computes a shadow comparison only when the flag is on and a tier is present', () => {
    process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
    const pending = new PendingRoutingOutcomes(makeSpyLogger());
    const tiered: CliTask = { content: 'tiered' };
    const untiered: CliTask = { content: 'untiered' };
    pending.track(tiered, makeDecision({ difficultyTier: 'balanced' }));
    pending.track(untiered, makeDecision());

    expect(pending.take(tiered)?.modelShadow?.tier).toBe('balanced');
    expect(pending.take(untiered)?.modelShadow).toBeUndefined();
    expect(getModelSelectionShadowFailureCount()).toBe(0);
  });

  it('joinModelShadowOutcome() persists the pending comparison with the outcome', () => {
    process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
    const pending = new PendingRoutingOutcomes(makeSpyLogger());
    const task: CliTask = { content: 'joined' };
    pending.track(task, makeDecision({ difficultyTier: 'powerful' }));
    const entry = pending.take(task);
    expect(entry?.modelShadow).toBeDefined();

    pending.joinModelShadowOutcome(entry?.modelShadow, false);

    const records = readModelSelectionShadowRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.tier).toBe('powerful');
    expect(records[0]?.success).toBe(false);
    expect(records[0]?.cli).toBe(entry?.modelShadow?.cli);
  });

  it('joinModelShadowOutcome() writes nothing for an undefined comparison', () => {
    process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
    const pending = new PendingRoutingOutcomes(makeSpyLogger());
    pending.joinModelShadowOutcome(undefined, true);
    expect(existsSync(getModelSelectionShadowFile())).toBe(false);
  });
});

describe('CompositeRouter', () => {
  // #4197: shadow-mode eval recording for NEXUS_ROUTE_MODEL_SELECTION.
  describe('route-model shadow eval (#4197)', () => {
    let dir: string;
    let prevDataDir: string | undefined;
    let shadowRouter: CompositeRouter;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'router-shadow-'));
      prevDataDir = process.env['NEXUS_DATA_DIR'];
      process.env['NEXUS_DATA_DIR'] = dir;
      resetModelSelectionShadowFailureCount();
      resetModelSelectionReadinessLogging();
      shadowRouter = new CompositeRouter(createTestAdapters());
    });

    afterEach(() => {
      delete process.env['NEXUS_ROUTE_MODEL_SHADOW'];
      delete process.env['NEXUS_ROUTE_MODEL_SELECTION'];
      if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
      else process.env['NEXUS_DATA_DIR'] = prevDataDir;
      rmSync(dir, { recursive: true, force: true });
      resetModelSelectionReadinessLogging();
    });

    it('records nothing when the flag is off (default)', async () => {
      const task: CliTask = { content: 'Design a microservices architecture' };
      const result = await shadowRouter.route(task);
      expect(result.ok).toBe(true);
      shadowRouter.recordDifficultyOutcome(task, true);
      expect(existsSync(getModelSelectionShadowFile())).toBe(false);
    });

    it('persists an outcome-joined shadow record when enabled, without touching the live decision', async () => {
      process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
      const task: CliTask = { content: 'Design a microservices architecture' };
      const result = await shadowRouter.route(task);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Live decision unchanged: route-time selection stays OFF, so no model.
      expect(result.value.model).toBeUndefined();
      expect(result.value.difficultyTier).toBeDefined();

      shadowRouter.recordDifficultyOutcome(task, true);

      const records = readModelSelectionShadowRecords();
      expect(records).toHaveLength(1);
      const rec = records[0];
      expect(rec?.success).toBe(true);
      expect(rec?.tier).toBe(result.value.difficultyTier);
      // With selection off, the actual model is the CLI default the adapter
      // resolves late; agreement is derived from it.
      expect(rec?.actualModel).toBe(getDefaultModelForCli(rec?.cli as CliNameLiteral));
      expect(rec?.agree).toBe(rec?.actualModel === rec?.shadowModel);
      expect(getModelSelectionShadowFailureCount()).toBe(0);
    });

    // ATTRIBUTION CAVEAT (#4218 review): the intended eval configuration is
    // SELECTION off + SHADOW on (the previous test) — that is the cohort the
    // readiness gate judges. With SELECTION live, `decision.model` is what the
    // record attributes as `actualModel`, but `executeTask` does not thread
    // `decision.model` into the adapter execution (pre-existing #3394 seam,
    // deliberately NOT changed here), so under SELECTION=true the attributed
    // model is the decision's pick, not necessarily what the adapter ran.
    // Shadow records gathered with SELECTION live are trivially agree=true and
    // carry no flip evidence either way.
    it('records agree=true when route-time selection is live (actual === shadow)', async () => {
      process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
      process.env['NEXUS_ROUTE_MODEL_SELECTION'] = 'true';
      const task: CliTask = { content: 'Design a microservices architecture' };
      const result = await shadowRouter.route(task);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      shadowRouter.recordDifficultyOutcome(task, false);

      const records = readModelSelectionShadowRecords();
      expect(records).toHaveLength(1);
      expect(records[0]?.actualModel).toBe(result.value.model);
      expect(records[0]?.agree).toBe(true);
      expect(records[0]?.success).toBe(false);
    });

    it('skips the shadow sample entirely for tasks with a pinned model (#4218 review)', async () => {
      process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
      // A pinned CliTask.model is what the adapter actually executes — the CLI
      // default the comparison would assume never ran, so pinned tasks are not
      // evidence about the tier selector and must not enter the log.
      const task: CliTask = {
        content: 'Design a microservices architecture',
        model: 'pinned-model-id',
      };
      const result = await shadowRouter.route(task);
      expect(result.ok).toBe(true);
      shadowRouter.recordDifficultyOutcome(task, true);
      expect(readModelSelectionShadowRecords()).toHaveLength(0);
      expect(getModelSelectionShadowFailureCount()).toBe(0);
    });

    it('does not join an outcome for a different task', async () => {
      process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
      const task: CliTask = { content: 'Design a microservices architecture' };
      await shadowRouter.route(task);
      shadowRouter.recordDifficultyOutcome({ content: 'Some other task entirely' }, true);
      expect(readModelSelectionShadowRecords()).toHaveLength(0);
    });

    it('logs when rerouting drops an incomplete shadow comparison', async () => {
      process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
      const log = makeSpyLogger();
      shadowRouter = new CompositeRouter(createTestAdapters(), undefined, log);
      const task: CliTask = { content: 'rerouted task' };

      await shadowRouter.route(task);
      await shadowRouter.route(task);

      expect(log.debug).toHaveBeenCalledWith(
        'Dropping incomplete model-selection shadow comparison after task reroute'
      );
    });

    it('pairs identical-content concurrent executions with their own shadow decisions', async () => {
      process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
      const concurrentAdapters = createTestAdapters();
      shadowRouter = createExecutionScopedRouter(concurrentAdapters);
      const bandit = (shadowRouter as unknown as { linucbBandit?: LinUCBBandit }).linucbBandit;
      expect(bandit).toBeDefined();
      if (bandit === undefined) return;
      vi.spyOn(bandit, 'select')
        .mockReturnValueOnce({ armIndex: 1, armName: 'gemini', ucbScore: 1 })
        .mockReturnValueOnce({ armIndex: 0, armName: 'claude', ucbScore: 1 });
      const gemini = concurrentAdapters.get('gemini');
      const claude = concurrentAdapters.get('claude');
      expect(gemini).toBeDefined();
      expect(claude).toBeDefined();
      if (gemini === undefined || claude === undefined) return;
      const first = createDeferred<Awaited<ReturnType<ICliAdapter['execute']>>>();
      const second = createDeferred<Awaited<ReturnType<ICliAdapter['execute']>>>();
      vi.mocked(gemini.execute).mockReturnValueOnce(first.promise);
      vi.mocked(claude.execute).mockReturnValueOnce(second.promise);
      const taskA: CliTask = { content: 'identical concurrent task' };
      const taskB: CliTask = { content: 'identical concurrent task' };

      const executionA = shadowRouter.executeTask(taskA);
      await vi.waitFor(() => {
        expect(gemini.execute).toHaveBeenCalledOnce();
      });
      const executionB = shadowRouter.executeTask(taskB);
      await vi.waitFor(() => {
        expect(claude.execute).toHaveBeenCalledOnce();
      });
      first.resolve({ ok: true, value: { text: 'first' } });
      second.resolve({
        ok: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: 'second failed',
          cli: 'claude',
          retryable: false,
        },
      });
      await Promise.all([executionA, executionB]);

      const records = readModelSelectionShadowRecords();
      expect(records).toHaveLength(2);
      expect(records.find((record) => record.cli === 'gemini')?.success).toBe(true);
      expect(records.find((record) => record.cli === 'claude')?.success).toBe(false);
    });

    it('never breaks routing or outcome recording when the shadow log cannot be written', async () => {
      process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
      // Occupy the data-dir path with a FILE so the learning dir can't exist.
      const blocked = join(dir, 'blocked');
      writeFileSync(blocked, 'occupied', 'utf-8');
      process.env['NEXUS_DATA_DIR'] = blocked;

      const task: CliTask = { content: 'Design a microservices architecture' };
      const result = await shadowRouter.route(task);
      expect(result.ok).toBe(true);
      expect(() => {
        shadowRouter.recordDifficultyOutcome(task, true);
      }).not.toThrow();
      expect(getModelSelectionShadowFailureCount()).toBeGreaterThanOrEqual(1);
    });
  });
});
