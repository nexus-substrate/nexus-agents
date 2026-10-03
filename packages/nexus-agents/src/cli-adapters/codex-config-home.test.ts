/** Relocated config home is shared by the isolation scan and spawned Codex (#6982). */
import { spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CodexCliAdapter } from './adapters/codex-adapter.js';

// Run a harmless Node child at the process boundary; retain the actual spawn env/argv.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const output = JSON.stringify({
    type: 'item.completed',
    item: { id: 'test', type: 'agent_message', text: 'reviewed' },
  });
  return {
    ...actual,
    spawn: vi.fn((_command: string, _args: readonly string[], options: SpawnOptionsWithoutStdio) =>
      actual.spawn(
        process.execPath,
        ['-e', `process.stdout.write(${JSON.stringify(output)})`],
        options
      )
    ),
  };
});

class CodexProbe extends CodexCliAdapter {
  protected override codexSystemConfigFiles(): readonly string[] {
    return [];
  }
}

let root: string;
let home: string;
let codexHome: string;
let project: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nexus-6982-'));
  home = join(root, 'home');
  codexHome = join(root, 'relocated codex');
  project = join(root, 'project');
  mkdirSync(join(home, '.codex'), { recursive: true });
  mkdirSync(codexHome);
  mkdirSync(join(project, '.git'), { recursive: true });
  vi.stubEnv('HOME', home);
  vi.stubEnv('CODEX_HOME', codexHome);
  vi.stubEnv('NEXUS_SUBPROCESS_ENV_ALLOWLIST', undefined);
  vi.stubEnv('NEXUS_SUBPROCESS_EXTRA_ENV', undefined);
  vi.mocked(spawn).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it('passes parent CODEX_HOME to the child and isolates only its config.toml', async () => {
  writeFileSync(join(codexHome, 'config.toml'), '[mcp_servers.relocated]\ncommand = "test"\n');
  writeFileSync(
    join(home, '.codex', 'config.toml'),
    '[mcp_servers.default_home]\ncommand = "test"\n'
  );
  const adapter = new CodexProbe({ sandboxProbe: () => ({ status: 'ok' }) });
  const result = await adapter.execute(
    { content: 'review', accessMode: 'read-only-analysis', options: { workDir: project } },
    { allowRetry: false }
  );
  expect(result.ok).toBe(true);
  expect(spawn).toHaveBeenCalledOnce();
  const [command, args, options] = vi.mocked(spawn).mock.calls[0]!;
  expect(command).toBe('codex');
  expect(options?.env?.['CODEX_HOME']).toBe(codexHome);
  expect(options?.env?.['HOME']).toBe(home);
  expect(args).toContain('mcp_servers.relocated.enabled=false');
  expect(args).not.toContain('mcp_servers.default_home.enabled=false');
});
