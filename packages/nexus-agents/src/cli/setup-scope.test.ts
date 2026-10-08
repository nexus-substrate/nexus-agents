import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { runSetup, printSetupResult } from './setup-command.js';
import { detectCliBinary } from './setup-cli-detection.js';
import { initDataDirectories } from './setup-data-dir.js';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  homedir: vi.fn(),
}));
vi.mock('./setup-cli-detection.js', () => ({ detectCliBinary: vi.fn() }));
vi.mock('./setup-data-dir.js', () => ({
  initDataDirectories: vi.fn(() => ({ success: true, created: [], rootPath: '/unused' })),
}));

const skipOtherSteps = { skipMcp: true, skipRules: true, skipHooks: true, skipConfig: true };

describe('setup scope honesty (#7235)', () => {
  let projectRoot: string;
  let userRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'setup-project-'));
    userRoot = mkdtempSync(join(tmpdir(), 'setup-user-'));
    vi.spyOn(process, 'cwd').mockReturnValue(projectRoot);
    vi.mocked(homedir).mockReturnValue(userRoot);
    vi.mocked(detectCliBinary).mockReturnValue({ installed: true, version: 'test' });
    vi.mocked(execFileSync).mockReturnValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(userRoot, { recursive: true, force: true });
  });

  it.each([false, true])('honours OpenCode project scope (dryRun=%s)', (dryRun) => {
    const result = runSetup({ ...skipOtherSteps, skipCodex: true, scope: 'project', dryRun });
    const configPath = join(projectRoot, 'opencode.json');

    if (dryRun) {
      expect(result.steps.find((s) => s.name === 'OpenCode MCP')?.message).toContain(configPath);
      expect(existsSync(configPath)).toBe(false);
    } else {
      expect(existsSync(configPath)).toBe(true);
      const config: unknown = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config).toMatchObject({ mcp: { 'nexus-agents': { enabled: true } } });
    }
    expect(existsSync(join(userRoot, '.config', 'opencode', 'opencode.json'))).toBe(false);
  });

  it.each([
    ['project', false],
    ['project', true],
    ['user', false],
    ['user', true],
  ] as const)('prints a bare fallback with requested scope %s (dryRun=%s)', (scope, dryRun) => {
    vi.mocked(execSync).mockImplementation((command) => {
      if (command === 'claude --version') return '1.0.0';
      throw new Error('No existing registration');
    });
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('Claude registration unavailable');
    });
    const result = runSetup({
      ...skipOtherSteps,
      skipMcp: false,
      skipOpencode: true,
      skipCodex: true,
      scope,
      dryRun,
    });
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    printSetupResult(result, false);

    const text = output.mock.calls.map(([chunk]) => String(chunk)).join('');
    const payload = new RegExp(`claude mcp add-json -s ${scope} nexus-agents '([^']+)'`).exec(
      text
    )?.[1];
    expect(payload).toBeDefined();
    const entry: unknown = JSON.parse(payload ?? 'null');
    expect(entry).toEqual({
      command: 'nexus-agents',
      args: ['--mode=server'],
    });
  });

  it.each([
    ['rules', false],
    ['rules', true],
    ['data step', false],
    ['data step', true],
    ['data detail', false],
    ['data detail', true],
  ] as const)('reports Would create for %s (verbose=%s)', (section, verbose) => {
    const dataPath = join(userRoot, '.nexus-agents');
    vi.mocked(initDataDirectories).mockReturnValueOnce({
      success: true,
      rootPath: dataPath,
      created: [join(dataPath, 'auth')],
      alreadyExisted: [],
      error: null,
    });
    const result = runSetup({
      dryRun: true,
      skipMcp: true,
      skipHooks: true,
      skipOpencode: true,
      skipCodex: true,
    });
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    printSetupResult(result, verbose);
    const text = output.mock.calls.map(([chunk]) => String(chunk)).join('');

    if (section === 'data step') {
      expect(result.steps.find((step) => step.name === 'Data Directory')?.message).toBe(
        'Would create: 1 directories'
      );
    } else {
      const expected =
        section === 'rules'
          ? `Would create: ${join(projectRoot, '.rules', 'nexus-agents.md')}`
          : `Would create: 1 directories under ${dataPath}`;
      expect(text).toContain(expected);
    }
    expect(text).not.toMatch(/Created[: ]/);
    expect(existsSync(join(projectRoot, '.rules', 'nexus-agents.md'))).toBe(false);
    expect(existsSync(join(projectRoot, '.nexus-agents', 'nexus-agents.yaml'))).toBe(false);
    expect(existsSync(dataPath)).toBe(false);
  });

  it('keeps OpenCode user scope in the user config directory', () => {
    runSetup({ ...skipOtherSteps, skipCodex: true, scope: 'user' });

    expect(existsSync(join(userRoot, '.config', 'opencode', 'opencode.json'))).toBe(true);
    expect(existsSync(join(projectRoot, 'opencode.json'))).toBe(false);
  });

  it.each([false, true])('prints a Codex user-scope warning (dryRun=%s)', (dryRun) => {
    const result = runSetup({ ...skipOtherSteps, skipOpencode: true, scope: 'project', dryRun });
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    printSetupResult(result, false);

    expect(result.warnings).toContain(
      'Codex setup does not honour --scope project; using user scope (~/.codex/config.toml).'
    );
    expect(output.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain(
      'Codex setup does not honour --scope project; using user scope'
    );
  });

  it.each(['user', 'skipped', 'absent', 'existing', 'failed'] as const)(
    'reports Codex scope honestly when %s',
    (scenario) => {
      if (scenario === 'absent') {
        vi.mocked(detectCliBinary).mockReturnValue({ installed: false, version: undefined });
      }
      if (scenario === 'existing') vi.mocked(execFileSync).mockReturnValue('nexus-agents');
      if (scenario === 'failed') {
        vi.mocked(execFileSync).mockImplementation(() => {
          throw new Error('test failure');
        });
      }
      const result = runSetup({
        ...skipOtherSteps,
        skipOpencode: true,
        skipCodex: scenario === 'skipped',
        scope: scenario === 'user' ? 'user' : 'project',
      });

      const scopeWarnings = result.warnings.filter((w) => w.includes('Codex'));
      expect(scopeWarnings).toHaveLength(scenario === 'existing' || scenario === 'failed' ? 1 : 0);
    }
  );
});
