/**
 * run_pipeline MCP Tool Tests (#1736)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Pass-through the secure-handler / timeout chain so the registered callback
// is the bare handler — lets the tests invoke it directly (#2824).
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

// #3730: stub the adaptive orchestrator so the async background run resolves
// fast and deterministically (no live adapters in unit tests).
interface StubOrchestratorResult {
  success: boolean;
  templateId: string;
  selectionMethod: string;
  taskClassification: { pipelineType: string };
  stepsExecuted: number;
  durationMs: number;
  /** Present only on the #4363 failure fixtures. */
  error?: string | undefined;
  dryRun?: boolean;
  finalState: Readonly<Record<string, unknown>>;
  errorDetail?: Readonly<Record<string, unknown>>;
}
const ORCHESTRATOR_RESULT: StubOrchestratorResult = {
  success: true,
  templateId: 'general',
  selectionMethod: 'auto',
  taskClassification: { pipelineType: 'general' },
  stepsExecuted: 1,
  durationMs: 1,
  finalState: {},
};
const runAdaptiveOrchestratorMock = vi.fn(() => Promise.resolve(ORCHESTRATOR_RESULT));
vi.mock('../../pipeline/adaptive-orchestrator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../pipeline/adaptive-orchestrator.js')>();
  return {
    ...actual,
    runAdaptiveOrchestrator: () => runAdaptiveOrchestratorMock(),
  };
});

import { PipelineInputSchema, registerPipelineTool, runPipelineForGoal } from './pipeline-tool.js';
import type { HandlerContext } from '../middleware/secure-handler.js';
import { createRequestContext } from '../middleware/request-context.js';
import { createLogger } from '../../core/index.js';
import * as executor from '../../pipeline/agent-executor.js';
import type { ILogger } from '../../core/index.js';
import { ERROR_ENVELOPE_META_KEY } from '../error-envelope.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { runGraphPipeline } from '../../pipeline/graph-pipeline-runner.js';
import { DEV_PIPELINE_TEMPLATE } from '../../pipeline/templates.js';
import { createDevStageRegistry } from '../../pipeline/stage-wrappers.js';
import { createVoteStage } from '../../pipeline/agent-executor-vote.js';
import { createBudgetGuard } from '../../pipeline/budget-guard.js';
import { researchContextFromText } from '../../pipeline/research-context.js';
import type { DevPipelineStages } from '../../pipeline/dev-pipeline.js';
import * as consensusVote from './consensus-vote.js';

describe('PipelineInputSchema', () => {
  it('rejects proof_of_learning with retirement and migration guidance (#5234)', () => {
    const input = {
      task: 'Build a login form',
      votingStrategy: 'proof_of_learning',
    };
    expect(() => PipelineInputSchema.parse(input)).toThrow(
      /proof_of_learning.*retired.*9\.0.*#5234/
    );
    expect(() => PipelineInputSchema.parse(input)).toThrow(/simple_majority.*higher_order/);
  });

  it('accepts a valid task with defaults', () => {
    const parsed = PipelineInputSchema.parse({ task: 'Build a login form' });
    expect(parsed.task).toBe('Build a login form');
    expect(parsed.dryRun).toBe(false);
    expect(parsed.quickMode).toBe(false);
    expect(parsed.simulateVotes).toBe(false);
  });

  it('rejects a task shorter than the 5-char minimum', () => {
    expect(PipelineInputSchema.safeParse({ task: 'hi' }).success).toBe(false);
  });

  it('rejects a timeoutMs outside the 30s-600s range', () => {
    expect(PipelineInputSchema.safeParse({ task: 'valid task', timeoutMs: 5_000 }).success).toBe(
      false
    );
  });

  it('accepts an explicit template override and dryRun', () => {
    const parsed = PipelineInputSchema.parse({
      task: 'audit this',
      template: 'audit',
      dryRun: true,
    });
    expect(parsed.template).toBe('audit');
    expect(parsed.dryRun).toBe(true);
  });

  it('defaults dispatch to sync and accepts async (#3730)', () => {
    expect(PipelineInputSchema.parse({ task: 'valid task' }).dispatch).toBe('sync');
    expect(PipelineInputSchema.parse({ task: 'valid task', dispatch: 'async' }).dispatch).toBe(
      'async'
    );
    expect(() => PipelineInputSchema.parse({ task: 'valid task', dispatch: 'bogus' })).toThrow();
  });
});

interface CapturedToolResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  _meta?: Record<string, unknown>;
}

