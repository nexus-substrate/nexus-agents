/** Real worker composition and CLI bridge, with only the CLI process mocked (#7413). */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { executeWorkerDispatch, type WorkerDispatchResult } from './orchestrate-dispatch.js';
import { CliToModelAdapter } from '../../cli-adapters/cli-to-model-adapter.js';
import { ResilientAdapter } from '../../adapters/resilient-adapter.js';
import { getDefaultRegistry } from '../../config/model-registry.js';
import { assembleOrchestrateOutput } from './orchestrate.js';
import { registerGetJobResultTool } from './get-job-result-tool.js';
import { runJobInBackground } from '../jobs/run-as-job.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { initTaskState, appendResult } from '../../context/structured-task-state.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import type { ToolResult } from './tool-result.js';
import type { CliTask, ICliAdapter } from '../../cli-adapters/types.js';
import type { AgentPlan, AgentPlanEntry } from '../../orchestration/aorchestra/index.js';
import { createLogger, ok, type IModelAdapter } from '../../core/index.js';
import {
  buildTaskContextBlock,
  sanitizeTaskContext,
} from '../../agents/experts/expert-prompts/prompt-composer.js';

vi.mock('../../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));
vi.mock('./create-expert-routing.js', async (original) => ({
  ...(await original<typeof import('./create-expert-routing.js')>()),
  getExpertFallbackChain: vi.fn(() => []),
}));
const lazy = vi.hoisted<{ adapter: IModelAdapter | undefined }>(() => ({ adapter: undefined }));
vi.mock('../../adapters/auto-adapter.js', () => ({
  createAutoAdapter: () => {
    if (lazy.adapter === undefined)
      return Promise.reject(new Error('Fixture detection unavailable'));
    return Promise.resolve({
      adapter: lazy.adapter,
      source: 'cli',
      name: 'claude',
      reason: 'Fixture',
    });
  },
}));
vi.mock('../../adapters/gateway-rediscovery.js', () => ({
  ensureGatewayDiscovered: () => Promise.resolve(),
  gatewayDiscoveryGeneration: () => 0,
}));

const logger = createLogger({ component: 'inline-delivery-test' });
const SUBTASK = 'Verify the complete inline artifact; reject a missing acceptance condition.';
const TAIL = 'FINAL ACCEPTANCE: failing security gates must prevent release.';
const INLINE_TASK = `Review this supplied artifact. ${'bounded content '.repeat(80)}${TAIL}`;
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

function makePlan(subTasks = [SUBTASK]): AgentPlan {
  const entries: AgentPlanEntry[] = subTasks.map((subTask, index) => ({
    role: 'code',
    subTask,
    priority: index + 1,
    reasoning: 'Review',
    wave: 1,
  }));
  return {
    entries,
    totalExperts: entries.length,
    taskType: 'code_implementation',
    complexity: 'moderate',
    reasoning: 'Inline review',
    suggestedWaveSize: 3,
  };
}

function cliBoundary(
  modelId = 'claude-sonnet',
  supported = true,
  cliName = 'claude'
): {
  adapter: CliToModelAdapter;
  requests: CliTask[];
} {
  const requests: CliTask[] = [];
  const cli = {
    name: cliName,
    transport: 'stdio',
    enforcesReadOnlyAnalysis: supported,
    capabilities: { reasoning: 9, contextWindow: 200_000, codeGeneration: 9, speed: 7, cost: 5 },
    getModelInfo: () => ({ id: modelId, name: modelId }),
    execute: vi.fn((task: CliTask) => {
      requests.push(task);
      return Promise.resolve(ok({ text: 'Review of delivered material', model: modelId }));
    }),
  } as unknown as ICliAdapter;
  return { adapter: new CliToModelAdapter(cli), requests };
}

async function dispatch(
  task: string,
  subTasks = [SUBTASK],
  modelId = 'claude-sonnet'
): Promise<{
  adapter: CliToModelAdapter;
  requests: CliTask[];
  result: WorkerDispatchResult;
}> {
  const boundary = cliBoundary(modelId);
  const result = await executeWorkerDispatch({
    agentPlan: makePlan(subTasks),
    taskDescription: task,
    modelAdapter: boundary.adapter,
    logger,
    maxWorkerCalls: 2,
  });
  return { ...boundary, result };
}

async function pollInlineJob(jobId: string): Promise<{
  record: { status: string; result: ToolResult };
  producerVersionSource: string;
}> {
  let handler: ((args: unknown) => Promise<ToolResult>) | undefined;
  registerGetJobResultTool(
    {
      registerTool: (
        _name: string,
        _config: unknown,
        callback: (args: unknown) => Promise<ToolResult>
      ): void => {
        handler = callback;
      },
    } as never,
    { rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100 }) }
  );
  if (handler === undefined) throw new Error('missing registered job reader');
  const response = await handler({ jobId });
  return JSON.parse(response.content[0]?.text ?? '{}') as {
    record: { status: string; result: ToolResult };
    producerVersionSource: string;
  };
}

