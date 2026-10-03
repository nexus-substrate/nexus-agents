/** Real filesystem confinement and fallback provenance (#7011). */
import { execFileSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';
import { createAgentStages } from './agent-executor.js';
import { execFileTree } from '../cli-adapters/exec-file-tree.js';
import { createBwrapPreflight } from '../cli-adapters/codex-sandbox-preflight.js';
import {
  bwrapPreflight,
  buildSandboxInvocation,
  createScratchSandbox,
} from './dev-pipeline-sandbox.js';
import { createScratchCheckout, type ScratchCheckout } from '../cli/vote-scratch-checkout.js';
import * as sandboxModule from './dev-pipeline-sandbox.js';
import { withDevPipelineWorkspace } from './dev-pipeline-workspace.js';

const pipelineResult = {
  completed: true,
  plan: '',
  tasks: [],
  voteIterations: 0,
  qaIterations: 0,
  securityPassed: true,
};

const availability = await bwrapPreflight();
const bwrapAvailable = availability.mode === 'os-sandbox';
if (!bwrapAvailable)
  console.warn(`Skipping real bwrap tests: ${availability.reason ?? 'unknown reason'}`);

it('builds exactly the approved writable mounts, keeping root read-only and network', () => {
  const invocation = buildSandboxInvocation(
    'node',
    ['a b', '--flag'],
    { timeoutMs: 1000 },
    {
      scratch: '/scratch',
      gitDir: '/source/.git/worktrees/scratch',
      temp: '/private-temp',
    }
  );
  expect(isAbsolute(invocation.command)).toBe(true);
  expect(invocation.command.endsWith('/bwrap')).toBe(true);
  const argsWithoutSocketMasks = invocation.args.filter(
    (arg, index, args) =>
      !(arg === '--ro-bind' && args[index + 1] === '/dev/null') &&
      !(arg === '/dev/null' && args[index - 1] === '--ro-bind') &&
      !(arg.endsWith('/docker.sock') && args[index - 1] === '/dev/null')
  );
  expect(argsWithoutSocketMasks).toEqual([
    ...[
      '--ro-bind / /',
      '--dev /dev',
      '--proc /proc',
      '--unshare-pid --die-with-parent --new-session',
      '--bind /scratch /scratch',
      '--bind /source/.git/worktrees/scratch /source/.git/worktrees/scratch',
      '--bind /private-temp /private-temp',
      '--tmpfs /run/user',
    ].flatMap((flags) => flags.split(' ')),
    '--',
    'node',
    'a b',
    '--flag',
  ]);
  expect(invocation.options.env?.['TMPDIR']).toBe('/private-temp');
  expect(invocation.options.env?.['SEMGREP_SETTINGS_FILE']).toBe(
    '/private-temp/semgrep-settings.yaml'
  );
  expect(invocation.options.env?.['SEMGREP_LOG_FILE']).toBe('/private-temp/semgrep.log');
  expect(invocation.options.env?.['SEMGREP_VERSION_CACHE_PATH']).toBe(
    '/private-temp/semgrep-version'
  );
});

it('pins private package stores and drops host IPC environment variables', () => {
  const invocation = buildSandboxInvocation(
    'pnpm',
    ['install'],
    {
      timeoutMs: 1000,
      env: {
        npm_config_store_dir: '/shared',
        NPM_CONFIG_CACHE: '/shared',
        npm_config_enable_global_virtual_store: 'true',
        DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1/bus',
        DBUS_SYSTEM_BUS_ADDRESS: 'unix:path=/run/dbus/system_bus_socket',
        DOCKER_HOST: 'unix:///run/docker.sock',
        XDG_RUNTIME_DIR: '/run/user/1',
        SSH_AUTH_SOCK: '/run/user/1/agent',
      },
    },
    { scratch: '/scratch', gitDir: '/source/.git/worktrees/scratch', temp: '/private-temp' }
  );
  const env = invocation.options.env;
  expect(env?.['npm_config_store_dir']).toBe('/private-temp/pnpm-store');
  expect(env?.['npm_config_cache']).toBe('/private-temp/npm-cache');
  expect(env?.['npm_config_cache_dir']).toBe('/private-temp/pnpm-cache');
  expect(env?.['YARN_CACHE_FOLDER']).toBe('/private-temp/yarn-cache');
  expect(env?.['npm_config_package_import_method']).toBe('copy');
  expect(env?.['npm_config_enable_global_virtual_store']).toBe('false');
  expect(env?.['NPM_CONFIG_CACHE']).toBeUndefined();
  for (const name of [
    'DBUS_SESSION_BUS_ADDRESS',
    'DBUS_SYSTEM_BUS_ADDRESS',
    'DOCKER_HOST',
    'XDG_RUNTIME_DIR',
    'SSH_AUTH_SOCK',
  ]) {
    expect(env?.[name]).toBeUndefined();
  }
  expect(invocation.args).toContain('--tmpfs');
  expect(invocation.args).toContain('/run/user');
});

it('caches success, blocked user namespaces, missing binary and non-Linux with reasons', async () => {
  for (const result of [
    { exitCode: 0, stderr: '' },
    { exitCode: 1, stderr: 'userns denied' },
    { exitCode: null, stderr: 'spawn bwrap ENOENT' },
  ]) {
    const exec = vi.fn().mockResolvedValue(result);
    const probe = createBwrapPreflight(exec, 'linux');
    const measured = await Promise.all([probe(), probe()]);
    expect(exec).toHaveBeenCalledOnce();
    expect(measured[0]).toEqual(measured[1]);
    expect(measured[0]?.mode).toBe(result.exitCode === 0 ? 'os-sandbox' : 'best-effort');
    if (result.exitCode !== 0) expect(measured[0]?.reason).toContain(result.stderr);
  }
  const exec = vi.fn();
  expect(await createBwrapPreflight(exec, 'darwin')()).toEqual({
    mode: 'best-effort',
    reason: 'bwrap requires Linux',
  });
  expect(exec).not.toHaveBeenCalled();
});

describe('scratch OS sandbox', () => {
  let root: string;
  let source: string;
  let cache: string;
  let scratch: ScratchCheckout;
  beforeEach(() => {
    root = mkdtempOutsideRepo('sandbox-7011-');
    source = join(root, 'source');
    cache = join(root, 'cache');
    mkdirSync(source);
    mkdirSync(cache);
    mkdirSync(join(root, 'scratch'));
    vi.stubEnv('NEXUS_TMPDIR', join(root, 'scratch'));
    vi.stubEnv('npm_config_cache', cache);
    writeFileSync(join(source, 'tracked'), 'original');
    writeFileSync(join(source, 'package.json'), '{}');
    writeFileSync(join(source, 'package-lock.json'), '{}');
    const git = (...args: string[]): string =>
      execFileSync('git', args, {
        cwd: source,
        env: hermeticGitEnv(),
        encoding: 'utf8',
      });
    git('init', '-q');
    git('add', '.');
    git(
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '-qm',
      'fixture'
    );
    scratch = createScratchCheckout({
      repoRoot: source,
      sha: git('rev-parse', 'HEAD').trim(),
      hermetic: true,
    });
  });
  afterEach(() => {
    scratch.dispose();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  const options = { timeoutMs: 5000 };

  it('refuses a writable scratch path overlapping the protected source', async () => {
    await expect(createScratchSandbox(source, source)).rejects.toThrow('overlaps protected source');
    expect(readFileSync(join(source, 'tracked'), 'utf8')).toBe('original');
  });

  it.skipIf(!bwrapAvailable).each(['npm', 'pnpm'])(
    '%s shared cache/store hardlinks stay read-only while private stores remain writable',
    async (manager) => {
      if (manager === 'pnpm') {
        writeFileSync(join(scratch.path, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
        writeFileSync(
          join(scratch.path, '.npmrc'),
          `store-dir=${join(cache, 'store')}\ncache-dir=${cache}\n`
        );
      }
      const aliased = join(cache, 'alias');
      linkSync(join(source, 'tracked'), aliased);
      const sandbox = await createScratchSandbox(scratch.path, source);
      const protectedPaths = ['tracked', '.git/config', '.git/index'].map((p) => join(source, p));
      const before = protectedPaths.map((p) => readFileSync(p));
      const script = `
      const fs = require('node:fs');
      const paths = ${JSON.stringify(protectedPaths)};
      for (const path of paths) {
        try { fs.writeFileSync(path, 'escaped'); throw new Error('write allowed: ' + path); }
        catch (e) { if (e.code !== 'EROFS' && e.code !== 'EACCES') throw e; }
      }
      fs.writeFileSync('added', 'scratch');
      fs.writeFileSync(process.env.TMPDIR + '/written', 'temp');
      try { fs.writeFileSync(${JSON.stringify(aliased)}, 'escaped'); throw new Error('shared store writable'); }
      catch (e) { if (e.code !== 'EROFS' && e.code !== 'EACCES') throw e; }
      for (const key of ['npm_config_store_dir', 'npm_config_cache', 'npm_config_cache_dir', 'YARN_CACHE_FOLDER']) {
        fs.mkdirSync(process.env[key], { recursive: true });
        fs.writeFileSync(process.env[key] + '/written', 'private');
      }
      require('node:child_process').execFileSync('git', ['add', '-N', 'added']);
      console.log(process.env.TMPDIR);
    `;
      const result = await execFileTree(process.execPath, ['-e', script], {
        ...options,
        cwd: scratch.path,
        wrapper: sandbox.wrapper,
      });
      expect(protectedPaths.map((p) => readFileSync(p))).toEqual(before);
      expect(readFileSync(join(scratch.path, 'added'), 'utf8')).toBe('scratch');
      expect(readFileSync(join(result.stdout.trim(), 'written'), 'utf8')).toBe('temp');
      expect(readFileSync(aliased, 'utf8')).toBe('original');
      expect(readFileSync(join(result.stdout.trim(), 'pnpm-store/written'), 'utf8')).toBe(
        'private'
      );
      sandbox.dispose();
    }
  );

  it.skipIf(!bwrapAvailable)(
    'confines a SIGTERM-ignoring descendant during timeout grace',
    async () => {
      const sandbox = await createScratchSandbox(scratch.path, source);
      const childScript = `process.on('SIGTERM', () => {});
      const fs = require('node:fs'); fs.writeFileSync('ready', 'yes');
      setInterval(() => { try { fs.writeFileSync(${JSON.stringify(join(source, 'tracked'))}, 'escaped'); }
        catch { fs.writeFileSync('denied', 'yes'); } }, 10);`;
      const parentScript = `require('node:child_process').spawn(process.execPath,
      ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore', detached: true }); setInterval(() => {}, 1000);`;
      const controller = new AbortController();
      const running = execFileTree(process.execPath, ['-e', parentScript], {
        ...options,
        cwd: scratch.path,
        wrapper: sandbox.wrapper,
        signal: controller.signal,
        graceMs: 200,
      });
      const rejected = expect(running).rejects.toThrow('aborted');
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          if (readFileSync(join(scratch.path, 'denied'), 'utf8') === 'yes') break;
        } catch {
          /* Await readiness. */
        }
        await delay(10);
      }
      expect(readFileSync(join(scratch.path, 'ready'), 'utf8')).toBe('yes');
      controller.abort();
      await rejected;
      await delay(300);
      expect(readFileSync(join(source, 'tracked'), 'utf8')).toBe('original');
      sandbox.dispose();
    }
  );

  it.skipIf(!bwrapAvailable)(
    'production install, all quality checks and both scanner spawns are confined',
    async () => {
      const protectedPaths = ['tracked', '.git/config', '.git/index'].map((p) => join(source, p));
      const before = protectedPaths.map((p) => readFileSync(p));
      const attack = `const fs = require('node:fs');
      for (const path of ${JSON.stringify(protectedPaths)}) {
        try { fs.writeFileSync(path, 'escaped'); throw new Error('unconfined'); }
        catch (e) { if (e.code !== 'EROFS' && e.code !== 'EACCES') throw e; }
      }
      fs.writeFileSync(process.env.TMPDIR + '/stage-temp', 'yes');`;
      const bin = join(root, 'bin');
      mkdirSync(bin);
      writeFileSync(
        join(bin, 'semgrep'),
        `#!${process.execPath}\n${attack}
      console.log(process.argv.includes('--version') ? '1.0' : JSON.stringify({
        version: '2.1.0', runs: [{tool: {driver: {name: 'fixture'}}, results: []}]
      }));`,
        { mode: 0o755 }
      );
      vi.stubEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`);
      const install: NonNullable<Parameters<typeof withDevPipelineWorkspace>[2]> = async (
        _cmd,
        _args,
        opts
      ) => {
        await execFileTree(process.execPath, ['-e', attack], {
          timeoutMs: 5000,
          cwd: opts.cwd,
          env: opts.env,
          wrapper: opts.wrapper,
        });
        writeFileSync(join(opts.cwd, 'gate.cjs'), attack);
        writeFileSync(
          join(opts.cwd, 'package.json'),
          JSON.stringify({
            scripts: {
              typecheck: 'node gate.cjs',
              lint: 'node gate.cjs',
              test: 'node gate.cjs',
            },
          })
        );
      };
      const result = await withDevPipelineWorkspace(
        createAgentStages({ scanTarget: source }),
        async (bound) => {
          const quality = await bound.qualityGate?.();
          expect(quality?.passed, quality?.feedback).toBe(true);
          const scan = await bound.securityScan();
          expect(scan.passed, scan.feedback).toBe(true);
          return pipelineResult;
        },
        install
      );
      expect(result.changes?.dependencies.status).toBe('installed');
      expect(result.changes?.isolation).toEqual({ mode: 'os-sandbox' });
      expect(protectedPaths.map((p) => readFileSync(p))).toEqual(before);
    }
  );

  it.skipIf(!bwrapAvailable)(
    'installs a frozen lockfile with a private writable store',
    async () => {
      const packageDir = join(root, 'fixture-package');
      mkdirSync(packageDir);
      writeFileSync(
        join(packageDir, 'package.json'),
        JSON.stringify({ name: 'sandbox-fixture', version: '1.0.0', main: 'index.js' })
      );
      writeFileSync(join(packageDir, 'index.js'), 'module.exports = 7011;');
      const tarball = join(root, 'fixture.tgz');
      execFileSync('tar', ['-czf', tarball, '-C', root, 'fixture-package']);
      writeFileSync(
        join(scratch.path, 'package.json'),
        JSON.stringify({ dependencies: { 'sandbox-fixture': `file:${tarball}` } })
      );
      rmSync(join(scratch.path, 'package-lock.json'));
      execFileSync('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], {
        cwd: scratch.path,
        env: hermeticGitEnv(),
        timeout: 30_000,
      });
      const sandbox = await createScratchSandbox(scratch.path, source);
      try {
        await execFileTree('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
          timeoutMs: 30_000,
          cwd: scratch.path,
          wrapper: sandbox.wrapper,
        });
        expect(
          readFileSync(join(scratch.path, 'node_modules/sandbox-fixture/index.js'), 'utf8')
        ).toBe('module.exports = 7011;');
        const invocation = sandbox.wrapper('true', [], options);
        const store = invocation.options.env?.['npm_config_store_dir'];
        expect(store).toBeDefined();
        expect(existsSync(store ?? '')).toBe(true);
      } finally {
        sandbox.dispose();
      }
    }
  );

  // Measured on 2026-10-03: with the real home read-only, `codex exec` exits 1
  // ("failed to initialize in-process app-server client: Read-only file system").
  // The sandbox gives codex a private home seeded with copies; the host home stays read-only.
  it.skipIf(!bwrapAvailable)(
    'gives a sandboxed codex a private seeded home and keeps the host home read-only',
    async () => {
      const hostHome = join(root, 'host-codex-home');
      mkdirSync(hostHome);
      writeFileSync(join(hostHome, 'auth.json'), '{"token":"fixture"}');
      writeFileSync(join(hostHome, 'config.toml'), 'model = "fixture"\n');
      vi.stubEnv('CODEX_HOME', hostHome);
      const sandbox = await createScratchSandbox(scratch.path, source);
      try {
        const script = `const fs = require('node:fs'); const path = require('node:path');
      const home = process.env.CODEX_HOME;
      if (home === ${JSON.stringify(hostHome)}) throw new Error('host home used');
      if (fs.readFileSync(path.join(home, 'auth.json'), 'utf8') !== '{"token":"fixture"}') throw new Error('auth not seeded');
      fs.writeFileSync(path.join(home, 'auth.json'), 'refreshed');
      let hostWritable = true;
      try { fs.writeFileSync(${JSON.stringify(join(hostHome, 'auth.json'))}, 'tampered'); } catch { hostWritable = false; }
      if (hostWritable) throw new Error('host home writable');`;
        await execFileTree(process.execPath, ['-e', script], {
          ...options,
          cwd: scratch.path,
          wrapper: sandbox.wrapper,
        });
      } finally {
        sandbox.dispose();
      }
      expect(readFileSync(join(hostHome, 'auth.json'), 'utf8')).toBe('{"token":"fixture"}');
    }
  );

  it.skipIf(!bwrapAvailable)('drops host IPC environment and masks runtime sockets', async () => {
    vi.stubEnv('DBUS_SESSION_BUS_ADDRESS', 'unix:path=/run/user/1000/bus');
    const sandbox = await createScratchSandbox(scratch.path, source);
    try {
      const script = `const fs = require('node:fs');
      if (process.env.DBUS_SESSION_BUS_ADDRESS !== undefined) throw new Error('D-Bus inherited');
      if (fs.readdirSync('/run/user').length !== 0) throw new Error('runtime visible');
      for (const p of ['/run/docker.sock', '/var/run/docker.sock']) {
        if (fs.existsSync(p) && !fs.statSync(p).isCharacterDevice()) throw new Error('docker socket visible');
      }`;
      await execFileTree(process.execPath, ['-e', script], {
        ...options,
        cwd: scratch.path,
        wrapper: sandbox.wrapper,
      });
    } finally {
      sandbox.dispose();
    }
  });

  it.skipIf(!bwrapAvailable)('never executes a scratch bwrap alias on the host', async () => {
    const marker = join(source, 'host-bwrap-marker');
    const sandbox = await createScratchSandbox(scratch.path, source);
    try {
      writeFileSync(join(scratch.path, 'bwrap'), `#!/bin/sh\nprintf escaped > '${marker}'\n`, {
        mode: 0o755,
      });
      await execFileTree(process.execPath, ['-e', 'console.log("confined")'], {
        ...options,
        cwd: scratch.path,
        env: { ...process.env, PATH: `.:${process.env['PATH'] ?? ''}` },
        wrapper: sandbox.wrapper,
      });
      expect(existsSync(marker)).toBe(false);
    } finally {
      sandbox.dispose();
    }
  });

  it.skipIf(!bwrapAvailable)(
    'keeps DNS resolution while masking user runtime IPC',
    async (context) => {
      const dns = `require('node:dns').lookup('registry.npmjs.org', (error, address) => {
      if (error) { console.error(error.message); process.exit(1); } console.log(address);
    });`;
      try {
        execFileSync(process.execPath, ['-e', dns], { timeout: 10_000, stdio: 'pipe' });
      } catch (error: unknown) {
        console.warn(`Skipping sandbox DNS test: host offline: ${String(error)}`);
        context.skip();
      }
      const sandbox = await createScratchSandbox(scratch.path, source);
      try {
        const result = await execFileTree(process.execPath, ['-e', dns], {
          timeoutMs: 10_000,
          cwd: scratch.path,
          wrapper: sandbox.wrapper,
        });
        expect(result.stdout.trim()).not.toBe('');
      } finally {
        sandbox.dispose();
      }
    }
  );

  it('reports private-temp cleanup failure without discarding the patch', async () => {
    vi.spyOn(sandboxModule, 'createScratchSandbox').mockResolvedValue({
      wrapper: (command, args, options) => ({ command, args, options }),
      gitEnv: {},
      dispose: () => {
        throw new Error('temp busy');
      },
    });
    const result = await withDevPipelineWorkspace(
      createAgentStages({ scanTarget: source }),
      () => Promise.resolve(pipelineResult),
      vi.fn(),
      () => Promise.resolve({ mode: 'os-sandbox' })
    );
    expect(result.changes?.worktreeRemoved).toBe(true);
    expect(result.warnings?.join(' ')).toContain('temp busy');
  });

  // A passing preflight can precede failed private temp allocation. Record
  // best-effort with the reason without claiming a sandbox the run never entered.
  it('records best-effort with the reason when sandbox setup fails after a passing preflight', async () => {
    vi.spyOn(sandboxModule, 'createScratchSandbox').mockRejectedValue(
      new Error('Cannot allocate private temp')
    );
    const install = vi.fn(
      (_command: string, _args: string[], opts: { cwd: string; wrapper?: unknown }) => {
        expect(opts.wrapper).toBeUndefined();
        return Promise.resolve();
      }
    );
    const result = await withDevPipelineWorkspace(
      createAgentStages({ scanTarget: source }),
      () => Promise.resolve(pipelineResult),
      install,
      () => Promise.resolve({ mode: 'os-sandbox' })
    );
    expect(result.changes?.isolation).toEqual({
      mode: 'best-effort',
      reason: 'sandbox setup failed: Cannot allocate private temp',
    });
    expect(result.changes?.worktreeRemoved).toBe(true);
  });

  it('unavailable sandbox records fallback and keeps existing install behavior', async () => {
    const unavailable = (): Promise<typeof availability> =>
      Promise.resolve({
        mode: 'best-effort',
        reason: 'userns blocked',
      });
    const install = vi.fn(
      (_command: string, _args: string[], opts: { cwd: string; wrapper?: unknown }) => {
        expect(opts.wrapper).toBeUndefined();
        writeFileSync(join(opts.cwd, 'installed'), 'yes');
        return Promise.resolve();
      }
    );
    const stages = createAgentStages({ scanTarget: source });
    const result = await withDevPipelineWorkspace(
      stages,
      () => Promise.resolve(pipelineResult),
      install,
      unavailable
    );
    expect(result.changes?.isolation).toEqual({ mode: 'best-effort', reason: 'userns blocked' });
    expect(result.changes?.dependencies.status).toBe('installed');
    expect(install).toHaveBeenCalledOnce();
  });
});
