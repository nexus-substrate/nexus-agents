/**
 * Read-only analysis disables every configured MCP server (#6970).
 *
 * Observed live 2026-10-02: codex `exec -s read-only` and opencode with the
 * OPENCODE_PERMISSION deny config both started the nexus-agents MCP server
 * from the user's own CLI config, and that server wrote `.gitignore` and
 * `.nexus-agents/` into the tree. The adapters now read every config the CLI
 * would load and disable each server by name, and refuse the task when a
 * config cannot be read.
 *
 * Fixtures are real files under a temp HOME and a temp project with a `.git`
 * marker, so the walk and the parsers run for real. Every argv/env assertion
 * is paired with a default-mode row.
 *
 * @module cli-adapters/read-only-mcp-isolation.test
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliTask } from './types.js';
import type { CommandConfig } from './subprocess-adapter.js';
import { isCallerInputCliError } from './cli-error-helpers.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import { codexMcpDisableArgs, scanCodexMcpServers } from './codex-mcp-isolation.js';
import { openCodeReadOnlyConfigContent, scanOpenCodeMcpServers } from './opencode-mcp-isolation.js';

class CodexProbe extends CodexCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
}
class OpenCodeProbe extends OpenCodeCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
}

let root: string;
let home: string;
let project: string;
let cwd: string;

function write(path: string, text: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

function readOnly(): CliTask {
  return { content: 'review', accessMode: 'read-only-analysis', options: { workDir: cwd } };
}
function defaultMode(): CliTask {
  return { content: 'review', options: { workDir: cwd } };
}

/** Every `-c` value in `args` that addresses an MCP server. */
function mcpOverrides(args: readonly string[]): string[] {
  return args.filter((a, i) => args[i - 1] === '-c' && a.startsWith('mcp_servers.'));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nexus-6970-'));
  home = join(root, 'home');
  project = join(root, 'project');
  cwd = join(project, 'sub');
  mkdirSync(home, { recursive: true });
  mkdirSync(join(project, '.git'), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  vi.stubEnv('HOME', home);
  vi.stubEnv('XDG_CONFIG_HOME', '');
  vi.stubEnv('OPENCODE_CONFIG_CONTENT', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const USER_TOML = `
[mcp_servers.alpha]
command = "alpha-server"
[mcp_servers.alpha.tools.read]
[mcp_servers.beta]
url = "http://127.0.0.1:9/mcp"
`;

describe('codex exec: one disable per configured MCP server (#6970)', () => {
  it('no config file: no MCP override', () => {
    expect(mcpOverrides(new CodexProbe().command(readOnly()).args)).toEqual([]);
  });

  it('one user server: exactly one disable', () => {
    write(join(home, '.codex', 'config.toml'), '[mcp_servers.solo]\ncommand = "solo"\n');
    expect(mcpOverrides(new CodexProbe().command(readOnly()).args)).toEqual([
      'mcp_servers.solo.enabled=false',
    ]);
  });

  it('several user servers plus a project-only server', () => {
    write(join(home, '.codex', 'config.toml'), USER_TOML);
    // `alpha` again in the project: already defined by the user layer, so no
    // transport repeat. `projonly` exists only in the project layer, which
    // codex loads only when the project is trusted.
    write(
      join(project, '.codex', 'config.toml'),
      '[mcp_servers.alpha]\ncommand = "other"\n[mcp_servers.projonly]\ncommand = "p"\nargs = ["x"]\n'
    );
    expect(mcpOverrides(new CodexProbe().command(readOnly()).args).sort()).toEqual(
      [
        'mcp_servers.alpha.enabled=false',
        'mcp_servers.beta.enabled=false',
        'mcp_servers.projonly.enabled=false',
        'mcp_servers.projonly.command="p"',
      ].sort()
    );
  });

  it('a project config above the git root is not read', () => {
    write(join(root, '.codex', 'config.toml'), '[mcp_servers.outside]\ncommand = "o"\n');
    expect(mcpOverrides(new CodexProbe().command(readOnly()).args)).toEqual([]);
  });

  it('the overrides come before the prompt, which stays last', () => {
    write(join(home, '.codex', 'config.toml'), USER_TOML);
    const { args } = new CodexProbe().command(readOnly());
    expect(args.at(-1)).toBe('review');
    expect(args[args.length - 2]).not.toBe('-c');
  });

  it('a default-mode task is unchanged', () => {
    write(join(home, '.codex', 'config.toml'), USER_TOML);
    expect(mcpOverrides(new CodexProbe().command(defaultMode()).args)).toEqual([]);
  });

  it('an unparseable config refuses the task before any spawn', async () => {
    write(join(home, '.codex', 'config.toml'), '[mcp_servers.alpha\ncommand = ');
    const adapter = new CodexProbe({ sandboxProbe: () => ({ status: 'ok' }) });
    const spawnPath = vi.spyOn(adapter, 'executeTask');
    const result = await adapter.execute(readOnly(), { allowRetry: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/read-only analysis mode/);
    expect(result.error.message).toMatch(/config\.toml/);
    expect(isCallerInputCliError(result.error)).toBe(true);
    expect(spawnPath).not.toHaveBeenCalled();
  });

  it('an unparseable project config refuses too', async () => {
    write(join(project, '.codex', 'config.toml'), 'mcp_servers = 3');
    const adapter = new CodexProbe({ sandboxProbe: () => ({ status: 'ok' }) });
    const spawnPath = vi.spyOn(adapter, 'executeTask');
    const result = await adapter.execute(readOnly(), { allowRetry: false });
    expect(result.ok).toBe(false);
    expect(spawnPath).not.toHaveBeenCalled();
  });

  it('getCommand fails closed when the config breaks after the refusal check', () => {
    write(join(home, '.codex', 'config.toml'), 'not = [valid');
    expect(() => new CodexProbe().command(readOnly())).toThrow(/read-only analysis/);
  });
});

describe('scanCodexMcpServers', () => {
  it('reads CODEX_HOME in place of ~/.codex', () => {
    write(join(root, 'ch', 'config.toml'), '[mcp_servers.fromcodexhome]\ncommand = "c"\n');
    write(join(home, '.codex', 'config.toml'), '[mcp_servers.fromhome]\ncommand = "h"\n');
    const scan = scanCodexMcpServers(
      { env: { HOME: home, CODEX_HOME: join(root, 'ch') }, cwd },
      []
    );
    expect(scan.ok && scan.value.map((s) => s.name)).toEqual(['fromcodexhome']);
  });

  it('reads system config files', () => {
    const system = join(root, 'etc-codex.toml');
    write(system, '[mcp_servers.managed]\nurl = "http://x"\n');
    const scan = scanCodexMcpServers({ env: { HOME: home }, cwd }, [system]);
    expect(scan.ok && scan.value).toEqual([{ name: 'managed' }]);
  });

  it('refuses a server name codex -c cannot address', () => {
    write(join(home, '.codex', 'config.toml'), '[mcp_servers."a.b"]\ncommand = "x"\n');
    const scan = scanCodexMcpServers({ env: { HOME: home }, cwd }, []);
    expect(scan.ok).toBe(false);
  });

  it('honours project_root_markers from the user config', () => {
    write(join(home, '.codex', 'config.toml'), 'project_root_markers = ["MARK"]\n');
    write(join(project, 'sub', 'MARK'), '');
    write(join(project, '.codex', 'config.toml'), '[mcp_servers.aboveMark]\ncommand = "x"\n');
    const scan = scanCodexMcpServers({ env: { HOME: home }, cwd }, []);
    expect(scan.ok && scan.value).toEqual([]);
  });

  it('serializes a url transport as a TOML string', () => {
    expect(
      codexMcpDisableArgs([{ name: 'r', transport: { key: 'url', value: 'http://h/"q"' } }])
    ).toEqual(['-c', 'mcp_servers.r.enabled=false', '-c', 'mcp_servers.r.url="http://h/\\"q\\""']);
  });
});

/** The `mcp` map in a read-only opencode command's OPENCODE_CONFIG_CONTENT. */
function openCodeMcp(config: CommandConfig): unknown {
  const content = config.env?.['OPENCODE_CONFIG_CONTENT'];
  return content === undefined ? undefined : (JSON.parse(content) as { mcp?: unknown }).mcp;
}

describe('opencode: OPENCODE_CONFIG_CONTENT disables every configured MCP server (#6970)', () => {
  it('no config: only the permission env, no config content', () => {
    const { env } = new OpenCodeProbe().command(readOnly());
    expect(Object.keys(env ?? {})).toEqual(['OPENCODE_PERMISSION']);
  });

  it('global, project and .opencode servers are all disabled', () => {
    write(
      join(home, '.config', 'opencode', 'opencode.json'),
      '{"mcp":{"nexus-agents":{"type":"local","command":["n"],"enabled":true}}}'
    );
    write(
      join(project, 'opencode.jsonc'),
      '// c\n{"mcp":{"proj":{"type":"local","command":["p"]},},}'
    );
    write(join(cwd, '.opencode', 'opencode.json'), '{"mcp":{"dot":{"type":"remote","url":"u"}}}');
    const config = new OpenCodeProbe().command(readOnly());
    expect(config.env?.['OPENCODE_PERMISSION']).toBeDefined();
    expect(openCodeMcp(config)).toEqual({
      'nexus-agents': { enabled: false },
      proj: { enabled: false },
      dot: { enabled: false },
    });
  });

  it('merges with an inherited OPENCODE_CONFIG_CONTENT instead of replacing it', () => {
    vi.stubEnv('NEXUS_SUBPROCESS_EXTRA_ENV', 'OPENCODE_CONFIG_CONTENT');
    vi.stubEnv(
      'OPENCODE_CONFIG_CONTENT',
      '{"model":"m/x","mcp":{"inline":{"type":"local","command":["i"]}}}'
    );
    write(join(project, 'opencode.json'), '{"mcp":{"proj":{"type":"local","command":["p"]}}}');
    const content = JSON.parse(
      new OpenCodeProbe().command(readOnly()).env?.['OPENCODE_CONFIG_CONTENT'] ?? '{}'
    ) as Record<string, unknown>;
    expect(content['model']).toBe('m/x');
    expect(content['mcp']).toEqual({
      inline: { type: 'local', command: ['i'], enabled: false },
      proj: { enabled: false },
    });
  });

  it('a default-mode task is unchanged', () => {
    write(join(project, 'opencode.json'), '{"mcp":{"proj":{"type":"local","command":["p"]}}}');
    expect(new OpenCodeProbe().command(defaultMode()).env).toBeUndefined();
  });

  it('an unparseable config refuses the task before any spawn', async () => {
    write(join(project, 'opencode.json'), '{"mcp": {');
    const adapter = new OpenCodeProbe();
    const spawnPath = vi.spyOn(adapter, 'executeTask');
    const result = await adapter.execute(readOnly(), { allowRetry: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/read-only analysis mode/);
    expect(result.error.message).toMatch(/opencode\.json/);
    expect(isCallerInputCliError(result.error)).toBe(true);
    expect(spawnPath).not.toHaveBeenCalled();
  });

  it('getCommand fails closed when the config breaks after the refusal check', () => {
    write(join(project, 'opencode.json'), '[1,');
    expect(() => new OpenCodeProbe().command(readOnly())).toThrow(/read-only analysis/);
  });
});

describe('scanOpenCodeMcpServers', () => {
  it('reads OPENCODE_CONFIG and OPENCODE_CONFIG_DIR', () => {
    write(join(root, 'custom.json'), '{"mcp":{"custom":{}}}');
    write(join(root, 'ocdir', 'opencode.jsonc'), '{"mcp":{"ocdir":{}}}');
    const scan = scanOpenCodeMcpServers(
      {
        env: {
          HOME: home,
          OPENCODE_CONFIG: join(root, 'custom.json'),
          OPENCODE_CONFIG_DIR: join(root, 'ocdir'),
        },
        cwd,
      },
      []
    );
    expect(scan.ok && [...scan.value].sort()).toEqual(['custom', 'ocdir']);
  });

  it('reads managed config files and XDG_CONFIG_HOME', () => {
    write(join(root, 'managed.json'), '{"mcp":{"managed":{}}}');
    write(join(root, 'xdg', 'opencode', 'config.json'), '{"mcp":{"xdg":{}}}');
    const scan = scanOpenCodeMcpServers(
      { env: { HOME: home, XDG_CONFIG_HOME: join(root, 'xdg') }, cwd },
      [join(root, 'managed.json')]
    );
    expect(scan.ok && [...scan.value].sort()).toEqual(['managed', 'xdg']);
  });

  it('an mcp key that is not an object is an error, not zero servers', () => {
    write(join(project, 'opencode.json'), '{"mcp": []}');
    expect(scanOpenCodeMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(false);
  });

  it('an unparseable inherited OPENCODE_CONFIG_CONTENT is an error', () => {
    expect(openCodeReadOnlyConfigContent(['a'], '{').ok).toBe(false);
  });
});
