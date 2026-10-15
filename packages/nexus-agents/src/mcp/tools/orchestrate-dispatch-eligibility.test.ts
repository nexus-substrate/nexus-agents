/** Actual registry, role resolver, bridge and worker dispatcher; controlled native boundary. */
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { executeWorkerDispatch } from './orchestrate-dispatch.js';
import { getGlobalRegistry } from '../../adapters/unified-registry.js';
import { CliToModelAdapter } from '../../cli-adapters/cli-to-model-adapter.js';
import { GeminiCliAdapter } from '../../cli-adapters/adapters/gemini-adapter.js';
import { ClaudeCliAdapter } from '../../cli-adapters/adapters/claude-adapter.js';
import { CodexCliAdapter } from '../../cli-adapters/adapters/codex-adapter.js';
import { UNRESOLVED_MODEL_ID } from '../../config/model-equivalence.js';
import { OpenAIAdapter } from '../../adapters/openai-adapter.js';
import { createGatewaySlotAdapter } from '../../adapters/gateway-family-slots.js';
import { FAKE_OPENAI_KEY } from '../../testing/test-secrets.js';
import { ok, err, ModelError, ErrorCode, createLogger } from '../../core/index.js';
import type { ICliAdapter } from '../../cli-adapters/types.js';
import type { IModelAdapter } from '../../core/index.js';
import type { AgentPlan } from '../../orchestration/aorchestra/index.js';
vi.mock('../../config/learning-persistence.js', () => ({ isPersistenceEnabled: () => false }));
const logger = createLogger({ component: 'worker-eligibility-test' });
const plan: AgentPlan = {
  entries: [
    {
      role: 'research',
      subTask: 'Review source only.',
      priority: 1,
      reasoning: 'Research worker',
      wave: 1,
    },
  ],
  totalExperts: 1,
  taskType: 'general',
  complexity: 'moderate',
  reasoning: 'Single research worker',
  suggestedWaveSize: 1,
};
function fixture(): {
  natives: { gemini: GeminiCliAdapter; claude: ClaudeCliAdapter; codex: CodexCliAdapter };
  adapters: Record<'gemini' | 'claude' | 'codex', CliToModelAdapter>;
  executes: Record<'gemini' | 'claude' | 'codex', MockInstance<ICliAdapter['execute']>>;
  completions: Record<'gemini' | 'claude' | 'codex', MockInstance<IModelAdapter['complete']>>;
} {
  const natives = {
    gemini: new GeminiCliAdapter(),
    claude: new ClaudeCliAdapter(),
    codex: new CodexCliAdapter(),
  };
  const adapters = {
    gemini: new CliToModelAdapter(natives.gemini),
    claude: new CliToModelAdapter(natives.claude),
    codex: new CliToModelAdapter(natives.codex),
  };
  const executes = {
    gemini: vi.spyOn(natives.gemini, 'execute'),
    claude: vi.spyOn(natives.claude, 'execute'),
    codex: vi.spyOn(natives.codex, 'execute'),
  };
  for (const execute of Object.values(executes))
    execute.mockResolvedValue(
      ok({
        text: 'TEST controlled response',
        model: adapters.codex.modelId,
        usage: { inputTokens: 1, outputTokens: 1 },
      })
    );
  const completions = {
    gemini: vi.spyOn(adapters.gemini, 'complete'),
    claude: vi.spyOn(adapters.claude, 'complete'),
    codex: vi.spyOn(adapters.codex, 'complete'),
  };
  const registry = getGlobalRegistry();
  vi.spyOn(registry, 'getAdapterForCli').mockImplementation((cli) => {
    if (!(cli in adapters)) throw new Error('TEST unavailable transport');
    return adapters[cli as keyof typeof adapters] as unknown as ReturnType<
      typeof registry.getAdapterForCli
    >;
  });
  return { natives, adapters, executes, completions };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe('actual worker mode eligibility (#7434)', () => {
  it.each(['claude', 'codex'] as const)(
    'selects compatible %s before unsupported completion with cap one',
    async (cli) => {
      const f = fixture();
      const result = await executeWorkerDispatch({
        agentPlan: plan,
        taskDescription: 'READ-ONLY source review.',
        modelAdapter: f.adapters[cli],
        logger,
        perWorkerRouting: true,
        synthesize: false,
        maxWorkerCalls: 1,
      });
      expect(f.executes.gemini).not.toHaveBeenCalled();
      expect(result.successCount).toBe(1);
      expect(f.completions.gemini).not.toHaveBeenCalled();
      expect(f.completions[cli]).toHaveBeenCalledOnce();
      expect(result.totalModelCalls).toBe(1);
      expect(result.results[0]?.accessMode).toBe('read-only-analysis');
    }
  );
  it('retains read-only enforcement with per-role routing disabled', async () => {
    const f = fixture();
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Review only.',
      modelAdapter: f.adapters.codex,
      logger,
      perWorkerRouting: false,
      synthesize: false,
    });
    expect(result.successCount).toBe(1);
    expect(f.completions.gemini).not.toHaveBeenCalled();
    expect(f.completions.codex).toHaveBeenCalledWith(
      expect.objectContaining({ accessMode: 'read-only-analysis' })
    );
  });
});

