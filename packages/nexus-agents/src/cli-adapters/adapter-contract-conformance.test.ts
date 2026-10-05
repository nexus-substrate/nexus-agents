/** One contract suite for all in-tree adapter implementations (#7068). */
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IModelAdapter } from '../core/index.js';
import { ok } from '../core/index.js';
import { resolveClassGuardMs } from '../config/timeouts.js';
import type { ICliAdapter } from './types.js';
import { FAKE_ANTHROPIC_KEY } from '../testing/test-secrets.js';

const { execFileFake } = vi.hoisted(() => ({ execFileFake: vi.fn() }));
vi.mock('node:child_process', async (load) => {
  const actual = await load<typeof import('node:child_process')>();
  const { promisify } = await import('node:util');
  const execFile = Object.assign(vi.fn(), { [promisify.custom]: execFileFake });
  return { ...actual, execFile };
});

import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { CodexMcpAdapter } from './adapters/codex-mcp-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import { ModelToCliAdapter, createModelToCliAdapter } from './model-to-cli-adapter.js';

import { buildGatewaySlotRouterArm } from './gateway-slot-arm.js';
import {
  setGatewaySlotCatalog,
  _resetGatewaySlotCatalog,
} from '../adapters/gateway-family-slots.js';

const completion = {
  content: [{ type: 'text' as const, text: 'ok' }],
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  stopReason: 'end_turn' as const,
  model: 'claude-sonnet-4-6',
};
function modelAdapter(): IModelAdapter {
  return {
    providerId: 'anthropic',
    modelId: completion.model,
    capabilities: [],
    complete: vi.fn().mockResolvedValue(ok(completion)),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(1),
    validateConfig: () => ok(undefined),
    listModels: () => Promise.resolve([{ id: completion.model }]),
  };
}
function gatewayArm(model = modelAdapter()): ICliAdapter {
  vi.stubEnv('NEXUS_DISABLED_CLIS', 'claude');
  setGatewaySlotCatalog([model]);
  const arm = buildGatewaySlotRouterArm(
    'claude',
    () => new ClaudeCliAdapter(),
    () => Promise.resolve(false)
  );
  if (arm === undefined || arm === 'unavailable') throw new Error('missing gateway fixture');
  return arm;
}

const cases = [
  { name: 'claude', create: () => new ClaudeCliAdapter() },
  { name: 'codex', create: () => new CodexCliAdapter() },
  { name: 'codex-mcp', create: () => new CodexMcpAdapter() },
  { name: 'agy/gemini', create: () => new GeminiCliAdapter() },
  { name: 'opencode', create: () => new OpenCodeCliAdapter() },
  { name: 'gateway-slot', create: gatewayArm },
  {
    name: 'api:anthropic',
    create: () => createModelToCliAdapter(modelAdapter(), { name: 'claude' }),
  },
];

