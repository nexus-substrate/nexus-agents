import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const mutationGuard = vi.hoisted(() => ({ active: false, paths: [] as string[] }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const guarded = { ...actual };
  // Trap every filesystem mutation setup and its path resolvers can perform,
  // including writes outside the fixture; never modify the operator's files.
  for (const name of [
    'writeFileSync',
    'appendFileSync',
    'mkdirSync',
    'copyFileSync',
    'renameSync',
    'unlinkSync',
    'rmSync',
    'chmodSync',
  ] as const) {
    Object.defineProperty(guarded, name, {
      value: (...args: unknown[]): unknown => {
        if (mutationGuard.active) {
          mutationGuard.paths.push(`${name}: ${String(args[0])}`);
          throw new Error(`Filesystem mutation during dry run: ${name}`);
        }
        return Reflect.apply(actual[name], actual, args);
      },
    });
  }
  return guarded;
});
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  homedir: vi.fn(),
}));

describe('setup dry-run has no side effects (#7304)', () => {
  let root: string;
  let projectRoot: string;
  let userRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(join(tmpdir(), 'setup-dry-run-'));
    projectRoot = join(root, 'project');
    userRoot = join(root, 'home');
    fs.mkdirSync(join(projectRoot, '.git'), { recursive: true });
    fs.mkdirSync(userRoot);
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    vi.mocked(homedir).mockReturnValue(userRoot);
    vi.stubEnv('NEXUS_DATA_DIR', '');
    vi.stubEnv('NEXUS_SANDBOX', '');
    vi.stubEnv('NEXUS_REPO_PREFERRED', '1');
    vi.stubEnv('NEXUS_GITIGNORE_AUTO', 'true');
    vi.stubEnv('NEXUS_OPENCODE_CONFIG', '');
    mutationGuard.paths = [];
    vi.resetModules();
  });

  afterEach(() => {
    mutationGuard.active = false;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('reports errors in a failed preview without claiming success', async () => {
    const { printSetupResult } = await import('./setup-command.js');
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    printSetupResult(
      {
        success: false,
        steps: [],
        warnings: [],
        errors: ['Preview error'],
        durationMs: 0,
        dryRun: true,
        scope: 'user',
      },
      false
    );
    const text = output.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(text).toContain('✗ Setup preview completed with errors');
    expect(text).not.toContain('✓ Setup preview complete');
  });

  it.each([
    ['user', false],
    ['user', true],
    ['project', false],
    ['project', true],
  ] as const)('previews every step at %s scope (force=%s)', async (scope, force) => {
    const mutatingSpawns: string[] = [];
    vi.mocked(execSync).mockImplementation((command) => {
      if (command === 'claude --version') return '2.1.0';
      if (command === 'claude mcp get nexus-agents') return force ? 'nexus-agents' : '';
      mutatingSpawns.push(command);
      return '';
    });
    vi.mocked(execFileSync).mockImplementation((file, args) => {
      const cliArgs = args ?? [];
      if (file === 'which' || file === 'where') return `/stub/${String(cliArgs[0])}`;
      if (cliArgs[0] === '--version') return '1.0.0';
      if (file === 'codex' && cliArgs[1] === 'list') return force ? 'nexus-agents' : '';
      mutatingSpawns.push(`${file} ${cliArgs.join(' ')}`);
      return '';
    });
    if (force) {
      fs.mkdirSync(join(projectRoot, '.rules'));
      fs.writeFileSync(join(projectRoot, '.rules', 'nexus-agents.md'), 'Keep rules');
      fs.writeFileSync(join(projectRoot, 'nexus-agents.yaml'), 'Keep config');
      fs.mkdirSync(join(userRoot, '.claude'));
      fs.writeFileSync(join(userRoot, '.claude', 'settings.json'), '{"keep":true}');
      const openCodePath =
        scope === 'project' ? projectRoot : join(userRoot, '.config', 'opencode');
      fs.mkdirSync(openCodePath, { recursive: true });
      fs.writeFileSync(join(openCodePath, 'opencode.json'), '{"mcp":{"nexus-agents":{}}}');
    }
    const before = fs.readdirSync(root, { recursive: true });
    mutationGuard.active = true;
    const { runSetup, printSetupResult } = await import('./setup-command.js');
    const result = runSetup({ dryRun: true, force, scope });
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    printSetupResult(result, false);

    expect.soft(mutatingSpawns).toEqual([]);
    expect.soft(mutationGuard.paths).toEqual([]);
    expect.soft(fs.readdirSync(root, { recursive: true })).toEqual(before);
    expect.soft(result.success).toBe(true);
    expect.soft(result.mcpConfigured).not.toBe(true);
    expect.soft(result.hooksConfigured).not.toBe(true);
    for (const name of [
      'MCP Configuration',
      'Rules File',
      'Hooks Configuration',
      'Data Directory',
      'OpenCode MCP',
      'Codex MCP',
      'Configuration',
      'Validation',
    ]) {
      expect.soft(result.steps.find((step) => step.name === name)?.message).toContain('Would');
    }
    const text = output.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect.soft(text).toContain('Would configure nexus-agents MCP');
    expect.soft(text).not.toContain('Added nexus-agents MCP');
    // Nothing was configured, so nothing was validated and no manual step is owed.
    expect.soft(text).not.toMatch(/configs OK|Data dirs OK|Config OK/);
    const nextSteps = text.slice(text.indexOf('Next Steps'));
    expect.soft(nextSteps).toContain('without --dry-run');
    expect.soft(nextSteps).not.toContain('Configure MCP manually');
    expect.soft(nextSteps).not.toContain('Restart Claude Code');
  });

  // The CLI path: dispatchCommand runs startup work before the setup handler.
  // A runSetup()-only test never reaches it, which is how #7304's first fix
  // still created data dirs and edited .gitignore under `setup --dry-run`.
  it.each([true, false])(
    'dispatches setup --dry-run with zero writes (git repo=%s)',
    async (inRepo) => {
      if (!inRepo) fs.rmSync(join(projectRoot, '.git'), { recursive: true });
      const mutatingSpawns: string[] = [];
      vi.mocked(execSync).mockImplementation((command) => {
        if (command === 'claude --version') return '2.1.0';
        if (command === 'claude mcp get nexus-agents') return '';
        mutatingSpawns.push(command);
        return '';
      });
      vi.mocked(execFileSync).mockImplementation((file, args) => {
        const cliArgs = args ?? [];
        if (file === 'which' || file === 'where') return `/stub/${String(cliArgs[0])}`;
        if (cliArgs[0] === '--version') return '1.0.0';
        if (file === 'codex' && cliArgs[1] === 'list') return '';
        mutatingSpawns.push(`${file} ${cliArgs.join(' ')}`);
        return '';
      });
      const exitCodes: unknown[] = [];
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        exitCodes.push(code);
      }) as typeof process.exit);
      const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const before = fs.readdirSync(root, { recursive: true });
      mutationGuard.active = true;
      const { parseCliArgs } = await import('../cli.js');
      const { dispatchCommand } = await import('../cli-commands.js');
      await dispatchCommand(parseCliArgs(['setup', '--dry-run', '--non-interactive']));
      mutationGuard.active = false;

      expect.soft(mutationGuard.paths).toEqual([]);
      expect.soft(mutatingSpawns).toEqual([]);
      expect.soft(fs.readdirSync(root, { recursive: true })).toEqual(before);
      expect.soft(exitCodes).toEqual([0]);
      const text = output.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect.soft(text).toContain('no changes made');
    }
  );

  it.each(['home', 'fallback', 'override'] as const)(
    'previews data routing without writes or caching (%s)',
    async (routing) => {
      if (routing === 'override') vi.stubEnv('NEXUS_DATA_DIR', join(root, 'override'));
      if (routing === 'fallback') {
        const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
        vi.spyOn(fs, 'accessSync').mockImplementation((path, mode) => {
          if (String(path).startsWith(userRoot)) throw new Error('Home is unwritable');
          actual.accessSync(path, mode);
        });
      }
      const { initDataDirectories } = await import('./setup-data-dir.js');
      mutationGuard.active = true;
      const result = initDataDirectories(true);
      expect.soft(mutationGuard.paths).toEqual([]);
      expect.soft(result.success).toBe(true);
      const expectedBase =
        routing === 'override'
          ? join(root, 'override')
          : routing === 'fallback'
            ? join(projectRoot, '.nexus-agents')
            : join(userRoot, '.nexus-agents');
      expect.soft(result.created).toContain(join(expectedBase, 'memory'));
      expect
        .soft(result.created)
        .toContain(
          join(
            routing === 'override' ? expectedBase : join(projectRoot, '.nexus-agents'),
            'sessions'
          )
        );
      // Preview must not mark the real resolver's mutations as already done.
      mutationGuard.active = false;
      const { nexusDataPath } = await import('../config/nexus-data-dir.js');
      nexusDataPath('sessions');
      if (routing !== 'override') expect(fs.existsSync(join(projectRoot, '.gitignore'))).toBe(true);
    }
  );
});