describe('mode evidence and late refusal truth', () => {
  it('refuses unknown support with zero completion, without calling it measured false', async () => {
    const f = fixture();
    vi.spyOn(f.adapters.codex, 'supportsAccessMode').mockResolvedValue(undefined);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Review only.',
      modelAdapter: f.adapters.codex,
      logger,
      perWorkerRouting: false,
      synthesize: false,
    });
    expect(result.successCount).toBe(0);
    expect(result.totalModelCalls).toBe(0);
    expect(result.unsupportedReason).toContain('unknown=1');
    expect(result.unsupportedReason).toContain('unsupported=0');
    expect(f.completions.codex).not.toHaveBeenCalled();
  });
  it('permits an actual text-only API behind a Gemini-labelled gateway view', async () => {
    const f = fixture();
    const api = new OpenAIAdapter({ apiKey: FAKE_OPENAI_KEY, modelId: 'gpt-6.1-sol' });
    const complete = vi.spyOn(api, 'complete').mockResolvedValue(
      ok({
        content: [{ type: 'text', text: 'TEST gateway response' }],
        model: api.modelId,
        stopReason: 'end_turn',
      })
    );
    const gateway = createGatewaySlotAdapter('gemini', api);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Review only.',
      modelAdapter: gateway,
      logger,
      perWorkerRouting: true,
      maxWorkerCalls: 1,
      synthesize: false,
    });
    expect(result.successCount).toBe(1);
    expect(result.totalModelCalls).toBe(1);
    expect(f.completions.gemini).not.toHaveBeenCalled();
    expect(f.executes.gemini).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ accessMode: 'read-only-analysis' })
    );
  });
  it('pins compatible transport before expanded-input capacity preflight', async () => {
    const f = fixture();
    const badCount = vi.spyOn(f.adapters.gemini, 'countTokens');
    const goodCount = vi.spyOn(f.adapters.codex, 'countTokens').mockResolvedValue(50);
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'TEST full source '.repeat(80),
      modelAdapter: f.adapters.codex,
      logger,
      perWorkerRouting: true,
      synthesize: false,
    });
    expect(result.successCount).toBe(1);
    expect(badCount).not.toHaveBeenCalled();
    expect(goodCount).toHaveBeenCalledTimes(2);
  });
  it('does not refine a late known unsupported refusal after selection changed', async () => {
    const f = fixture();
    Object.defineProperty(f.natives.codex, 'enforcesReadOnlyAnalysis', {
      value: true,
      writable: true,
    });
    f.completions.codex.mockImplementation((request) => {
      Object.defineProperty(f.natives.codex, 'enforcesReadOnlyAnalysis', { value: false });
      return CliToModelAdapter.prototype.complete.call(f.adapters.codex, request);
    });
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Review only.',
      modelAdapter: f.adapters.codex,
      logger,
      perWorkerRouting: false,
      refine: true,
      synthesize: false,
    });
    expect(result.successCount).toBe(0);
    expect(result.totalModelCalls).toBe(1);
    expect(f.executes.codex).not.toHaveBeenCalled();
    expect(f.completions.codex).toHaveBeenCalledOnce();
    expect(result.refined).toBeUndefined();
    expect(result.results[0]?.resolvedCli).toBeUndefined();
    expect(result.results[0]?.requestedAccessMode).toBe('read-only-analysis');
  });
  it('still refines ordinary validation errors when actual mode remains supported', async () => {
    const f = fixture();
    f.completions.codex.mockResolvedValueOnce(
      err(new ModelError('TEST invalid response', { code: ErrorCode.INVALID_INPUT }))
    );
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Review only.',
      modelAdapter: f.adapters.codex,
      logger,
      perWorkerRouting: false,
      refine: true,
      synthesize: false,
    });
    expect(result.successCount).toBe(1);
    expect(result.totalModelCalls).toBe(2);
    expect(result.refined).toBe(true);
    expect(f.completions.codex).toHaveBeenCalledTimes(2);
  });
});

