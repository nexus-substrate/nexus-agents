/**
 * Tests for tryWireGatewayAdapter (#2502, child 2 of epic #2500).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok, err, ConfigError, type IModelAdapter, type ILogger } from './core/index.js';

const buildOpenAICompatAdaptersMock = vi.fn();
const readOpenAICompatEnvMock = vi.fn();

vi.mock('./adapters/openai-compat-adapter.js', () => ({
  buildOpenAICompatAdapters: (...args: unknown[]) =>
    buildOpenAICompatAdaptersMock(...args) as unknown,
  readOpenAICompatEnv: (...args: unknown[]) => readOpenAICompatEnvMock(...args) as unknown,
}));

import {
  tryWireGatewayAdapter,
  tryWireGatewayAdapters,
  resolveDefaultModelAdapter,
  _resetCliSubprocessFallbackNotice,
} from './cli-server-gateway.js';

function makeMockAdapter(modelId: string): IModelAdapter {
  return {
    providerId: 'openai-compat',
    modelId,
    capabilities: [],
    complete: () =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'EXECUTION_ERROR' as const, message: 'mock' },
      } as never),
    stream: (() => (async function* () {})()) as never,
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ({ ok: true as const, value: undefined }),
  };
}

type MockLogger = ILogger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
};

function makeMockLogger(): MockLogger {
  const logger: MockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
    getLevel: vi.fn(),
    setFormat: vi.fn(),
    setDestination: vi.fn(),
    child: vi.fn(),
  } as unknown as MockLogger;
  (logger.child as unknown as ReturnType<typeof vi.fn>).mockReturnValue(logger);
  return logger;
}

describe('tryWireGatewayAdapter', () => {
  let savedSandbox: string | undefined;
  let savedExit: typeof process.exit;

  beforeEach(() => {
    savedSandbox = process.env['NEXUS_SANDBOX'];
    delete process.env['NEXUS_SANDBOX'];
    buildOpenAICompatAdaptersMock.mockReset();
    readOpenAICompatEnvMock.mockReset();
    savedExit = process.exit;
    process.exit = vi.fn((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    if (savedSandbox === undefined) delete process.env['NEXUS_SANDBOX'];
    else process.env['NEXUS_SANDBOX'] = savedSandbox;
    process.exit = savedExit;
  });

  describe('non-sandbox mode', () => {
    it('returns undefined when env vars unset', async () => {
      readOpenAICompatEnvMock.mockReturnValue(null);
      const result = await tryWireGatewayAdapter(makeMockLogger());
      expect(result).toBeUndefined();
      expect(buildOpenAICompatAdaptersMock).not.toHaveBeenCalled();
    });

    it('returns undefined + warns when probe fails', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      buildOpenAICompatAdaptersMock.mockResolvedValue(err(new ConfigError('ENOTFOUND')));
      const logger = makeMockLogger();
      const result = await tryWireGatewayAdapter(logger);
      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('probe failed'),
        expect.objectContaining({ error: expect.stringContaining('ENOTFOUND') as unknown })
      );
    });

    it('returns first adapter when probe succeeds', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      const adapters = [makeMockAdapter('claude-sonnet-4-6'), makeMockAdapter('gpt-5-nano')];
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
      const logger = makeMockLogger();
      const result = await tryWireGatewayAdapter(logger);
      expect(result).toBe(adapters[0]);
      expect(logger.info).toHaveBeenCalledWith(
        'OpenAI-compatible gateway wired',
        expect.objectContaining({
          baseUrl: 'https://gateway.example/v1',
          modelCount: 2,
        })
      );
    });

    it('returns undefined when gateway returns 0 models (without exiting)', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok([]));
      const logger = makeMockLogger();
      const result = await tryWireGatewayAdapter(logger);
      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('0 models'));
    });
  });

  describe('sandbox mode', () => {
    beforeEach(() => {
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
    });

    it('exits when env vars unset', async () => {
      readOpenAICompatEnvMock.mockReturnValue(null);
      const logger = makeMockLogger();
      await expect(tryWireGatewayAdapter(logger)).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Sandbox mode active but NEXUS_OPENAI_COMPAT_URL'),
        expect.any(Error)
      );
    });

    it('exits when probe fails', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      buildOpenAICompatAdaptersMock.mockResolvedValue(err(new ConfigError('ECONNREFUSED')));
      const logger = makeMockLogger();
      await expect(tryWireGatewayAdapter(logger)).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Sandbox mode active and OpenAI-compatible gateway probe failed'),
        expect.any(Error)
      );
    });

    it('exits when gateway returns 0 models', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok([]));
      const logger = makeMockLogger();
      await expect(tryWireGatewayAdapter(logger)).rejects.toThrow('process.exit');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('returns first adapter when probe succeeds', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-test',
      });
      const adapters = [makeMockAdapter('m1'), makeMockAdapter('m2')];
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
      const result = await tryWireGatewayAdapter(makeMockLogger());
      expect(result).toBe(adapters[0]);
      expect(process.exit).not.toHaveBeenCalled();
    });

    it('does not log the API key when wiring succeeds', async () => {
      readOpenAICompatEnvMock.mockReturnValue({
        baseUrl: 'https://gateway.example/v1',
        apiKey: 'sk-secret-key-should-not-leak',
      });
      const adapters = [makeMockAdapter('m1')];
      buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
      const logger = makeMockLogger();
      await tryWireGatewayAdapter(logger);
      const allLogCalls = [
        ...logger.info.mock.calls,
        ...logger.warn.mock.calls,
        ...logger.error.mock.calls,
        ...logger.debug.mock.calls,
      ];
      const flat = JSON.stringify(allLogCalls);
      expect(flat).not.toContain('sk-secret-key-should-not-leak');
    });
  });
});

describe('tryWireGatewayAdapters (#4040 — full list for voter diversity)', () => {
  beforeEach(() => {
    delete process.env['NEXUS_SANDBOX'];
    buildOpenAICompatAdaptersMock.mockReset();
    readOpenAICompatEnvMock.mockReset();
  });

  it('returns ALL discovered adapters (not just the first)', async () => {
    readOpenAICompatEnvMock.mockReturnValue({
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    const adapters = [
      makeMockAdapter('model-a'),
      makeMockAdapter('model-b'),
      makeMockAdapter('model-c'),
    ];
    buildOpenAICompatAdaptersMock.mockResolvedValue(ok(adapters));
    const result = await tryWireGatewayAdapters(makeMockLogger());
    expect(result).toEqual(adapters);
    // The singular wrapper still yields only the first (existing single-adapter consumers).
    expect(await tryWireGatewayAdapter(makeMockLogger())).toBe(adapters[0]);
  });

  it('returns undefined when no gateway is configured', async () => {
    readOpenAICompatEnvMock.mockReturnValue(null);
    expect(await tryWireGatewayAdapters(makeMockLogger())).toBeUndefined();
  });
});

describe('CLI subprocess fallback notice (#4255)', () => {
  beforeEach(() => {
    delete process.env['NEXUS_SANDBOX'];
    buildOpenAICompatAdaptersMock.mockReset();
    readOpenAICompatEnvMock.mockReset();
    _resetCliSubprocessFallbackNotice();
  });

  it('logs once when no gateway env is configured', async () => {
    readOpenAICompatEnvMock.mockReturnValue(null);
    const logger = makeMockLogger();
    await tryWireGatewayAdapters(logger);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('NEXUS_OPENAI_COMPAT_URL') as unknown
    );
  });

  it('does not log when a gateway is configured and wiring succeeds', async () => {
    readOpenAICompatEnvMock.mockReturnValue({
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    buildOpenAICompatAdaptersMock.mockResolvedValue(ok([makeMockAdapter('model-a')]));
    const logger = makeMockLogger();
    await tryWireGatewayAdapters(logger);
    const calls = [...logger.info.mock.calls, ...logger.warn.mock.calls] as unknown[][];
    const flat = JSON.stringify(calls);
    expect(flat).not.toContain('NEXUS_OPENAI_COMPAT_URL');
  });

  it('logs once even when the probe fails or returns 0 models (still no usable gateway)', async () => {
    readOpenAICompatEnvMock.mockReturnValue({
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    buildOpenAICompatAdaptersMock.mockResolvedValue(ok([]));
    const logger = makeMockLogger();
    await tryWireGatewayAdapters(logger);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('NEXUS_OPENAI_COMPAT_URL') as unknown
    );
  });

  it('is emitted only once per process even across repeated calls (once-guard)', async () => {
    readOpenAICompatEnvMock.mockReturnValue(null);
    const loggerA = makeMockLogger();
    const loggerB = makeMockLogger();
    await tryWireGatewayAdapters(loggerA);
    await tryWireGatewayAdapters(loggerB);
    expect(loggerA.info).toHaveBeenCalledTimes(1);
    expect(loggerB.info).not.toHaveBeenCalled();
  });
});

describe('resolveDefaultModelAdapter (#4040)', () => {
  const registryDefault = makeMockAdapter('cli-default');
  const registry = { getDefault: () => registryDefault };

  it('prefers the primary gateway adapter when present', () => {
    const gw = [makeMockAdapter('gw-a'), makeMockAdapter('gw-b')];
    expect(resolveDefaultModelAdapter(gw, registry)).toBe(gw[0]);
  });

  it('falls back to the registry default when no gateway adapters', () => {
    expect(resolveDefaultModelAdapter(undefined, registry)).toBe(registryDefault);
    expect(resolveDefaultModelAdapter([], registry)).toBe(registryDefault);
  });
});
