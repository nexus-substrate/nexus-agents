import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { parseToolErrorEnvelope } from '../error-envelope.js';
import type { ToolHandler, ToolResult } from './secure-handler.js';

const state = vi.hoisted(() => ({
  version: '1.0.0',
  mtime: 1,
  removed: false,
  source: false,
  read: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('../../version.js', () => ({ VERSION: '1.0.0' }));
vi.mock('node:url', async (original) => {
  const actual = await original<typeof import('node:url')>();
  return {
    ...actual,
    fileURLToPath: (url: string | URL) =>
      String(url).includes('install-state')
        ? state.source
          ? '/install/src/mcp/install-state.ts'
          : '/install/dist/chunk.js'
        : actual.fileURLToPath(url),
  };
});
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    statSync: (path: string) => {
      if (path !== '/install/package.json') return actual.statSync(path);
      if (state.removed) throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      return { mtimeMs: state.mtime };
    },
    readFileSync: (path: string, encoding: 'utf8') => {
      if (path !== '/install/package.json') return actual.readFileSync(path, encoding);
      state.read();
      return JSON.stringify({ name: 'nexus-agents', version: state.version });
    },
  };
});

async function setup(
  error?: Error
): Promise<{ handler: Mock<() => Promise<ToolResult>>; call: ToolHandler }> {
  const { createSecureHandler } = await import('./secure-handler.js');
  const handler = vi.fn(() => {
    if (error) return Promise.reject(error);
    return Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });
  });
  const logger = {
    warn: state.warn,
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return { handler, call: createSecureHandler(handler, { toolName: 'test', logger }) };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.assign(state, { version: '1.0.0', mtime: 1, removed: false, source: false });
});

describe('running install guard (#6959)', () => {
  it('runs unchanged installs and only re-reads when mtime changes', async () => {
    const { call, handler } = await setup();
    await call({});
    await call({});
    expect(handler).toHaveBeenCalledTimes(2);
    expect(state.read).toHaveBeenCalledTimes(1);
    state.mtime++;
    await call({});
    expect(state.read).toHaveBeenCalledTimes(2);
  });

  it('refuses upgraded installs across tools and warns once', async () => {
    const first = await setup();
    await first.call({});
    state.version = '2.0.0';
    state.mtime++;
    const second = await setup();
    const result = await second.call({});
    await first.call({});
    expect(second.handler).not.toHaveBeenCalled();
    expect(first.handler).toHaveBeenCalledTimes(1);
    expect(parseToolErrorEnvelope(result._meta)).toMatchObject({
      errorCategory: 'business',
      isRetryable: false,
      message:
        'nexus-agents was upgraded from 1.0.0 to 2.0.0 while this MCP server was running; restart the MCP server (or your client) to load the new version.',
    });
    expect(state.warn).toHaveBeenCalledTimes(1);
  });

  it('refuses a removed install', async () => {
    const { call, handler } = await setup();
    state.removed = true;
    const result = await call({});
    expect(handler).not.toHaveBeenCalled();
    expect(result.content[0]?.text).toContain('1.0.0 to removed');
    expect(result.isError).toBe(true);
  });

  it('names source execution unmeasured and runs tools, logging once', async () => {
    state.source = true;
    const { call, handler } = await setup();
    await call({});
    await call({});
    expect(handler).toHaveBeenCalledTimes(2);
    expect(state.read).not.toHaveBeenCalled();
    expect(state.warn).toHaveBeenCalledTimes(1);
    expect(state.warn.mock.calls[0]?.[0]).toContain('unmeasured');
  });

  it.each(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'])('maps %s inside own dist', async (code) => {
    const error = Object.assign(
      new Error(
        "Cannot find module '/install/dist/consensus-vote-ABCD.js' imported from /install/dist/cli.js"
      ),
      { code }
    );
    const { call } = await setup(error);
    const result = await call({});
    expect(parseToolErrorEnvelope(result._meta)).toMatchObject({
      errorCategory: 'business',
      isRetryable: false,
    });
    expect(result.content[0]?.text).toContain('restart the MCP server');
  });

  it.each([
    '/other/dist/missing.js',
    '/install/dist-other/missing.js',
    'file://remote/install/dist/missing.js',
    'external-package',
  ])('preserves missing module %s outside own dist', async (path) => {
    const error = Object.assign(
      new Error(`Cannot find module '${path}' imported from /install/dist/cli.js`),
      { code: 'ERR_MODULE_NOT_FOUND' }
    );
    const { call } = await setup(error);
    const result = await call({});
    expect(result.content[0]?.text).toContain(error.message);
    expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('internal');
  });
  it('maps an own-dist file URL and latches the refusal', async () => {
    const error = Object.assign(new Error("Cannot find module 'file:///install/dist/missing.js'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    const { call, handler } = await setup(error);
    expect((await call({})).content[0]?.text).toContain('restart the MCP server');
    await call({});
    expect(handler).toHaveBeenCalledTimes(1);
    expect(state.warn).toHaveBeenCalledTimes(1);
  });

  it('preserves unrelated errors even when they mention own dist', async () => {
    const error = Object.assign(new Error("Cannot find module '/install/dist/missing.js'"), {
      code: 'EACCES',
    });
    const { call } = await setup(error);
    expect((await call({})).content[0]?.text).toContain(error.message);
  });
  it('reports the new version when replacement races with execution', async () => {
    const error = Object.assign(new Error("Cannot find module '/install/dist/missing.js'"), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    const { call, handler } = await setup();
    handler.mockImplementation(() => {
      state.version = '2.0.0';
      state.mtime++;
      return Promise.reject(error);
    });
    expect((await call({})).content[0]?.text).toContain('1.0.0 to 2.0.0');
  });
});