describe('run_pipeline dry-run vote evidence (#7240)', () => {
  it.each([
    { kind: 'approved', approvalPercentage: 83, voteRecordId: 'vr-approved' },
    { kind: 'rejected', approvalPercentage: 17, voteRecordId: 'vr-rejected', feedback: 'Revise' },
    {
      kind: 'no_quorum',
      approvalPercentage: 0,
      voteRecordId: 'vr-quorum',
      reason: 'Missing voter',
    },
  ])('surfaces the $kind plan vote', async (vote) => {
    runAdaptiveOrchestratorMock.mockResolvedValueOnce({
      ...ORCHESTRATOR_RESULT,
      success: vote.kind === 'approved',
      dryRun: true,
      finalState: vote.kind === 'approved' ? { voteResult: { vote } } : {},
      ...(vote.kind !== 'approved' ? { errorDetail: { voteResult: { vote } } } : {}),
    });

    const result = await captureHandler()({ task: 'Build feature X', dryRun: true });
    expect(result.isError === true).toBe(vote.kind !== 'approved');
    const output =
      vote.kind === 'approved'
        ? (JSON.parse(result.content[0]!.text) as Record<string, unknown>)
        : errorDetail(result);

    expect(output).toMatchObject({
      dryRun: true,
      planVoteDecision: vote.kind,
      planVoteApprovalPercentage: vote.approvalPercentage,
      planVoteRecordId: vote.voteRecordId,
    });
  });

  it('omits a record id when the vote did not persist one', async () => {
    runAdaptiveOrchestratorMock.mockResolvedValueOnce({
      ...ORCHESTRATOR_RESULT,
      dryRun: true,
      finalState: { voteResult: { vote: { kind: 'approved', approvalPercentage: 100 } } },
    });
    const result = await captureHandler()({ task: 'Build feature X', dryRun: true });
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(output['planVoteDecision']).toBe('approved');
    expect(output).not.toHaveProperty('planVoteRecordId');
  });

  it.each([
    {},
    { voteResult: null },
    { voteResult: { vote: undefined } },
    { voteResult: { vote: { kind: 'unknown', approvalPercentage: 100 } } },
    { voteResult: { vote: { kind: 'rejected', approvalPercentage: 17 } } },
  ])('omits evidence when no vote was produced: %j', async (finalState) => {
    runAdaptiveOrchestratorMock.mockResolvedValueOnce({
      ...ORCHESTRATOR_RESULT,
      dryRun: true,
      finalState,
    });
    const result = await captureHandler()({ task: 'Build feature X', dryRun: true });
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;

    expect(output).not.toHaveProperty('planVoteDecision');
    expect(output).not.toHaveProperty('planVoteApprovalPercentage');
    expect(output).not.toHaveProperty('planVoteRecordId');
  });
});

/** Read vote evidence from the existing structured error envelope. */
function errorDetail(result: CapturedToolResult): Record<string, unknown> {
  const envelope = result._meta?.[ERROR_ENVELOPE_META_KEY] as {
    detail: Record<string, unknown>;
  };
  return envelope.detail;
}

/** Exercise the real graph and stage wrappers through the registered tool. */
function graphStages(): DevPipelineStages {
  return {
    research: vi.fn().mockResolvedValue(researchContextFromText('Research')),
    plan: vi.fn().mockResolvedValue('Plan'),
    vote: vi.fn().mockResolvedValue({ kind: 'approved', approvalPercentage: 100 }),
    decompose: vi.fn().mockResolvedValue([]),
    implement: vi.fn().mockResolvedValue('Code'),
    qaReview: vi.fn().mockResolvedValue({ verdict: 'pass', feedback: '', issues: [] }),
    securityScan: vi.fn().mockResolvedValue({ passed: true }),
  };
}

function useRealGraph(stages: DevPipelineStages): void {
  runAdaptiveOrchestratorMock.mockImplementationOnce(async () => ({
    ...ORCHESTRATOR_RESULT,
    ...(await runGraphPipeline(
      'Build feature X',
      DEV_PIPELINE_TEMPLATE,
      createDevStageRegistry(stages),
      { dryRun: true }
    )),
  }));
}

