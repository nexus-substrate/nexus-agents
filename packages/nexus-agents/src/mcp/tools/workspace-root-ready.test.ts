import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { McpServer } from '../sdk-types.js';
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
    vi.stubEnv('NEXUS_PROJECT_DIR', undefined);
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
      server: { getClientCapabilities: () => ({ roots: {} }), listRoots: vi.fn(() => response) },
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

  async function restartWithNexusProjectDir(projectDir: string | undefined): Promise<void> {
    answer({ roots: [] });
    await resolution;
    vi.stubEnv('NEXUS_PROJECT_DIR', projectDir);
    roots.beginWorkspaceRootResolution(logger);
  }

  it.each(['repo', 'nested', 'symlink', 'worktree'])(
    'resolves NEXUS_PROJECT_DIR (%s) synchronously before initialization and dispatch',
    async (kind) => {
      let projectDir = repo;
      if (kind === 'nested') {
        projectDir = join(repo, 'src');
        mkdirSync(projectDir);
      } else if (kind === 'symlink') {
        projectDir = join(fixture, 'link-nexus');
        symlinkSync(repo, projectDir, 'dir');
      } else if (kind === 'worktree') {
        rmSync(join(repo, '.git'), { recursive: true });
        writeFileSync(join(repo, '.git'), 'gitdir: /unused-fixture-admin-dir\n');
      }
      await restartWithNexusProjectDir(projectDir);
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

  it('prefers NEXUS_PROJECT_DIR over CLAUDE_PROJECT_DIR and process.cwd()', () => {
    vi.stubEnv('NEXUS_PROJECT_DIR', repo);
    vi.stubEnv('CLAUDE_PROJECT_DIR', fallbackRepo);
    roots.beginWorkspaceRootResolution(logger);
    expect(getActiveWorkspaceRoot()).toBe(realpathSync(repo));
    expect(logger.info).toHaveBeenCalledWith('Resolved workspace root from NEXUS_PROJECT_DIR', {
      workspaceRoot: realpathSync(repo),
    });
  });

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

  it('resolves process.cwd() git-root discovery synchronously when no project dir env var is set', async () => {
    await restartWithProjectDir(undefined);
    expect(getActiveWorkspaceRoot()).toBe(realpathSync(fallbackRepo));
    const call = callback({}, {});
    expect(vi.getTimerCount()).toBe(0);
    await call;
    expect(readFileSync(join(fallbackRepo, '.nexus-agents/sessions/probe.txt'), 'utf8')).toBe(
      'written'
    );
    expect(server.server.listRoots).not.toHaveBeenCalled();
  });

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
    'logs invalid CLAUDE_PROJECT_DIR (%s) once and falls back to process.cwd() repo discovery',
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
      expect(getActiveWorkspaceRoot()).toBe(realpathSync(fallbackRepo));
      expect(logger.warn).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid CLAUDE_PROJECT_DIR; falling back to process.cwd() repo discovery'
      );
      server.server.listRoots = vi.fn();
      await roots.resolveWorkspaceRootFromClient(server, logger);
      expect(server.server.listRoots).not.toHaveBeenCalled();
      const call = callback({}, {});
      expect(vi.getTimerCount()).toBe(0);
      await call;
      expect(readFileSync(join(fallbackRepo, '.nexus-agents/sessions/probe.txt'), 'utf8')).toBe(
        'written'
      );
    }
  );

  it.each(['relative', 'missing', 'file', 'non-repo', 'broken-symlink', 'empty'])(
    'logs invalid NEXUS_PROJECT_DIR (%s) once and falls back to alternative project root channels',
    async (kind) => {
      const candidates: Record<string, string> = {
        relative: '.',
        missing: join(fixture, 'missing-nexus'),
        file: join(repo, 'file-nexus.txt'),
        'non-repo': fixture,
        'broken-symlink': join(fixture, 'broken-link-nexus'),
        empty: '',
      };
      writeFileSync(candidates['file']!, 'fixture');
      symlinkSync(candidates['missing']!, candidates['broken-symlink']!);
      await restartWithNexusProjectDir(candidates[kind]);
      expect(getActiveWorkspaceRoot()).toBe(realpathSync(fallbackRepo));
      expect(logger.warn).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(
        'Invalid NEXUS_PROJECT_DIR; falling back to alternative project root channels'
      );
      server.server.listRoots = vi.fn();
      await roots.resolveWorkspaceRootFromClient(server, logger);
      expect(server.server.listRoots).not.toHaveBeenCalled();
      const call = callback({}, {});
      expect(vi.getTimerCount()).toBe(0);
      await call;
      expect(readFileSync(join(fallbackRepo, '.nexus-agents/sessions/probe.txt'), 'utf8')).toBe(
        'written'
      );
    }
  );

  it('never calls server.server.listRoots even when client declares roots capability', async () => {
    await restartWithProjectDir(undefined);
    server.server.getClientCapabilities = () => ({ roots: { listChanged: true } });
    server.server.listRoots = vi.fn(() =>
      Promise.resolve({ roots: [{ uri: pathToFileURL(repo).href }] })
    );
    await roots.resolveWorkspaceRootFromClient(server, logger);
    expect(server.server.listRoots).not.toHaveBeenCalled();
    const call = callback({}, {});
    expect(vi.getTimerCount()).toBe(0);
    await call;
    expect(readFileSync(join(fallbackRepo, '.nexus-agents/sessions/probe.txt'), 'utf8')).toBe(
      'written'
    );
  });

  it('resolveWorkspaceRootFromClient is a no-op that resolves immediately without querying roots', async () => {
    server.server.listRoots = vi.fn();
    await roots.resolveWorkspaceRootFromClient(server, logger);
    expect(server.server.listRoots).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'MCP client roots capability is retired; workspace root is resolved synchronously'
    );
  });

  it('shares immediate synchronous readiness across concurrent tool calls', async () => {
    const first = callback({}, {});
    const second = callback({}, {});
    expect(vi.getTimerCount()).toBe(0);
    await Promise.all([first, second]);
    expect(readFileSync(join(fallbackRepo, '.nexus-agents/sessions/probe.txt'), 'utf8')).toBe(
      'written'
    );
  });

  it('falls back to homedir synchronously when process.cwd() is outside any repo and no project dir is set', async () => {
    const nonRepo = join(fixture, 'non-repo-dir');
    mkdirSync(nonRepo);
    vi.spyOn(process, 'cwd').mockReturnValue(nonRepo);
    await restartWithProjectDir(undefined);
    expect(getActiveWorkspaceRoot()).toBeUndefined();
    expect(server.server.listRoots).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    const call = callback({}, {});
    await call;
    expect(server.server.listRoots).not.toHaveBeenCalled();
  });

  it('does not wait on calls after resolution', async () => {
    await callback({}, {});
    await callback({}, {});
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