async function persistInlineResult(jobId: string, result: WorkerDispatchResult): Promise<void> {
  await runJobInBackground(jobId, {
    toolName: 'orchestrate',
    input: {},
    freshJobId: () => jobId,
    run: () => {
      const response = assembleOrchestrateOutput({ taskId: jobId }, makePlan(), result);
      // The same canonical task-state mirror used by runOrchestratePipelineAsJob.
      initTaskState({
        taskId: jobId,
        stage: 'complete',
        decisions: [],
        blockers: [],
        position: { currentStep: 'complete' },
        updatedAt: new Date().toISOString(),
      });
      appendResult(jobId, response, new Date().toISOString());
      return Promise.resolve(response);
    },
  });
}

function assertInlinePollEvidence(
  response: Awaited<ReturnType<typeof pollInlineJob>>,
  source: string,
  original: WorkerDispatchResult
): void {
  expect(response.record.status).toBe('complete');
  expect(response.producerVersionSource).toBe(source);
  const body = JSON.parse(response.record.result.content[0]?.text ?? '{}') as {
    workerDispatch: WorkerDispatchResult;
  };
  const worker = body.workerDispatch.results[0];
  expect(worker?.promptEvidence).toEqual(original.results[0]?.promptEvidence);
  expect(worker?.promptEvidence?.rawInputCoverage).toBe('PARTIAL');
  expect(worker?.promptEvidence?.modelReviewCoverage).toBe('UNMEASURED');
  expect(worker?.output).toContain('PARTIAL');
}