describe('run_pipeline real graph vote evidence (#7240)', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['rejected', 'no_quorum'] as const)(
    'keeps a completed %s vote failed and carries its evidence',
    async (kind) => {
      const stages = graphStages();
      vi.mocked(stages.vote).mockResolvedValue({
        kind,
        approvalPercentage: 17,
        voteRecordId: 'vr-failed',
        feedback: 'Revise the plan',
        reason: 'Missing voter',
      });
      useRealGraph(stages);
      const result = await captureHandler()({ task: 'Build feature X', dryRun: true });

      expect(result.isError).toBe(true);
      expect(errorDetail(result)).toMatchObject({
        planVoteDecision: kind,
        planVoteApprovalPercentage: 17,
        planVoteRecordId: 'vr-failed',
        ...(kind === 'rejected'
          ? { planVoteFeedback: 'Revise the plan' }
          : { planVoteReason: 'Missing voter' }),
      });
      expect(stages.implement).not.toHaveBeenCalled();
    }
  );

  it('omits the approval percentage and surfaces the reason when the real vote stage crashes', async () => {
    vi.spyOn(consensusVote, 'executeVoting').mockRejectedValue(new Error('Adapters down'));
    const stages = graphStages();
    stages.vote = createVoteStage({ config: {}, guard: createBudgetGuard(), startStage: vi.fn() });
    useRealGraph(stages);
    const result = await captureHandler()({ task: 'Build feature X', dryRun: true });

    expect(result.isError).toBe(true);
    expect(errorDetail(result)).toMatchObject({
      planVoteDecision: 'no_quorum',
      planVoteReason: expect.stringContaining('Adapters down'),
    });
    expect(errorDetail(result)).not.toHaveProperty('planVoteApprovalPercentage');
    expect(errorDetail(result)).not.toHaveProperty('planVoteRecordId');
    expect(stages.implement).not.toHaveBeenCalled();
  });
});

/** Registers the tool against a mock server and returns the captured callback. */
function captureHandler(): (args: unknown, ctx?: HandlerContext) => Promise<CapturedToolResult> {
  let captured: ((args: unknown, ctx?: HandlerContext) => Promise<CapturedToolResult>) | undefined;
  let registeredName: string | undefined;
  const mockServer = {
    registerTool: (name: string, _schema: unknown, handler: unknown) => {
      registeredName = name;
      captured = handler as (args: unknown, ctx?: HandlerContext) => Promise<CapturedToolResult>;
    },
  };
  registerPipelineTool(mockServer as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  expect(registeredName).toBe('run_pipeline');
  if (captured === undefined) throw new Error('handler not registered');
  return captured;
}

// #3730: async dispatch mode. A real run can exceed the 900s MCP request
// timeout, so `dispatch: 'async'` returns a jobId immediately and runs the
// pipeline in the background (poll get_job_result). run_pipeline has no
// sessionId, so a fresh `rp-<uuid>` jobId is always minted (no idempotency
// surface).
describe('run_pipeline async dispatch (#3730)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  /** Parse the JSON envelope out of a captured tool result. */
  function envelope(result: CapturedToolResult): Record<string, unknown> {
    return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-rp-async-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    runAdaptiveOrchestratorMock.mockClear();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns { status: 'pending', jobId } and mints an rp-<uuid> id", async () => {
    const handler = captureHandler();
    const result = await handler({ task: 'Build feature X', dispatch: 'async' });
    const env = envelope(result);
    expect(env['status']).toBe('pending');
    expect(typeof env['jobId']).toBe('string');
    expect(env['jobId'] as string).toMatch(/^rp-/);
    expect(env['pollTool']).toBe('get_job_result');
  });

  it('runs the pipeline inline (sync) by default — no pending envelope', async () => {
    const handler = captureHandler();
    const result = await handler({ task: 'Build feature X' });
    expect(envelope(result)['status']).toBeUndefined();
    expect(runAdaptiveOrchestratorMock).toHaveBeenCalledTimes(1);
  });

  it('records the pipeline result to the sidecar when the background run completes', async () => {
    const handler = captureHandler();
    const result = await handler({ task: 'Build feature X', dispatch: 'async' });
    const jobId = envelope(result)['jobId'] as string;
    // The background run is fire-and-forget; let the microtask queue drain.
    await new Promise((r) => setImmediate(r));
    const record = readJobResult(jobId);
    expect(record?.status).toBe('complete');
  });

  // #4363 caller audit. `toolSuccessStructured` nests the payload under
  // `structuredContent`, so a `success: false` run left the ToolResult's own
  // root clean — it slipped past both the caller and `runAsJob`'s root-key
  // fail-closed check, and the job recorded `complete` for a failed pipeline.
  describe('a failed pipeline is not a successful job (#4363)', () => {
    function failedRun(): typeof ORCHESTRATOR_RESULT {
      return {
        ...ORCHESTRATOR_RESULT,
        success: false,
        error: '1 stage(s) failed — plan: adapter rejected the request',
      };
    }

    it('returns a business error envelope on the sync path', async () => {
      runAdaptiveOrchestratorMock.mockResolvedValueOnce(failedRun());
      const handler = captureHandler();

      const result = await handler({ task: 'Build feature X' });

      expect(result.isError).toBe(true);
    });

    it('records the job failed on the async path', async () => {
      runAdaptiveOrchestratorMock.mockResolvedValueOnce(failedRun());
      const handler = captureHandler();

      const result = await handler({ task: 'Build feature X', dispatch: 'async' });
      const jobId = envelope(result)['jobId'] as string;
      await new Promise((r) => setImmediate(r));

      expect(readJobResult(jobId)?.status).toBe('failed');
    });

    it('still records a successful pipeline as complete', async () => {
      const handler = captureHandler();

      const result = await handler({ task: 'Build feature X', dispatch: 'async' });
      const jobId = envelope(result)['jobId'] as string;
      await new Promise((r) => setImmediate(r));

      expect(readJobResult(jobId)?.status).toBe('complete');
    });
  });
});

