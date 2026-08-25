/**
 * Tests for the `run` unified entry point tool (epic #3548, increment A).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// #3712: capture the trustTier handed to runDevPipelineForGoal through the
// run → dev-pipeline executor path (the "hole" — a real RequestContext that ran
// a real research stage on a possibly-untrusted goal with an absent tier).
/**
 * The pipeline result shape the mock returns. Declared rather than inferred so
 * a test can set the #4783 provenance fields — inference from the happy-path
 * literal alone rejects `securityRan`/`planStatus` as unknown properties.
 */
interface FakeDevPipelineResult {
  completed: boolean;
  plan: string;
  tasks: never[];
  voteIterations: number;
  qaIterations: number;
  securityPassed: boolean;
  securityRan?: boolean;
  planStatus?: 'empty';
}
const runDevPipelineForGoalMock = vi.fn(
  (_goal: string, _trustTier?: string): Promise<FakeDevPipelineResult> =>
    Promise.resolve({
      completed: true,
      plan: 'plan',
      tasks: [],
      voteIterations: 1,
      qaIterations: 1,
      securityPassed: true,
    })
);
vi.mock('./dev-pipeline-tool.js', () => ({
  runDevPipelineForGoal: (goal: string, trustTier?: string) =>
    runDevPipelineForGoalMock(goal, trustTier),
}));

// #4362: drive the pipeline executor's reported success/failure. run-tool only
// imports runPipelineForGoal from this module.
interface FakePipelineResult {
  success: boolean;
  templateId: string;
  stepsExecuted: number;
  durationMs: number;
  finalState: Record<string, unknown>;
  error?: string;
}
const runPipelineForGoalMock = vi.fn(
  (_goal: string, _logger?: unknown): Promise<FakePipelineResult> =>
    Promise.resolve({
      success: true,
      templateId: 'general',
      stepsExecuted: 3,
      durationMs: 5,
      finalState: {},
    })
);
vi.mock('./pipeline-tool.js', () => ({
  runPipelineForGoal: (goal: string, logger?: unknown) => runPipelineForGoalMock(goal, logger),
}));

// #4042: capture the gatewayAdapters threaded into the consensus executor. Keep
// every other consensus-vote export real (run-tool only imports runConsensusForGoal).
const runConsensusForGoalMock = vi.fn((_goal: string, _logger?: unknown, _gw?: unknown) =>
  Promise.resolve({ result: { outcome: 'approved' } })
);
vi.mock('./consensus-vote.js', async () => {
  const actual = await vi.importActual<typeof import('./consensus-vote.js')>('./consensus-vote.js');
  return {
    ...actual,
    runConsensusForGoal: (goal: string, logger?: unknown, gw?: unknown) =>
      runConsensusForGoalMock(goal, logger, gw),
  };
});

// #3732: pass-through the secure-handler / timeout chain so the registered
// callback is the bare handler — lets the async-dispatch tests invoke it
// directly. createSecureHandler injects a minimal ctx (the run handler reads
// ctx.requestContext.trustTier). Only the new handler-capture tests use this;
// the existing routeGoal/executeGoal tests call those functions directly.
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler:
    (fn: (args: unknown, ctx: { requestContext: { trustTier?: string } }) => unknown) =>
    (args: unknown) =>
      fn(args, { requestContext: {} }),
}));

import {
  routeGoal,
  executeGoal,
  buildDefaultExecutors,
  isShadowTrainEnabled,
  registerRunTool,
  RunInputSchema,
  type RunResponse,
} from './run-tool.js';
import { entrypointToolFor } from '../../orchestration/strategy-manifest-registry.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import type { ExecutionStrategy } from '../../orchestration/meta-orchestrator.js';
import {
  createRecordingOutcomeSink,
  MetaDispatchError,
  type StrategyExecutorMap,
} from '../../orchestration/meta-dispatcher.js';
import { getMetaOutcomesFile } from '../../config/learning-persistence.js';

const ALL_STRATEGIES: ExecutionStrategy[] = [
  'single-shot',
  'dev-pipeline',
  'pipeline',
  'graph-workflow',
  'orchestrate',
  'consensus',
  'spec',
  'research',
];

// The entrypoint-tool map moved to the strategy-manifest registry (#3835); the
// exhaustive coverage + behaviour-parity assertions now live in
// strategy-manifest-registry.test.ts. routeGoal still resolves its
// recommendedTool through the manifest-sourced entrypointToolFor() below.
describe('strategy entrypoint resolution (manifest-sourced, #3835)', () => {
  it('resolves a recommended tool for every execution strategy', () => {
    for (const s of ALL_STRATEGIES) {
      expect(entrypointToolFor(s)).toBeTruthy();
    }
  });
});

