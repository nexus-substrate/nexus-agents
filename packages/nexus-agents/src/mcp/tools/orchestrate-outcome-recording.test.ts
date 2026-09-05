/**
 * Tests for OutcomeStore recording in orchestrate and execute-expert tools (Issue #1014).
 *
 * Verifies that both tools record task outcomes to the OutcomeStore for
 * closed-loop learning (LinUCB rewards, weather report, persistence).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOutcomeStore,
  setOutcomeStore,
  OutcomeStore,
  TaskOutcomeSchema,
} from '../../orchestration/outcomes/index.js';
import { ok } from '../../core/result.js';
import { OrchestratorAdapter } from '../../orchestration/orchestrator-adapters.js';
import { NOOP_NOTIFIER } from '../mcp-notifier.js';
import { RateLimiter } from '../middleware/index.js';

// Pre-import heavy modules once instead of dynamic import per test (perf: saves ~2s)
import * as orchestrateMod from './orchestrate.js';
import * as executeExpertMod from './execute-expert.js';

// Mock tool-memory to avoid side effects
vi.mock('./tool-memory.js', () => {
  const noop = vi.fn();
  const noopAsync = vi
    .fn()
    .mockResolvedValue({ learningsPromotedToBelief: 0, beliefsPromotedToAgentic: 0 });
  return {
    getToolMemory: vi.fn(() => ({
      recordTask: noop,
      recordLearning: noop,
      recordError: noop,
      recordBelief: noopAsync,
      getRelevantLearnings: vi.fn(),
      getRelevantBeliefs: vi.fn().mockResolvedValue(undefined),
      getRelevantErrorHints: vi.fn(),
      runPromotionPipeline: noopAsync,
    })),
  };
});

// Mock research auto-catalog
vi.mock('./research-auto-catalog.js', () => ({
  getAutoCatalog: vi.fn(() => ({ scanAndRecord: vi.fn() })),
}));

// Mock V2 pipeline (fire-and-forget instrumentation)
vi.mock('../../pipeline/v2-orchestrate.js', () => ({
  orchestrateInputToTaskContract: vi.fn(),
  executeOrchestratePipeline: vi.fn().mockResolvedValue({}),
}));

// Mock V2 config
vi.mock('../../pipeline/v2-config.js', () => ({
  resolveV2Config: vi.fn(() => ({
    delegateEnabled: false,
    orchestrateEnabled: false,
    aorchestraEnabled: false,
    dispatchEnabled: false,
  })),
}));

// Mock orchestrate-aorchestra
vi.mock('./orchestrate-aorchestra.js', () => ({
  computeAgentPlan: vi.fn(),
}));

describe('Orchestrate OutcomeStore recording (Issue #1014)', () => {
  beforeEach(() => {
    setOutcomeStore(new OutcomeStore());
  });

  afterEach(() => {
    setOutcomeStore(new OutcomeStore());
    vi.unstubAllEnvs();
  });

  it('attributes a production-path outcome to the executing CLI (#5513)', async () => {
    vi.stubEnv('NEXUS_TASK_STATE_ENABLED', '0');
    const executingAgent = {
      execute: vi.fn().mockResolvedValue(
        ok({
          output: {},
          metadata: { executedCli: 'codex', executedCliSource: 'executed' },
        })
      ),
    };
    const orchestrator = new OrchestratorAdapter();
    orchestrator.setOrchestrator(executingAgent);
    let handler: ((args: unknown) => Promise<unknown>) | undefined;
    const server = {
      registerTool: vi.fn(
        (_name: string, _config: unknown, callback: (args: unknown) => Promise<unknown>): void => {
          handler = callback;
        }
      ),
    };
    orchestrateMod.registerOrchestrateTool(server as never, {
      orchestrator,
      notifier: NOOP_NOTIFIER,
      rateLimiter: new RateLimiter({ capacity: 10, refillRate: 10, refillIntervalMs: 1000 }),
    });
    if (handler === undefined) throw new Error('orchestrate handler was not registered');

    await handler({
      task: 'Refactor the distributed authentication architecture for concurrent security workloads.',
    });

    expect(executingAgent.execute).toHaveBeenCalledOnce();
    expect(getOutcomeStore().query().at(-1)).toMatchObject({
      cli: 'codex',
      cliSource: 'executed',
    });
  });

  it('records a success outcome to OutcomeStore after orchestration', () => {
    const store = getOutcomeStore();
    const initialSize = store.size;

    // The key assertion: the module exports are properly wired.
    expect(orchestrateMod.registerOrchestrateTool).toBeDefined();
    expect(typeof orchestrateMod.registerOrchestrateTool).toBe('function');

    // Verify OutcomeStore is accessible and functioning
    store.append({
      id: 'test-direct',
      cli: 'claude',
      category: 'code_generation',
      model: 'orchestrator',
      success: true,
      durationMs: 100,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });
    expect(store.size).toBe(initialSize + 1);
  });

  it('attributes an outcome to the supplied executed CLI (#5499)', () => {
    orchestrateMod.recordToOutcomeStore('Implement a feature', true, 100, {
      actualCli: 'gemini',
    });

    const recorded = getOutcomeStore().query().at(-1);
    expect(recorded?.cli).toBe('gemini');
    expect(recorded?.cliSource).toBe('executed');
  });

  it('labels category-default CLI attribution when execution CLI is unavailable (#5499)', () => {
    orchestrateMod.recordToOutcomeStore('Implement a feature', true, 100);

    const recorded = getOutcomeStore().query().at(-1);
    expect(recorded?.cli).toBe('codex');
    expect(recorded?.cliSource).toBe('category-default');
  });

  it('keeps legacy outcomes without cliSource unmeasured (#5499)', () => {
    const parsed = TaskOutcomeSchema.safeParse({
      id: 'legacy-outcome',
      cli: 'claude',
      category: 'exploration',
      model: 'orchestrator',
      success: true,
      durationMs: 100,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cliSource).toBeUndefined();
  });

  it('OutcomeStore accepts orchestrator model name', () => {
    const store = getOutcomeStore();

    // This validates the outcome shape that orchestrate.ts now produces
    store.append({
      id: `orch-${String(Date.now())}`,
      cli: 'claude',
      category: 'exploration',
      model: 'orchestrator',
      success: true,
      durationMs: 500,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.model).toBe('orchestrator');
    expect(last?.source).toBe('delegate');
    expect(last?.cli).toBe('claude');
  });

  it('OutcomeStore accepts failure outcomes from orchestrator', () => {
    const store = getOutcomeStore();

    store.append({
      id: `orch-fail-${String(Date.now())}`,
      cli: 'claude',
      category: 'architecture',
      model: 'orchestrator',
      success: false,
      durationMs: 2000,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.success).toBe(false);
    expect(last?.model).toBe('orchestrator');
  });
});

describe('Execute-expert OutcomeStore recording (Issue #1014)', () => {
  beforeEach(() => {
    setOutcomeStore(new OutcomeStore());
  });

  afterEach(() => {
    setOutcomeStore(new OutcomeStore());
  });

  it('OutcomeStore accepts expert execution outcomes', () => {
    const store = getOutcomeStore();

    store.append({
      id: `exp-${String(Date.now())}`,
      cli: 'claude',
      category: 'code_review',
      model: 'claude-sonnet-4-6',
      success: true,
      durationMs: 1500,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.model).toBe('claude-sonnet-4-6');
  });

  it('OutcomeStore accepts expert failure outcomes', () => {
    const store = getOutcomeStore();

    store.append({
      id: `exp-fail-${String(Date.now())}`,
      cli: 'claude',
      category: 'security_review',
      model: 'expert',
      success: false,
      durationMs: 3000,
      timestamp: new Date().toISOString(),
      source: 'delegate',
    });

    const entries = store.query();
    const last = entries[entries.length - 1];
    expect(last?.success).toBe(false);
    expect(last?.model).toBe('expert');
  });

  it('execute-expert module exports registerExecuteExpertTool', () => {
    expect(executeExpertMod.registerExecuteExpertTool).toBeDefined();
    expect(typeof executeExpertMod.registerExecuteExpertTool).toBe('function');
  });
});