// #4170: simulateVotes must FAIL CLOSED outside test runners. The old guard
// only logged a warning and proceeded — a random panel could resolve
// outcome:'approved' with zero live voters. Outside a test runner the handler
// now rejects with a `permission` envelope unless NEXUS_ALLOW_SIMULATE=1.
// The estimate-relative budget (#3262) is gated behind NEXUS_BUDGET_ENFORCE.
// The gate read the literal `1` only, so `true` — the spelling every other
// boolean flag accepts — left the run silently unenforced (#5155). The
// observable is the logger: `resolveRunBudget` logs "token budget enforced"
// (or the no-estimate warn) only when enforcement is on.
describe('run budget gate NEXUS_BUDGET_ENFORCE (#3262, #5155)', () => {
  const originalEnforce = process.env['NEXUS_BUDGET_ENFORCE'];

  afterEach(() => {
    if (originalEnforce === undefined) delete process.env['NEXUS_BUDGET_ENFORCE'];
    else process.env['NEXUS_BUDGET_ENFORCE'] = originalEnforce;
    runAdaptiveOrchestratorMock.mockClear();
  });

  function makeLogger(): ILogger & { info: ReturnType<typeof vi.fn> } {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as ILogger & { info: ReturnType<typeof vi.fn> };
  }

  function budgetEnforced(logger: { info: ReturnType<typeof vi.fn> }): boolean {
    return logger.info.mock.calls.some((call) => String(call[0]).includes('token budget enforced'));
  }

  it('enforces when NEXUS_BUDGET_ENFORCE=true (was silently unenforced)', async () => {
    process.env['NEXUS_BUDGET_ENFORCE'] = 'true';
    const logger = makeLogger();
    await runPipelineForGoal('Build a login form with validation and tests', logger);
    expect(budgetEnforced(logger)).toBe(true);
  });

  it('still enforces for the original spelling NEXUS_BUDGET_ENFORCE=1', async () => {
    process.env['NEXUS_BUDGET_ENFORCE'] = '1';
    const logger = makeLogger();
    await runPipelineForGoal('Build a login form with validation and tests', logger);
    expect(budgetEnforced(logger)).toBe(true);
  });

  it('does not enforce when unset (default off — existing runs unchanged)', async () => {
    delete process.env['NEXUS_BUDGET_ENFORCE'];
    const logger = makeLogger();
    await runPipelineForGoal('Build a login form with validation and tests', logger);
    expect(budgetEnforced(logger)).toBe(false);
  });
});