describe('routeGoal', () => {
  it('routes a DAG dev goal to graph-workflow with the matching tool', () => {
    const r: RunResponse = routeGoal({ goal: 'implement the feature', dependencyStructure: 'dag' });
    expect(r.strategy).toBe('graph-workflow');
    expect(r.recommendedTool).toBe('run_graph_workflow');
    expect(r.decisionId).toBeTruthy();
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('routes a consensus goal to consensus_vote', () => {
    const r = routeGoal({ goal: 'should we adopt A or B', requiresConsensus: true });
    expect(r.strategy).toBe('consensus');
    expect(r.recommendedTool).toBe('consensus_vote');
  });

  it('honors forceStrategy', () => {
    const r = routeGoal({ goal: 'anything', forceStrategy: 'spec' });
    expect(r.strategy).toBe('spec');
    expect(r.recommendedTool).toBe('execute_spec');
  });

  it('always includes a recommendedTool consistent with the strategy', () => {
    const r = routeGoal({ goal: 'research and compare alternatives and evaluate the landscape' });
    expect(r.recommendedTool).toBe(entrypointToolFor(r.strategy));
  });
});

describe('RunInputSchema', () => {
  it('requires a non-empty goal', () => {
    expect(RunInputSchema.safeParse({}).success).toBe(false);
    expect(RunInputSchema.safeParse({ goal: '' }).success).toBe(false);
    expect(RunInputSchema.safeParse({ goal: 'do a thing' }).success).toBe(true);
  });

  it('rejects an unknown forceStrategy', () => {
    expect(RunInputSchema.safeParse({ goal: 'g', forceStrategy: 'nonsense' }).success).toBe(false);
  });

  it('accepts the execute flag', () => {
    expect(RunInputSchema.safeParse({ goal: 'g', execute: true }).success).toBe(true);
  });

  it('accepts dispatch: async and rejects unknown values (#3732)', () => {
    expect(RunInputSchema.safeParse({ goal: 'g', dispatch: 'async' }).success).toBe(true);
    expect(RunInputSchema.safeParse({ goal: 'g', dispatch: 'sync' }).success).toBe(true);
    expect(RunInputSchema.safeParse({ goal: 'g', dispatch: 'bogus' }).success).toBe(false);
  });
});

describe('executeGoal (run increment B, #3575)', () => {
  it('dispatches the selected strategy to its executor and records an outcome', async () => {
    const sink = createRecordingOutcomeSink();
    const executors: StrategyExecutorMap = {
      'dev-pipeline': () => Promise.resolve({ completed: true }),
    };
    const res = await executeGoal(
      { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
      { executors, outcomeSink: sink }
    );
    expect(res.executed).toBe(true);
    expect(res.strategy).toBe('dev-pipeline');
    expect(res.result).toEqual({ completed: true });
    expect(res.decisionId).toBeTruthy();
    const outcomes = sink.getOutcomes();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.success).toBe(true);
    expect(outcomes[0]?.decisionId).toBe(res.decisionId);
  });

  it('fails closed for a strategy with no wired executor (records failure)', async () => {
    const sink = createRecordingOutcomeSink();
    await executeGoal(
      { goal: 'decide A or B', forceStrategy: 'consensus', execute: true },
      { executors: {}, outcomeSink: sink }
    ).then(
      () => expect.fail('should have thrown'),
      (err: unknown) => {
        expect(err).toBeInstanceOf(MetaDispatchError);
        expect((err as MetaDispatchError).code).toBe('no_executor');
      }
    );
    expect(sink.getOutcomes()[0]?.success).toBe(false);
  });

  it('propagates an executor failure as MetaDispatchError (recorded)', async () => {
    const sink = createRecordingOutcomeSink();
    const executors: StrategyExecutorMap = {
      'dev-pipeline': () => Promise.reject(new Error('pipeline blew up')),
    };
    await executeGoal(
      { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
      { executors, outcomeSink: sink }
    ).then(
      () => expect.fail('should have thrown'),
      (err: unknown) => {
        expect((err as MetaDispatchError).code).toBe('executor_failed');
      }
    );
    expect(sink.getOutcomes()[0]?.failureReason).toContain('pipeline blew up');
  });
});

describe('run-path trustTier threading (#3712) — the run→dev-pipeline hole', () => {
  beforeEach(() => runDevPipelineForGoalMock.mockClear());

  it("preserves a tier-'3' caller through run→runDevPipelineForGoal (NOT downgraded to '1')", async () => {
    await executeGoal(
      { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
      { trustTier: '3' }
    );
    expect(runDevPipelineForGoalMock).toHaveBeenCalledTimes(1);
    expect(runDevPipelineForGoalMock.mock.calls[0]?.[1]).toBe('3');
  });

  it("threads a trusted tier-'1' caller through unchanged", async () => {
    await executeGoal(
      { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
      { trustTier: '1' }
    );
    expect(runDevPipelineForGoalMock.mock.calls[0]?.[1]).toBe('1');
  });

  it('resolves to undefined tier when no caller tier is supplied (seam fail-closes to 4)', async () => {
    await executeGoal({
      goal: 'implement the feature',
      forceStrategy: 'dev-pipeline',
      execute: true,
    });
    expect(runDevPipelineForGoalMock.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('regression: an untrusted-origin goal resolves to tier>=3 (not silently trusted)', async () => {
    // A goal arriving over an unauthenticated transport derives tier '3'; the run
    // path MUST carry that through so the consensus→execute seam sees untrusted.
    const executors = buildDefaultExecutors('3');
    await executeGoal(
      { goal: 'untrusted external goal text', forceStrategy: 'dev-pipeline', execute: true },
      { executors }
    );
    const threaded = runDevPipelineForGoalMock.mock.calls[0]?.[1];
    expect(threaded).toBeDefined();
    expect(Number(threaded)).toBeGreaterThanOrEqual(3);
  });

  it('threads gatewayAdapters through executeGoal into the consensus executor (#4042)', async () => {
    runConsensusForGoalMock.mockClear();
    const gw = [{ modelId: 'gw-x' }] as unknown as Parameters<typeof buildDefaultExecutors>[1];
    await executeGoal(
      { goal: 'decide A or B', forceStrategy: 'consensus', execute: true },
      { gatewayAdapters: gw }
    );
    // executeGoal -> buildDefaultExecutors -> consensus executor -> runConsensusForGoal(goal, undefined, gw)
    expect(runConsensusForGoalMock).toHaveBeenCalledWith('decide A or B', undefined, gw);
  });
});

describe('shadow-train gating (NEXUS_META_SHADOW_TRAIN, #3593)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'run-shadow-'));
    vi.stubEnv('NEXUS_DATA_DIR', dir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is OFF by default (flag unset) — isShadowTrainEnabled() false', () => {
    vi.stubEnv('NEXUS_META_SHADOW_TRAIN', '');
    expect(isShadowTrainEnabled()).toBe(false);
  });

  it('flag-off: a dispatch writes NO meta-outcomes file', async () => {
    vi.stubEnv('NEXUS_META_SHADOW_TRAIN', '');
    const executors: StrategyExecutorMap = {
      'dev-pipeline': () => Promise.resolve({ completed: true }),
    };
    await executeGoal(
      { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
      { executors }
    );
    expect(existsSync(getMetaOutcomesFile())).toBe(false);
  });

  it('flag-on: a dispatch persists a sanitized meta-outcome line', async () => {
    vi.stubEnv('NEXUS_META_SHADOW_TRAIN', '1');
    expect(isShadowTrainEnabled()).toBe(true);
    const executors: StrategyExecutorMap = {
      'dev-pipeline': () => Promise.resolve({ completed: true }),
    };
    await executeGoal(
      { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
      { executors }
    );
    expect(existsSync(getMetaOutcomesFile())).toBe(true);
  });

  it('flag-on but persistence disabled: no write (both gates required)', async () => {
    vi.stubEnv('NEXUS_META_SHADOW_TRAIN', '1');
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'false');
    expect(isShadowTrainEnabled()).toBe(false);
    const executors: StrategyExecutorMap = {
      'dev-pipeline': () => Promise.resolve({ completed: true }),
    };
    await executeGoal(
      { goal: 'implement the feature', forceStrategy: 'dev-pipeline', execute: true },
      { executors }
    );
    expect(existsSync(getMetaOutcomesFile())).toBe(false);
  });
});

// #3732: `run` with execute:true dispatches the heaviest engines (dev-pipeline/
// pipeline), which can exceed the MCP request timeout even with the 1800s class
// guard (#3734). `dispatch: 'async'` returns a jobId immediately and runs the
// dispatch in the background (poll get_job_result). `run` has no sessionId, so a
// fresh `rn-<uuid>` jobId is always minted.
describe('run async dispatch (execute:true, #3732)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  interface CapturedToolResult {
    isError?: boolean;
    content: Array<{ type: string; text: string }>;
    _meta?: Record<string, unknown>;
  }

  /** Registers the tool against a mock server and returns the captured callback. */
  function captureHandler(): (args: unknown) => Promise<CapturedToolResult> {
    let captured: ((args: unknown) => Promise<CapturedToolResult>) | undefined;
    let registeredName: string | undefined;
    const mockServer = {
      registerTool: (name: string, _schema: unknown, handler: unknown) => {
        registeredName = name;
        captured = handler as (args: unknown) => Promise<CapturedToolResult>;
      },
    };
    registerRunTool(mockServer as never, {
      rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
    });
    expect(registeredName).toBe('run');
    if (captured === undefined) throw new Error('handler not registered');
    return captured;
  }

  function envelope(result: CapturedToolResult): Record<string, unknown> {
    return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
  }

  /**
   * The structured error envelope, which `toolStructuredError` puts in `_meta`
   * (content[0].text carries only the bare message, so it is not JSON).
   */
  function errorEnvelope(result: CapturedToolResult): Record<string, unknown> | undefined {
    const meta = result._meta;
    if (meta === undefined) return undefined;
    return Object.values(meta)[0] as Record<string, unknown> | undefined;
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-rn-async-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    runDevPipelineForGoalMock.mockClear();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns { status: 'pending', jobId } and mints an rn-<uuid> id", async () => {
    const handler = captureHandler();
    const result = await handler({
      goal: 'implement the feature',
      forceStrategy: 'dev-pipeline',
      execute: true,
      dispatch: 'async',
    });
    const env = envelope(result);
    expect(env['status']).toBe('pending');
    expect(typeof env['jobId']).toBe('string');
    expect(env['jobId'] as string).toMatch(/^rn-/);
    expect(env['pollTool']).toBe('get_job_result');
  });

  it('runs inline (sync) by default — returns the executed result, no pending envelope', async () => {
    const handler = captureHandler();
    const result = await handler({
      goal: 'implement the feature',
      forceStrategy: 'dev-pipeline',
      execute: true,
    });
    const env = envelope(result);
    expect(env['status']).toBeUndefined();
    expect(env['executed']).toBe(true);
  });

  it('read-only routing (execute:false) ignores dispatch and stays sync', async () => {
    const handler = captureHandler();
    const result = await handler({ goal: 'implement the feature', dispatch: 'async' });
    const env = envelope(result);
    expect(env['status']).toBeUndefined();
    expect(env['recommendedTool']).toBeTruthy();
  });

  it('records the result to the sidecar when the background dispatch completes', async () => {
    const handler = captureHandler();
    const result = await handler({
      goal: 'implement the feature',
      forceStrategy: 'dev-pipeline',
      execute: true,
      dispatch: 'async',
    });
    const jobId = envelope(result)['jobId'] as string;
    // The background run is fire-and-forget; let the microtask queue drain.
    await new Promise((r) => setImmediate(r));
    const record = readJobResult(jobId);
    expect(record?.status).toBe('complete');
  });

  // #4362 (increment 1 of the #4351 Option C decision): `executeRunBody` wrapped
  // ANY resolved dispatch in `toolSuccess`, so an engine that ran to completion
  // while reporting its own business failure was handed back as a success — and,
  // on the async path, recorded as a `complete` job. Only a THROWN dispatch error
  // was ever surfaced.
  describe('engine-reported failure is not a tool success (#4362)', () => {
    it('surfaces a dev-pipeline that did not complete as a structured error', async () => {
      runDevPipelineForGoalMock.mockResolvedValueOnce({
        completed: false,
        plan: 'plan',
        tasks: [],
        voteIterations: 1,
        qaIterations: 0,
        securityPassed: false,
      });
      const handler = captureHandler();
      const result = await handler({
        goal: 'implement the feature',
        forceStrategy: 'dev-pipeline',
        execute: true,
      });
      expect(result.isError).toBe(true);
      expect(errorEnvelope(result)?.['errorCategory']).toBe('business');
    });

    // #4789: both of the reachable non-completions on the `run` path produced
    // the identical message and discarded `exec.result`, so a caller could not
    // tell "security rejected your change" from "security never ran" — the
    // distinction #4783 put into the result one layer down.
    it('says the security gate REJECTED when the scan actually ran', async () => {
      runDevPipelineForGoalMock.mockResolvedValueOnce({
        completed: false,
        plan: 'plan',
        tasks: [],
        voteIterations: 1,
        qaIterations: 1,
        securityPassed: false,
        securityRan: true,
      });
      const handler = captureHandler();
      const result = await handler({
        goal: 'implement the feature',
        forceStrategy: 'dev-pipeline',
        execute: true,
      });

      const env = errorEnvelope(result);
      expect(env?.['message']).toContain('security gate rejected');
      // The verdict itself must survive, not just a sentence about it.
      expect((env?.['detail'] as Record<string, unknown>)?.['securityRan']).toBe(true);
    });

    it('says the run stopped BEFORE the security gate when it never ran', async () => {
      runDevPipelineForGoalMock.mockResolvedValueOnce({
        completed: false,
        plan: 'plan',
        tasks: [],
        voteIterations: 1,
        qaIterations: 1,
        securityPassed: false,
        securityRan: false,
      });
      const handler = captureHandler();
      const result = await handler({
        goal: 'implement the feature',
        forceStrategy: 'dev-pipeline',
        execute: true,
      });

      const env = errorEnvelope(result);
      expect(env?.['message']).toContain('stopped before the security gate');
      expect(env?.['message']).not.toContain('rejected');
      expect((env?.['detail'] as Record<string, unknown>)?.['securityRan']).toBe(false);
    });

    it('names an empty plan as the reason rather than a generic non-completion', async () => {
      runDevPipelineForGoalMock.mockResolvedValueOnce({
        completed: false,
        plan: '',
        tasks: [],
        voteIterations: 0,
        qaIterations: 0,
        securityPassed: false,
        securityRan: false,
        planStatus: 'empty',
      });
      const handler = captureHandler();
      const result = await handler({
        goal: 'implement the feature',
        forceStrategy: 'dev-pipeline',
        execute: true,
      });

      const env = errorEnvelope(result);
      expect(env?.['message']).toContain('planner returned no plan');
      expect((env?.['detail'] as Record<string, unknown>)?.['planStatus']).toBe('empty');
    });

    it('still reports a bare non-completion when the result says nothing more', async () => {
      // A producer predating #4783 sets neither field. The message must not
      // claim a reason it does not have.
      runDevPipelineForGoalMock.mockResolvedValueOnce({
        completed: false,
        plan: 'plan',
        tasks: [],
        voteIterations: 1,
        qaIterations: 0,
        securityPassed: false,
      });
      const handler = captureHandler();
      const result = await handler({
        goal: 'implement the feature',
        forceStrategy: 'dev-pipeline',
        execute: true,
      });

      const env = errorEnvelope(result);
      expect(env?.['message']).toContain('did not complete');
      expect(env?.['message']).not.toContain('security gate');
    });

    it('surfaces a pipeline that reported success:false as a structured error', async () => {
      runPipelineForGoalMock.mockResolvedValueOnce({
        success: false,
        templateId: 'general',
        stepsExecuted: 2,
        durationMs: 5,
        error: 'stage plan failed',
        finalState: {},
      });
      const handler = captureHandler();
      const result = await handler({
        goal: 'analyze the repository',
        forceStrategy: 'pipeline',
        execute: true,
      });
      expect(result.isError).toBe(true);
      expect(errorEnvelope(result)?.['message']).toContain('stage plan failed');
    });

    it('records a failed job (not complete) when the backgrounded engine fails', async () => {
      runDevPipelineForGoalMock.mockResolvedValueOnce({
        completed: false,
        plan: 'plan',
        tasks: [],
        voteIterations: 1,
        qaIterations: 0,
        securityPassed: false,
      });
      const handler = captureHandler();
      const result = await handler({
        goal: 'implement the feature',
        forceStrategy: 'dev-pipeline',
        execute: true,
        dispatch: 'async',
      });
      const jobId = envelope(result)['jobId'] as string;
      await new Promise((r) => setImmediate(r));
      expect(readJobResult(jobId)?.status).toBe('failed');
    });

    it('still reports a successful engine run as a tool success', async () => {
      const handler = captureHandler();
      const result = await handler({
        goal: 'implement the feature',
        forceStrategy: 'dev-pipeline',
        execute: true,
      });
      expect(result.isError).toBeFalsy();
      expect(envelope(result)['executed']).toBe(true);
    });

    it('leaves a rejected consensus vote a success — a verdict is not a failure', async () => {
      runConsensusForGoalMock.mockResolvedValueOnce({ result: { outcome: 'rejected' } });
      const handler = captureHandler();
      const result = await handler({
        goal: 'should we adopt A or B',
        forceStrategy: 'consensus',
        execute: true,
      });
      expect(result.isError).toBeFalsy();
    });
  });
});