describe('complete inline worker delivery (#7413)', () => {
  it('retains real produced evidence and PARTIAL output through MCP serialization and both durable readers', async () => {
    const owned = mkdtempSync(join(tmpdir(), 'nexus-inline-job-'));
    vi.stubEnv('NEXUS_DATA_DIR', owned);
    vi.stubEnv('NEXUS_TASK_STATE_ENABLED', '1');
    resetNexusDataDirCache();
    try {
      const { result } = await dispatch(`${INLINE_TASK}\n\n<!-- removed bytes -->`);
      const jobId = 'orch-inline-provenance';
      await persistInlineResult(jobId, result);
      expect(readJobResult(jobId)?.status).toBe('complete');
      for (const source of ['sidecar', 'task_state']) {
        vi.stubEnv('NEXUS_JOB_RESULT_SOURCE', source);
        const response = await pollInlineJob(jobId);
        assertInlinePollEvidence(response, source, result);
      }
    } finally {
      vi.unstubAllEnvs();
      resetNexusDataDirCache();
      rmSync(owned, { recursive: true, force: true });
    }
  });
  it('delivers the accepted tail and required subtask through the real CLI bridge', async () => {
    const { requests, result } = await dispatch(INLINE_TASK);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.content).toContain(TAIL);
    expect(requests[0]?.content).toContain(`Sub-task: ${SUBTASK}`);
    expect(requests[0]?.accessMode).toBe('read-only-analysis');
    expect(requests[0]?.content).toContain('Only permitted tools, if available: Read, Grep, Glob.');
    expect(result.results[0]).toMatchObject({
      promptEvidence: {
        task: { rawSha256: digest(INLINE_TASK), sanitizedSha256: digest(INLINE_TASK) },
        rawInputCoverage: 'DELIVERED',
        modelReviewCoverage: 'UNMEASURED',
      },
    });
  });

  it('records transformed raw input as partial rather than complete raw-code QA', async () => {
    const raw = `${INLINE_TASK}\n\n<!-- omitted raw code -->`;
    const { requests, result } = await dispatch(raw);
    expect(requests[0]?.content).toContain(sanitizeTaskContext(raw));
    expect(requests[0]?.content).not.toContain('omitted raw code');
    expect(result.results[0]).toMatchObject({
      promptEvidence: {
        task: {
          rawChars: raw.length,
          rawBytes: Buffer.byteLength(raw),
          rawSha256: digest(raw),
          sanitizedChars: sanitizeTaskContext(raw).length,
          sanitizedSha256: digest(sanitizeTaskContext(raw)),
          transformed: true,
        },
        rawInputCoverage: 'PARTIAL',
        modelReviewCoverage: 'UNMEASURED',
      },
    });
    expect(result.results[0]?.output).toContain('PARTIAL');
  });

  it.each(['', '   ', '<system>discarded</system>', 'x'.repeat(50_001)])(
    'refuses empty or unsupported required task before any CLI call',
    async (task) => {
      const { requests, result } = await dispatch(task);
      expect(requests).toHaveLength(0);
      expect(result.totalModelCalls).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.results[0]).toMatchObject({
        status: 'error',
        promptEvidence: { rawInputCoverage: 'UNSUPPORTED' },
      });
    }
  );

  it('preflights the whole plan before dispatching an earlier valid worker', async () => {
    const { requests, result } = await dispatch(INLINE_TASK, [SUBTASK, '']);
    expect(requests).toHaveLength(0);
    expect(result.totalModelCalls).toBe(0);
    expect(result.successCount).toBe(0);
  });

  it.each(['\uD800', '\uDC00', '\0'])(
    'rejects non-exact UTF-8 or binary task input before any dispatch',
    async (invalid) => {
      const { requests, result } = await dispatch(`${INLINE_TASK}${invalid}`);
      expect(requests).toHaveLength(0);
      expect(result.totalModelCalls).toBe(0);
      expect(result.results[0]?.promptEvidence?.rawInputCoverage).toBe('UNSUPPORTED');
      if (invalid !== '\0') {
        expect(result.results[0]?.promptEvidence?.task.rawSha256).toBeUndefined();
        expect(result.results[0]?.promptEvidence?.task.rawBytes).toBeUndefined();
      }
    }
  );

  it.each(['\uD800', '\uDC00', '\0'])(
    'rejects non-exact UTF-8 or binary scope before dispatching any worker',
    async (invalid) => {
      const { requests, result } = await dispatch(INLINE_TASK, [SUBTASK, `${SUBTASK}${invalid}`]);
      expect(requests).toHaveLength(0);
      expect(result.totalModelCalls).toBe(0);
      expect(result.unsupportedReason).toContain('unsupported inline delivery');
    }
  );

  it.each([
    { role: 'unknown-role', subTask: SUBTASK },
    { role: 'code', subTask: 12 },
  ])('refuses malformed required worker identity or scope before any call', async (invalid) => {
    const boundary = cliBoundary();
    const agentPlan = makePlan([SUBTASK, SUBTASK]);
    const entries = [...agentPlan.entries];
    entries[1] = { ...entries[1], ...invalid } as AgentPlanEntry;
    const result = await executeWorkerDispatch({
      agentPlan: { ...agentPlan, entries },
      taskDescription: INLINE_TASK,
      modelAdapter: boundary.adapter,
      logger,
    });
    expect(boundary.requests).toHaveLength(0);
    expect(result.totalModelCalls).toBe(0);
    expect(result.unsupportedReason).toContain('unsupported inline delivery');
  });

  it('preserves an exact independently bounded subtask', async () => {
    const subTask = 'scope '.repeat(833) + 'OK';
    expect(subTask.length).toBe(5_000);
    const { requests } = await dispatch(INLINE_TASK, [subTask]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.content).toContain(sanitizeTaskContext(subTask));
  });

  it('refuses expanded input when model context is unknown', async () => {
    const { requests, result } = await dispatch(INLINE_TASK, [SUBTASK], 'unknown');
    expect(requests).toHaveLength(0);
    expect(result.totalModelCalls).toBe(0);
  });

  it('uses a real catalog-backed context window even when merged metadata is named derived', async () => {
    const model = 'amazon-bedrock/anthropic.claude-3-5-haiku-20241022-v1:0';
    const metadata = getDefaultRegistry().getEntry(model);
    expect(metadata.source).toBe('derived');
    expect(metadata.contextWindow).toBe(200_000);
    const { requests, result } = await dispatch(INLINE_TASK, [SUBTASK], model);
    expect(requests).toHaveLength(1);
    expect(result.successCount).toBe(1);
  });

  it('never treats pending-detection as a known model even if a manifest gives it a window', async () => {
    const registry = getDefaultRegistry();
    const known = registry.getEntry('claude-sonnet');
    const spy = vi.spyOn(registry, 'getEntry').mockReturnValue(known);
    try {
      const { requests, result } = await dispatch(INLINE_TASK, [SUBTASK], 'pending-detection');
      expect(requests).toHaveLength(0);
      expect(result.totalModelCalls).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('warms the real lazy proxy without any extra completion before full inline delivery', async () => {
    const boundary = cliBoundary();
    lazy.adapter = boundary.adapter;
    const adapter = new ResilientAdapter({ preferredCli: 'claude' });
    expect(adapter.modelId).toBe('pending-detection');
    const result = await executeWorkerDispatch({
      agentPlan: makePlan(),
      taskDescription: INLINE_TASK,
      modelAdapter: adapter,
      logger,
    });
    expect(adapter.modelId).toBe('claude-sonnet');
    expect(boundary.requests).toHaveLength(1);
    expect(boundary.requests[0]?.content).toContain(TAIL);
    expect(result.totalModelCalls).toBe(1);
  });

  it('refuses a real warmed proxy whose detected model capacity is still unknown', async () => {
    const boundary = cliBoundary('unknown');
    lazy.adapter = boundary.adapter;
    const result = await executeWorkerDispatch({
      agentPlan: makePlan(),
      taskDescription: INLINE_TASK,
      modelAdapter: new ResilientAdapter({ preferredCli: 'claude' }),
      logger,
    });
    expect(boundary.requests).toHaveLength(0);
    expect(result.totalModelCalls).toBe(0);
    expect(result.unsupportedReason).toContain('context window is unknown');
  });

  it('preserves the generic 500-character description cap', () => {
    const context = buildTaskContextBlock({ taskDescription: INLINE_TASK, taskType: 'code' });
    expect(context).toContain(INLINE_TASK.slice(0, 500));
    expect(context).not.toContain(TAIL);
  });

  it('retains the restriction block independently of inline scope delivery', async () => {
    const { requests } = await dispatch(INLINE_TASK);
    const prompt = requests[0]?.content ?? '';
    const restrictions = prompt.match(/## Tool Restrictions[\s\S]*?(?=\n## |$)/)?.[0];
    expect(requests[0]?.accessMode).toBe('read-only-analysis');
    expect(restrictions).toContain('Only permitted tools, if available: Read, Grep, Glob.');
    expect(restrictions).not.toMatch(/\b(?:Edit|Write|Bash)\b/);
  });

  it.each(['x'.repeat(50_000), '😀'.repeat(25_000)])(
    'delivers an exact character-ceiling task without splitting its UTF-8 body',
    async (task) => {
      const { requests, result } = await dispatch(task);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.content).toContain(task);
      expect(result.results[0]).toMatchObject({
        promptEvidence: {
          task: {
            rawChars: 50_000,
            rawBytes: Buffer.byteLength(task),
            rawSha256: digest(task),
            sanitizedSha256: digest(task),
          },
        },
      });
    }
  );

  it('names the empty worker-plan case without inventing successful delivery', async () => {
    const { requests, result } = await dispatch(INLINE_TASK, []);
    expect(requests).toHaveLength(0);
    expect(result.totalModelCalls).toBe(0);
    expect(result.unsupportedReason).toContain('empty worker plan');
  });

  it('rejects a subtask beyond its independent scope bound before any worker call', async () => {
    const { requests, result } = await dispatch(INLINE_TASK, [SUBTASK, 's'.repeat(5_001)]);
    expect(requests).toHaveLength(0);
    expect(result.unsupportedReason).toContain('subtask exceeds 5000');
  });

  it('refuses aggregate prompt context over the byte cap before any worker call', async () => {
    const boundary = cliBoundary();
    const result = await executeWorkerDispatch({
      agentPlan: makePlan(),
      taskDescription: INLINE_TASK,
      modelAdapter: boundary.adapter,
      logger,
      learnings: [{ pattern: '😀'.repeat(60_000), context: 'code', confidence: 1 }],
    });
    expect(boundary.requests).toHaveLength(0);
    expect(result.totalModelCalls).toBe(0);
    expect(result.unsupportedReason).toContain('200000 UTF-8 bytes');
  });

  it.each([NaN, Infinity, 0, -1, 1_000_000])(
    'refuses unknown or overflowing token estimates before any completion',
    async (tokens) => {
      const boundary = cliBoundary();
      vi.spyOn(boundary.adapter, 'countTokens').mockResolvedValue(tokens);
      const result = await executeWorkerDispatch({
        agentPlan: makePlan(),
        taskDescription: INLINE_TASK,
        modelAdapter: boundary.adapter,
        logger,
      });
      expect(boundary.requests).toHaveLength(0);
      expect(result.totalModelCalls).toBe(0);
      expect(result.unsupportedReason).toContain('estimated context budget');
    }
  );

  it('keeps short legacy calls working with an unknown model context', async () => {
    const { requests, result } = await dispatch('Review short input', [SUBTASK], 'unknown');
    expect(requests).toHaveLength(1);
    expect(result.successCount).toBe(1);
  });

  it('still refuses a CLI that cannot enforce the existing read-only mode', async () => {
    const boundary = cliBoundary('claude-sonnet', false);
    const result = await executeWorkerDispatch({
      agentPlan: makePlan(),
      taskDescription: INLINE_TASK,
      modelAdapter: boundary.adapter,
      logger,
    });
    expect(boundary.requests).toHaveLength(0);
    expect(result.successCount).toBe(0);
    expect(result.results[0]?.promptEvidence?.rawInputCoverage).toBe('UNSUPPORTED');
  });

  describe('Codex worker artifact inline delivery (#7413)', () => {
    it('inlines external artifact and sets tool restrictions to no tools for codex worker', async () => {
      const owned = mkdtempSync(join(tmpdir(), 'nexus-codex-artifact-'));
      const artifactPath = join(owned, 'solution.ts');
      writeFileSync(artifactPath, 'export const answer = 42;\n', 'utf-8');
      try {
        const boundary = cliBoundary('o3-mini', true, 'codex');
        const result = await executeWorkerDispatch({
          agentPlan: makePlan(),
          taskDescription: INLINE_TASK,
          modelAdapter: boundary.adapter,
          logger,
          relevantFiles: [artifactPath],
        });
        expect(result.successCount).toBe(1);
        expect(boundary.requests).toHaveLength(1);
        const prompt = boundary.requests[0]?.content ?? '';
        expect(prompt).toContain('===== BEGIN ARTIFACT: solution.ts =====');
        expect(prompt).toContain('export const answer = 42;');
        expect(prompt).toContain('No tool calls or shell commands are permitted.');
        expect(prompt).not.toContain('Read, Grep, Glob');
      } finally {
        rmSync(owned, { recursive: true, force: true });
      }
    });

    it('refuses codex dispatch before any call when relevant artifact is missing', async () => {
      const boundary = cliBoundary('o3-mini', true, 'codex');
      const missingPath = join(tmpdir(), 'nexus-nonexistent-artifact-7413.ts');
      const result = await executeWorkerDispatch({
        agentPlan: makePlan(),
        taskDescription: INLINE_TASK,
        modelAdapter: boundary.adapter,
        logger,
        relevantFiles: [missingPath],
      });
      expect(boundary.requests).toHaveLength(0);
      expect(result.totalModelCalls).toBe(0);
      expect(result.unsupportedReason).toContain(
        'unsupported inline delivery: worker transport lacks permitted artifact reader'
      );
    });

    it('preserves Read, Grep, Glob tool restriction for claude worker with relevantFiles', async () => {
      const owned = mkdtempSync(join(tmpdir(), 'nexus-claude-artifact-'));
      const artifactPath = join(owned, 'solution.ts');
      writeFileSync(artifactPath, 'export const answer = 42;\n', 'utf-8');
      try {
        const boundary = cliBoundary('claude-sonnet', true, 'claude');
        const result = await executeWorkerDispatch({
          agentPlan: makePlan(),
          taskDescription: INLINE_TASK,
          modelAdapter: boundary.adapter,
          logger,
          relevantFiles: [artifactPath],
        });
        expect(result.successCount).toBe(1);
        expect(boundary.requests).toHaveLength(1);
        const prompt = boundary.requests[0]?.content ?? '';
        expect(prompt).toContain('Only permitted tools, if available: Read, Grep, Glob.');
      } finally {
        rmSync(owned, { recursive: true, force: true });
      }
    });
  });
});
