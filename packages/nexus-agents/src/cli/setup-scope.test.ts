import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSetup, printSetupResult } from './setup-command.js';
import { detectCliBinary } from './setup-cli-detection.js';

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