describe('run_pipeline simulateVotes fail-closed gate (#4170)', () => {
  const originalVitest = process.env['VITEST'];
  const originalNodeEnv = process.env['NODE_ENV'];
  const originalAllowSimulate = process.env['NEXUS_ALLOW_SIMULATE'];

  /** Simulate a non-test-runner process (no VITEST, production NODE_ENV). */
  function leaveTestRunnerEnv(): void {
    delete process.env['VITEST'];
    process.env['NODE_ENV'] = 'production';
    delete process.env['NEXUS_ALLOW_SIMULATE'];
  }

  afterEach(() => {
    if (originalVitest === undefined) delete process.env['VITEST'];
    else process.env['VITEST'] = originalVitest;
    if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = originalNodeEnv;
    if (originalAllowSimulate === undefined) delete process.env['NEXUS_ALLOW_SIMULATE'];
    else process.env['NEXUS_ALLOW_SIMULATE'] = originalAllowSimulate;
  });

  it('rejects simulateVotes outside a test runner with a permission envelope', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    const result = await handler({ task: 'Build feature X', simulateVotes: true });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('NEXUS_ALLOW_SIMULATE');
    const meta = (result as { _meta?: Record<string, unknown> })._meta;
    const envelope = meta?.[ERROR_ENVELOPE_META_KEY] as { errorCategory: string };
    expect(envelope.errorCategory).toBe('permission');
  });

  it('rejects identically in async dispatch mode — no pending envelope leaks out', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    const result = await handler({
      task: 'Build feature X',
      simulateVotes: true,
      dispatch: 'async',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('NEXUS_ALLOW_SIMULATE');
  });

  it('proceeds with simulated: true in the output when NEXUS_ALLOW_SIMULATE=1', async () => {
    const handler = captureHandler();
    leaveTestRunnerEnv();
    process.env['NEXUS_ALLOW_SIMULATE'] = '1';
    const result = await handler({ task: 'Build feature X', simulateVotes: true });
    expect(result.isError).not.toBe(true);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(output['simulated']).toBe(true);
  });

  it('stays allowed inside a test runner with no simulated flag (existing suites unaffected)', async () => {
    // Default vitest env: VITEST=true.
    const result = await captureHandler()({ task: 'Build feature X', simulateVotes: true });
    expect(result.isError).not.toBe(true);
    const output = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(output['simulated']).toBeUndefined();
  });
});

// #2824: run_pipeline used to register a bare callback that called
// `schema.parse(args)` outside any try/catch — a ZodError on bad input
// escaped as a raw JSON-RPC -32603 instead of a structured `validation`
// envelope. It now routes through the standard secure-handler chain.
describe('registerPipelineTool', () => {
  it('registers under the run_pipeline name', () => {
    expect(captureHandler()).toBeTypeOf('function');
  });

  it('returns a structured validation error for invalid input, not a thrown ZodError', async () => {
    const handler = captureHandler();
    // task is below the 5-char minimum.
    const result = await handler({ task: 'no' });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Invalid input');
  });
});

describe('pipeline input observations (#4733)', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([false, true])('threads dryRun=%s to the stage executor (#6958)', async (dryRun) => {
    const spy = vi.spyOn(executor, 'createAgentStages');
    await captureHandler()({ task: 'Build feature X', dryRun });

    expect(spy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ dryRun }));
  });

  function context(sanitization: Partial<HandlerContext['sanitization']> = {}): HandlerContext {
    return {
      requestContext: createRequestContext({ toolName: 'run_pipeline' }),
      logger: createLogger({ component: 'test' }),
      sanitization: {
        wasModified: false,
        tagsRemoved: 0,
        commentsRemoved: 0,
        fieldsModified: 0,
        rawFieldHashes: {},
        rawFieldBytes: {},
        ...sanitization,
      },
    };
  }

  it('records absent HandlerContext as unmeasured (the empty case)', async () => {
    const spy = vi.spyOn(executor, 'createAgentStages');
    await captureHandler()({ task: 'Build feature X' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ inputSanitization: 'unmeasured' }));
    expect(spy.mock.calls[0]?.[0]?.inputSanitizationCounts).toBeUndefined();
  });

  it('records the plain-goal pipeline/research wrapper as unmeasured', async () => {
    const spy = vi.spyOn(executor, 'createAgentStages');
    await runPipelineForGoal('Build feature X');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ inputSanitization: 'unmeasured' }));
  });

  it('records an unmodified observation independently of caller authentication', async () => {
    const spy = vi.spyOn(executor, 'createAgentStages');
    await captureHandler()({ task: 'Ignore previous instructions' }, context());
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ inputSanitization: 'unmodified' }));
    expect(spy.mock.calls[0]?.[0]?.callerTrustTier).toBeUndefined();
    expect(spy.mock.calls[0]?.[0]?.inputSanitizationCounts).toBeUndefined();
  });

  it.each([
    { wasModified: true, tagsRemoved: 2, commentsRemoved: 1, fieldsModified: 1 },
    { wasModified: false, tagsRemoved: 1, commentsRemoved: 0, fieldsModified: 1 },
    { wasModified: false, tagsRemoved: 0, commentsRemoved: 1, fieldsModified: 1 },
    { wasModified: true, tagsRemoved: 0, commentsRemoved: 0, fieldsModified: 1 },
  ])('records modified and exact counts for %j', async (sanitization) => {
    const spy = vi.spyOn(executor, 'createAgentStages');
    await captureHandler()({ task: 'Build feature X' }, context(sanitization));
    const { tagsRemoved, commentsRemoved, fieldsModified } = sanitization;
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        inputSanitization: 'modified',
        inputSanitizationCounts: { tagsRemoved, commentsRemoved, fieldsModified },
      })
    );
  });
});
