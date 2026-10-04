import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { nexusDataPath, _resetActiveWorkspaceRootForTests } from '../../config/nexus-data-dir.js';
import { mkdtempOutsideRepo } from '../../testing/non-repo-temp-dir.js';
import { EventBus } from '../../pipeline/event-bus.js';
import * as roots from '../workspace-roots.js';
import { createToolObservabilityProxy } from './tool-observability-proxy.js';

// Capture only the SDK registration boundary; dispatch uses the production proxy.
type Callback = (args: unknown, extra: unknown) => Promise<unknown>;
const TIMEOUT_MS = roots.WORKSPACE_ROOT_READY_TIMEOUT_MS;

describe('workspace readiness at tool dispatch (#4002)', () => {
  let fixture: string;
  let repo: string;
  let fallbackRepo: string;
  let logger: ILogger;
  let callback: Callback;
  let answer: (value: { roots: Array<{ uri: string }> }) => void;
  let server: McpServer;
  let resolution: Promise<void>;

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = mkdtempOutsideRepo('nexus-root-ready-');
    repo = join(fixture, 'repo');
    fallbackRepo = join(fixture, 'fallback-repo');
    mkdirSync(join(repo, '.git'), { recursive: true });
    mkdirSync(join(fallbackRepo, '.git'), { recursive: true });
    vi.spyOn(process, 'cwd').mockReturnValue(fallbackRepo);
    vi.stubEnv('NEXUS_DATA_DIR', '');
    vi.stubEnv('NEXUS_TMPDIR', join(fixture, 'tmp'));
    vi.stubEnv('NEXUS_SANDBOX', '');
    vi.stubEnv('NEXUS_REPO_PREFERRED', '1');
    vi.stubEnv('NEXUS_GITIGNORE_AUTO', 'false');
    _resetActiveWorkspaceRootForTests();
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: () => logger,
      setLevel: vi.fn(),
    };
    roots.beginWorkspaceRootResolution(logger);
    const response = new Promise<{ roots: Array<{ uri: string }> }>((resolve) => {
      answer = resolve;
    });
    server = {
      server: { getClientCapabilities: () => ({ roots: {} }), listRoots: () => response },
      registerTool: (_name: string, _config: unknown, cb: Callback) => {
        callback = cb;
      },
    } as unknown as McpServer;
    const proxy = createToolObservabilityProxy(server, new EventBus());
    proxy.registerTool('root_write_probe', {}, () => {
      const path = nexusDataPath('sessions', 'probe.txt');
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, 'written');
      return Promise.resolve({ content: [{ type: 'text' as const, text: path }] });
    });
    resolution = roots.resolveWorkspaceRootFromClient(server, logger);
  });

  afterEach(async () => {
    answer({ roots: [] });
    await resolution;
    _resetActiveWorkspaceRootForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(fixture, { recursive: true, force: true });
  });

  it('waits before dispatch then writes under the resolved repo root', async () => {
    const call = callback({}, {});
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(() => readFileSync(join(fallbackRepo, '.nexus-agents/sessions/probe.txt'))).toThrow();
    answer({ roots: [{ uri: pathToFileURL(repo).href }] });
    await resolution;
    await call;
    expect(readFileSync(join(repo, '.nexus-agents/sessions/probe.txt'), 'utf8')).toBe('written');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds an unanswered roots request and logs the root used on every fallback call', async () => {
    const call = callback({}, {});
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await call;
    expect(readFileSync(join(fallbackRepo, '.nexus-agents/sessions/probe.txt'), 'utf8')).toBe(
      'written'
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool dispatch using workspace root fallback',
      expect.objectContaining({
        toolName: 'root_write_probe',
        workspaceRoot: fallbackRepo,
        dataDir: join(fallbackRepo, '.nexus-agents'),
        reason: 'timeout',
        timeoutMs: TIMEOUT_MS,
      })
    );
    await callback({}, {});
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the timed-out fallback when a late roots response arrives', async () => {
    const call = callback({}, {});
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await call;
    answer({ roots: [{ uri: pathToFileURL(repo).href }] });
    await resolution;
    await callback({}, {});
    expect(nexusDataPath('sessions')).toBe(join(fallbackRepo, '.nexus-agents/sessions'));
  });

  it('shares one bounded wait across concurrent calls', async () => {
    const first = callback({}, {});
    const second = callback({}, {});
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await Promise.all([first, second]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs the effective directory when NEXUS_DATA_DIR overrides the fallback root', async () => {
    const dataDir = join(fixture, 'data'); // Sibling of both fixture repos.
    vi.stubEnv('NEXUS_DATA_DIR', dataDir);
    const call = callback({}, {});
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await call;
    expect(readFileSync(join(dataDir, 'sessions/probe.txt'), 'utf8')).toBe('written');
    expect(logger.warn).toHaveBeenCalledWith(
      'Tool dispatch using workspace root fallback',
      expect.objectContaining({ workspaceRoot: fallbackRepo, dataDir, governanceDataDir: dataDir })
    );
  });

  it('releases dispatch on a roots/list transport error', async () => {
    answer({ roots: [] });
    await resolution;
    roots.beginWorkspaceRootResolution(logger);
    server.server.listRoots = () => Promise.reject(new Error('disconnected'));
    await roots.resolveWorkspaceRootFromClient(server, logger);
    await callback({}, {});
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.debug).toHaveBeenCalledWith(
      'roots/list request failed; using cwd/homedir for data dir',
      { error: 'disconnected' }
    );
  });

  it('does not wait when the client has no roots capability', async () => {
    answer({ roots: [] });
    await resolution;
    roots.beginWorkspaceRootResolution(logger);
    server.server.getClientCapabilities = () => ({});
    server.server.listRoots = vi.fn(
      () =>
        new Promise<never>(() => {
          // A client without roots must never be asked to answer this request.
        })
    );
    await roots.resolveWorkspaceRootFromClient(server, logger);
    await callback({}, {});
    expect(server.server.listRoots).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not wait on calls after resolution', async () => {
    answer({ roots: [{ uri: pathToFileURL(repo).href }] });
    await resolution;
    await callback({}, {});
    await callback({}, {});
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('names empty roots as fallback and releases dispatch without a timer', async () => {
    answer({ roots: [] });
    await resolution;
    await callback({}, {});
    expect(nexusDataPath('sessions')).toBe(join(fallbackRepo, '.nexus-agents/sessions'));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases dispatch when capability lookup throws', async () => {
    answer({ roots: [] });
    await resolution;
    roots.beginWorkspaceRootResolution(logger);
    server.server.getClientCapabilities = () => {
      throw new Error('transport unavailable');
    };
    await roots.resolveWorkspaceRootFromClient(server, logger);
    await callback({}, {});
    expect(vi.getTimerCount()).toBe(0);
  });
});