describe('candidate acquisition and empty evidence', () => {
  it('uses supplied eligible fallback when role-primary acquisition throws', async () => {
    const f = fixture();
    const registry = getGlobalRegistry();
    vi.mocked(registry.getAdapterForCli).mockImplementation((cli) => {
      if (cli === 'gemini') throw new Error('TEST unavailable primary');
      return f.adapters.codex as unknown as ReturnType<typeof registry.getAdapterForCli>;
    });
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Review only.',
      modelAdapter: f.adapters.codex,
      logger,
      perWorkerRouting: true,
      synthesize: false,
    });
    expect(result.successCount).toBe(1);
    expect(f.completions.codex).toHaveBeenCalledOnce();
    expect(f.completions.gemini).not.toHaveBeenCalled();
  });
  it('does not throw or dispatch when selected-adapter identity is unavailable', async () => {
    const f = fixture();
    Object.defineProperty(f.adapters.codex, 'providerId', {
      get() {
        throw new Error('TEST unresolved gateway identity');
      },
    });
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Review only.',
      modelAdapter: f.adapters.codex,
      logger,
      perWorkerRouting: false,
      synthesize: false,
    });
    expect(result.successCount).toBe(0);
    expect(result.totalModelCalls).toBe(0);
    expect(result.unsupportedReason).toContain('unavailable=1');
    expect(f.completions.codex).not.toHaveBeenCalled();
  });
  it('does not repeat an aliased unknown candidate and keeps failure distinct from false', async () => {
    const f = fixture();
    const query = vi
      .spyOn(f.adapters.codex, 'supportsAccessMode')
      .mockRejectedValue(new Error('TEST query unavailable'));
    const result = await executeWorkerDispatch({
      agentPlan: plan,
      taskDescription: 'Review only.',
      modelAdapter: f.adapters.codex,
      logger,
      perWorkerRouting: false,
      synthesize: false,
    });
    expect(result.totalModelCalls).toBe(0);
    expect(query).toHaveBeenCalledOnce();
    expect(result.unsupportedReason).toContain('unknown=1');
    expect(result.unsupportedReason).toContain('unsupported=0');
  });
  it('does not report an empty worker plan as measured success', async () => {
    const f = fixture();
    const result = await executeWorkerDispatch({
      agentPlan: { ...plan, entries: [], totalExperts: 0 },
      taskDescription: 'Review only.',
      modelAdapter: f.adapters.codex,
      logger,
      synthesize: false,
    });
    expect(result.totalModelCalls).toBe(0);
    expect(result.successCount).toBe(0);
    expect(result.unsupportedReason).toContain('empty worker plan');
  });
});

it('warms actual alternative metadata before expanded context preflight', async () => {
  const f = fixture();
  let initialized = false;
  Object.defineProperty(f.adapters.claude, 'modelId', {
    get: () => (initialized ? 'claude-sonnet' : UNRESOLVED_MODEL_ID),
  });
  const count = vi.spyOn(f.adapters.claude, 'countTokens').mockImplementation((text) => {
    if (text === '') initialized = true;
    return Promise.resolve(50);
  });
  f.completions.codex.mockResolvedValueOnce(err(new ModelError('TEST rate limit')));
  const result = await executeWorkerDispatch({
    agentPlan: plan,
    taskDescription: 'TEST complete source '.repeat(80),
    modelAdapter: f.adapters.codex,
    logger,
    perWorkerRouting: false,
    synthesize: false,
  });
  expect(result.successCount).toBe(1);
  expect(result.totalModelCalls).toBe(2);
  expect(count).toHaveBeenCalledWith('');
  expect(f.completions.claude).toHaveBeenCalledOnce();
  expect(f.completions.gemini).not.toHaveBeenCalled();
});

it('does not select a disabled native-only slot even when its declaration supports the mode', async () => {
  const f = fixture();
  vi.stubEnv('NEXUS_DISABLED_CLIS', 'codex');
  const query = vi.spyOn(f.adapters.codex, 'supportsAccessMode');
  const result = await executeWorkerDispatch({
    agentPlan: plan,
    taskDescription: 'Review only.',
    modelAdapter: f.adapters.codex,
    logger,
    perWorkerRouting: true,
    synthesize: false,
  });
  expect(result.successCount).toBe(1);
  expect(f.completions.claude).toHaveBeenCalledOnce();
  expect(query).not.toHaveBeenCalled();
  expect(f.completions.codex).not.toHaveBeenCalled();
});

it('keeps failed alternative metadata preflight UNSUPPORTED with zero alternative completion', async () => {
  const f = fixture();
  Object.defineProperty(f.adapters.claude, 'modelId', { value: UNRESOLVED_MODEL_ID });
  vi.spyOn(f.adapters.claude, 'countTokens').mockRejectedValue(
    new Error('TEST unknown alternative metadata')
  );
  f.completions.codex.mockResolvedValueOnce(err(new ModelError('TEST rate limit')));
  const result = await executeWorkerDispatch({
    agentPlan: plan,
    taskDescription: 'TEST complete source '.repeat(80),
    modelAdapter: f.adapters.codex,
    logger,
    perWorkerRouting: false,
    synthesize: false,
  });
  expect(result.totalModelCalls).toBe(1);
  expect(f.completions.claude).not.toHaveBeenCalled();
  expect(result.results[0]?.promptEvidence?.rawInputCoverage).toBe('UNSUPPORTED');
});

it('reports excluded disabled choices without inventing measured non-support', async () => {
  const f = fixture();
  vi.stubEnv('NEXUS_DISABLED_CLIS', 'claude,codex,gemini,opencode');
  const result = await executeWorkerDispatch({
    agentPlan: plan,
    taskDescription: 'Review only.',
    modelAdapter: f.adapters.codex,
    logger,
    perWorkerRouting: true,
    synthesize: false,
  });
  expect(result.totalModelCalls).toBe(0);
  expect(result.successCount).toBe(0);
  expect(result.unsupportedReason).toContain('excluded=2');
  expect(result.unsupportedReason).toContain('unsupported=0');
  expect(f.completions.codex).not.toHaveBeenCalled();
  expect(f.completions.gemini).not.toHaveBeenCalled();
});