describe.each(cases)('$name adapter contract', ({ name, create }) => {
  let adapter: ICliAdapter;
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', FAKE_ANTHROPIC_KEY);
    execFileFake
      .mockReset()
      .mockResolvedValue({ stdout: 'Logged in using ChatGPT\n1 credentials', stderr: '' });
    adapter = create();
  });
  afterEach(async () => {
    await adapter.dispose();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    _resetGatewaySlotCatalog();
  });

  it('implements every optional public contract member in-tree', () => {
    for (const member of ['authStatus', 'readiness', 'serves'] as const) {
      expect(adapter[member], member).toBeTypeOf('function');
    }
  });
  it('returns typed auth status without guessing API or agy authentication', async () => {
    const auth = await adapter.authStatus?.();
    expect(['authenticated', 'needs-login', 'not-installed', 'unknown', 'error']).toContain(
      auth?.state
    );
    if (name === 'agy/gemini' || name.startsWith('api:') || name === 'gateway-slot')
      expect(auth?.state).toBe('unknown');
  });
  it('leaves readiness unmeasured by default and delegates live measurement', async () => {
    const execute = vi
      .spyOn(adapter, 'execute')
      .mockResolvedValue(ok({ text: 'ok', durationMs: 0 }));
    expect((await adapter.readiness?.())?.status).toBe('not-attempted');
    expect((await adapter.readiness?.({ live: false }))?.status).toBe('not-attempted');
    expect(execute).not.toHaveBeenCalled();
    expect((await adapter.readiness?.({ live: true, timeoutMs: 100 }))?.status).toBe('verified');
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Reply with the single word: ok', maxTokens: 16 }),
      expect.objectContaining({ allowRetry: false, timeoutMs: 100 })
    );
    execute.mockResolvedValue(ok({ text: '', durationMs: 0 }));
    expect((await adapter.readiness?.({ live: true, timeoutMs: 100 }))?.status).toBe('failed');
    execute.mockImplementation(() => new Promise(() => {}));
    const timedOut = await adapter.readiness?.({ live: true, timeoutMs: 5 });
    expect(timedOut).toMatchObject({ status: 'failed', errorClass: 'timeout' });
  });
  it('clamps live readiness to the interactive operation-class ceiling', async () => {
    const execute = vi
      .spyOn(adapter, 'execute')
      .mockResolvedValue(ok({ text: 'ok', durationMs: 0 }));
    const ceiling = resolveClassGuardMs('interactive');
    await adapter.readiness?.({ live: true, timeoutMs: ceiling * 2 });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: ceiling }),
      expect.objectContaining({ timeoutMs: ceiling, allowRetry: false, maxRetries: 0 })
    );
  });
  it('shares one in-flight completion and permits a new probe after settlement', async () => {
    const execute = vi
      .spyOn(adapter, 'execute')
      .mockResolvedValue(ok({ text: 'ok', durationMs: 0 }));
    const first = adapter.readiness?.({ live: true, timeoutMs: 100 });
    const second = adapter.readiness?.({ live: true, timeoutMs: 100 });
    expect.soft(second).toBe(first);
    expect(await Promise.all([first, second])).toEqual([
      expect.objectContaining({ status: 'verified' }),
      expect.objectContaining({ status: 'verified' }),
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    await adapter.readiness?.({ live: true, timeoutMs: 100 });
    expect(execute).toHaveBeenCalledTimes(2);
  });
  function catalogMock(): MockInstance<NonNullable<ICliAdapter['listModels']>> {
    return name === 'gateway-slot'
      ? vi.spyOn(ModelToCliAdapter.prototype, 'listModels')
      : vi.spyOn(adapter, 'listModels');
  }
  it('returns yes for a listed model and its explicit canonical or registry alias', async () => {
    const isCodex = name.startsWith('codex');
    catalogMock().mockResolvedValue([{ id: isCodex ? 'gpt-6.1-sol' : 'claude-sonnet-4-6' }]);
    expect(await adapter.serves?.(isCodex ? 'gpt-6.1-sol' : 'claude-sonnet-4-6')).toBe('yes');
    expect(
      await adapter.serves?.(isCodex ? 'openai/gpt-6.1-sol' : 'anthropic/claude-sonnet-4-6')
    ).toBe('yes');
  });
  it('names unlisted and empty model ids as unknown', async () => {
    catalogMock().mockResolvedValue([{ id: 'claude-sonnet-4-6' }]);
    expect(await adapter.serves?.('never-listed-test-model')).toBe('unknown');
    expect(await adapter.serves?.('')).toBe('unknown');
  });
  it('names empty and failing catalogs as unknown', async () => {
    const catalog = catalogMock().mockResolvedValue([]);
    expect(await adapter.serves?.('claude-sonnet-4-6')).toBe('unknown');
    catalog.mockRejectedValue(new Error('catalog unavailable'));
    expect(await adapter.serves?.('claude-sonnet-4-6')).toBe('unknown');
  });
  it('applies the Codex registry guard to vendor-only catalog entries', async () => {
    catalogMock().mockResolvedValue([{ id: 'gpt-4o-mini' }]);
    expect(await adapter.serves?.('gpt-4o-mini')).toBe(
      name.startsWith('codex') ? 'unknown' : 'yes'
    );
  });
});

describe('gateway slot catalog contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    _resetGatewaySlotCatalog();
  });

  it('keeps gateway arms out of model enumeration', async () => {
    const arm = gatewayArm();
    expect(arm.listModels).toBeUndefined();
    await arm.dispose();
  });

  it('returns unknown even if a catalog-less target claims support', async () => {
    vi.stubEnv('NEXUS_DISABLED_CLIS', '');
    setGatewaySlotCatalog([modelAdapter()]);
    const cli = new ClaudeCliAdapter();
    Object.defineProperty(cli, 'listModels', { value: undefined });
    vi.spyOn(cli, 'serves').mockResolvedValue('yes');
    const arm = buildGatewaySlotRouterArm(
      'claude',
      () => cli,
      () => Promise.resolve(true)
    );
    if (arm === undefined || arm === 'unavailable') throw new Error('missing gateway fixture');
    expect(await arm.serves?.('claude-sonnet-4-6')).toBe('unknown');
    await arm.dispose();
  });
});

describe.each([
  {
    name: 'API',
    create: (model: IModelAdapter) => createModelToCliAdapter(model, { name: 'claude' }),
  },
  { name: 'gateway', create: gatewayArm },
])('$name live completion contract', ({ create }) => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    _resetGatewaySlotCatalog();
  });

  it('issues no default completion and one completion for concurrent live calls', async () => {
    const model = modelAdapter();
    const adapter = create(model);
    expect((await adapter.readiness?.())?.status).toBe('not-attempted');
    expect((await adapter.readiness?.({ live: false }))?.status).toBe('not-attempted');
    expect(model.complete).not.toHaveBeenCalled();
    const first = adapter.readiness?.({ live: true, timeoutMs: 100 });
    const second = adapter.readiness?.({ live: true, timeoutMs: 100 });
    expect.soft(second).toBe(first);
    expect((await adapter.readiness?.())?.status).toBe('not-attempted');
    expect(await Promise.all([first, second])).toEqual([
      expect.objectContaining({ status: 'verified' }),
      expect.objectContaining({ status: 'verified' }),
    ]);
    expect(model.complete).toHaveBeenCalledTimes(1);
    await adapter.dispose();
  });
});
