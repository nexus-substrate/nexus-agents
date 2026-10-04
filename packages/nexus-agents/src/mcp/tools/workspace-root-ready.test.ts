import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import {
  nexusDataPath,
  getActiveWorkspaceRoot,
  _resetActiveWorkspaceRootForTests,
} from '../../config/nexus-data-dir.js';
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
    vi.stubEnv('CLAUDE_PROJECT_DIR', undefined);
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

  async function restartWithProjectDir(projectDir: string | undefined): Promise<void> {
    answer({ roots: [] });
    await resolution;
    vi.stubEnv('CLAUDE_PROJECT_DIR', projectDir);
    roots.beginWorkspaceRootResolution(logger);
  }

  it.each(['repo', 'nested', 'symlink', 'worktree'])(
    'resolves CLAUDE_PROJECT_DIR (%s) synchronously before initialization and dispatch',
    async (kind) => {
      let projectDir = repo;
      if (kind === 'nested') {
        projectDir = join(repo, 'src');
        mkdirSync(projectDir);
      } else if (kind === 'symlink') {
        projectDir = join(fixture, 'link');
        symlinkSync(repo, projectDir, 'dir');
      } else if (kind === 'worktree') {
        rmSync(join(repo, '.git'), { recursive: true });
        writeFileSync(join(repo, '.git'), 'gitdir: /unused-fixture-admin-dir\n');
      }
      await restartWithProjectDir(projectDir);
      expect(getActiveWorkspaceRoot()).toBe(realpathSync(repo));
      const ready = vi.fn();
      void roots.workspaceRootReady.then(ready);
      await Promise.resolve();
      expect(ready).toHaveBeenCalledOnce();
      const call = callback({}, {});
      expect(vi.getTimerCount()).toBe(0);
      await call;
      expect(readFileSync(join(repo, '.nexus-agents/sessions/probe.txt'), 'utf8')).toBe('written');
      expect(logger.warn).not.toHaveBeenCalled();
    }
  );

  it('keeps the synchronous root without asking the initialized client for roots', async () => {
    await restartWithProjectDir(repo);
    server.server.listRoots = vi.fn(() => Promise.resolve({ roots: [] }));
    await roots.resolveWorkspaceRootFromClient(server, logger);
    expect(server.server.listRoots).not.toHaveBeenCalled();
    expect(getActiveWorkspaceRoot()).toBe(realpathSync(repo));
  });

  it.each([undefined, '.'])(
    'retains the late-initialization roots path after timeout with project dir %s',
    async (projectDir) => {
      await restartWithProjectDir(projectDir);
      const call = callback({}, {});
      await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
      await call;
      server.server.listRoots = vi.fn(() =>
        Promise.resolve({ roots: [{ uri: pathToFileURL(repo).href }] })
      );
      await roots.resolveWorkspaceRootFromClient(server, logger);
      expect(server.server.listRoots).toHaveBeenCalledOnce();
      expect(getActiveWorkspaceRoot()).toBe(realpathSync(fallbackRepo));
      expect(nexusDataPath('sessions')).toBe(join(fallbackRepo, '.nexus-agents/sessions'));
    }
  );

  it('preserves NEXUS_DATA_DIR precedence with a synchronous workspace root', async () => {
    const dataDir = join(fixture, 'data'); // Sibling of the fixture repos.
    vi.stubEnv('NEXUS_DATA_DIR', dataDir);
    await restartWithProjectDir(repo);
    expect(getActiveWorkspaceRoot()).toBe(realpathSync(repo));
    const call = callback({}, {});
    expect(vi.getTimerCount()).toBe(0);
    await call;
    expect(readFileSync(join(dataDir, 'sessions/probe.txt'), 'utf8')).toBe('written');
    expect(nexusDataPath('governance')).toBe(join(dataDir, 'governance'));
    expect(nexusDataPath('research')).toBe(join(dataDir, 'research'));
  });

  it.each(['relative', 'missing', 'file', 'non-repo', 'broken-symlink', 'empty'])(
    'logs invalid CLAUDE_PROJECT_DIR (%s) once and retains the async roots path',
    async (kind) => {
      const candidates: Record<string, string> = {
        relative: '.', // Exists inside fallbackRepo, but is not absolute.
        missing: join(fixture, 'missing'),
        file: join(repo, 'file.txt'),
        'non-repo': fixture,
        'broken-symlink': join(fixture, 'broken-link'),
        empty: '',
      };
      writeFileSync(candidates['file']!, 'fixture');
      symlinkSync(candidates['missing']!, candidates['broken-symlink']!);
      await restartWithProjectDir(candidates[kind]);
      expect(getActiveWorkspaceRoot()).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid CLAUDE_PROJECT_DIR; falling back to MCP client roots'
      );
      const ready = vi.fn();
      void roots.workspaceRootReady.then(ready);
      const call = callback({}, {});
      expect(vi.getTimerCount()).toBe(1);
      await Promise.resolve();
      expect(ready).not.toHaveBeenCalled();
      server.server.listRoots = vi.fn(() =>
        Promise.resolve({ roots: [{ uri: pathToFileURL(repo).href }] })
      );
      await roots.resolveWorkspaceRootFromClient(server, logger);
      await call;
      expect(server.server.listRoots).toHaveBeenCalledOnce();
      expect(readFileSync(join(repo, '.nexus-agents/sessions/probe.txt'), 'utf8')).toBe('written');
      expect(logger.warn).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

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
