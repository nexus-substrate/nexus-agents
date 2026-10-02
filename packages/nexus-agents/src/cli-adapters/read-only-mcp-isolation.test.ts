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

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliTask } from './types.js';
import type { CommandConfig } from './subprocess-adapter.js';
import { isCallerInputCliError } from './cli-error-helpers.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import { codexMcpDisableArgs, scanCodexMcpServers } from './codex-mcp-isolation.js';
import { MAX_CONFIG_BYTES, readConfigIfPresent } from './mcp-config-scan.js';
import { openCodeReadOnlyConfigContent, scanOpenCodeMcpServers } from './opencode-mcp-isolation.js';

/** System config files the probes scan; tests never read the host's /etc. */
let systemFiles: readonly string[] = [];

class CodexProbe extends CodexCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
  protected override codexSystemConfigFiles(): readonly string[] {
    return systemFiles;
  }
}
class OpenCodeProbe extends OpenCodeCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
  protected override openCodeManagedConfigFiles(): readonly string[] {
    return systemFiles;
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
  systemFiles = [];
  vi.stubEnv('HOME', home);
  vi.stubEnv('XDG_CONFIG_HOME', '');
  vi.stubEnv('XDG_DATA_HOME', '');
  vi.stubEnv('OPENCODE_CONFIG_CONTENT', '');
  vi.stubEnv('OPENCODE_AUTH_CONTENT', '');
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

/** Run a read-only task and return its refusal message, asserting no spawn. */
async function refusalOf(adapter: CodexProbe | OpenCodeProbe): Promise<string> {
  const spawnPath = vi.spyOn(adapter, 'executeTask');
  const result = await adapter.execute(readOnly(), { allowRetry: false });
  expect(spawnPath).not.toHaveBeenCalled();
  expect(result.ok).toBe(false);
  if (result.ok) return '';
  expect(result.error.message).toMatch(/read-only analysis mode/);
  return result.error.message;
}

describe('the probes never read the host system config (#6970)', () => {
  it('codex scans exactly the injected system files', () => {
    const system = join(root, 'injected.toml');
    write(system, '[mcp_servers.injected]\ncommand = "i"\n');
    systemFiles = [system];
    expect(mcpOverrides(new CodexProbe().command(readOnly()).args)).toEqual([
      'mcp_servers.injected.enabled=false',
    ]);
  });

  it('opencode scans exactly the injected managed files', () => {
    const managed = join(root, 'managed.json');
    write(managed, '{"mcp":{"injected":{}}}');
    systemFiles = [managed];
    expect(openCodeMcp(new OpenCodeProbe().command(readOnly()))).toEqual({
      injected: { enabled: false },
    });
  });
});

describe('opencode: substituted keys fail closed (#6970)', () => {
  it('the {file:} key repro: a project-root key resolving differently from sub/ is refused', async () => {
    // opencode resolves {file:./n.txt} against the config file's directory
    // (root: "zz"), but against the cwd inside OPENCODE_CONFIG_CONTENT
    // (sub/: "other"), so disabling the raw name left "zz" running.
    write(
      join(project, 'opencode.json'),
      '{"mcp":{"{file:./n.txt}":{"type":"local","command":["true"]}}}'
    );
    write(join(project, 'n.txt'), 'zz');
    write(join(cwd, 'n.txt'), 'other');
    expect(await refusalOf(new OpenCodeProbe())).toMatch(/\{file:\.\/n\.txt\}/);
    expect(() => new OpenCodeProbe().command(readOnly())).toThrow(/substitution/);
  });

  it('an {env:} server name is refused', () => {
    write(join(project, 'opencode.json'), '{"mcp":{"{env:SRV}":{"type":"local","command":["x"]}}}');
    expect(scanOpenCodeMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(false);
  });

  it('a substituted key that could produce "mcp" itself is refused', () => {
    write(join(project, 'opencode.json'), '{"{env:KEY}":{"srv":{"type":"local","command":["x"]}}}');
    expect(scanOpenCodeMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(false);
  });

  it('an inherited OPENCODE_CONFIG_CONTENT with a substituted name is refused', () => {
    const scan = scanOpenCodeMcpServers(
      { env: { HOME: home, OPENCODE_CONFIG_CONTENT: '{"mcp":{"{file:x}":{}}}' }, cwd },
      []
    );
    expect(scan.ok).toBe(false);
  });

  it('substitution in a VALUE is not refused: it cannot rename a server', () => {
    write(
      join(project, 'opencode.json'),
      '{"mcp":{"srv":{"type":"remote","url":"{env:URL}","headers":{"a":"{file:./t}"}}}}'
    );
    const scan = scanOpenCodeMcpServers({ env: { HOME: home }, cwd }, []);
    expect(scan.ok && scan.value).toEqual(['srv']);
  });
});

describe('opencode: JSONC config is parsed like opencode parses it (#6970)', () => {
  it('line and block comments and trailing commas', () => {
    write(
      join(project, 'opencode.jsonc'),
      [
        '// leading comment',
        '{',
        '  /* block */ "mcp": {',
        '    "one": { "type": "local", "command": ["a",], }, // trailing',
        '    "two": { "type": "remote", "url": "u" },',
        '  },',
        '}',
      ].join('\n')
    );
    const scan = scanOpenCodeMcpServers({ env: { HOME: home }, cwd }, []);
    expect(scan.ok && [...scan.value].sort()).toEqual(['one', 'two']);
  });
});

describe('opencode: a wellknown remote config source fails closed (#6970)', () => {
  const WELLKNOWN = '{"https://corp.example":{"type":"wellknown","key":"K","token":"t"}}';
  const authFile = (): string => join(home, '.local', 'share', 'opencode', 'auth.json');

  it('a wellknown credential in auth.json refuses the task', async () => {
    write(authFile(), WELLKNOWN);
    expect(await refusalOf(new OpenCodeProbe())).toMatch(/wellknown/);
  });

  it('an api credential is not refused', () => {
    write(authFile(), '{"openrouter":{"type":"api","key":"k"}}');
    expect(scanOpenCodeMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(true);
  });

  it('a v2 account.json with a nested wellknown credential is refused', () => {
    write(
      join(home, '.local', 'share', 'opencode', 'account.json'),
      '{"version":2,"accounts":{"a":{"credential":{"type":"wellknown","key":"K","token":"t"}}}}'
    );
    expect(scanOpenCodeMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(false);
  });

  it('honours XDG_DATA_HOME', () => {
    write(join(root, 'data', 'opencode', 'auth.json'), WELLKNOWN);
    const scan = scanOpenCodeMcpServers(
      { env: { HOME: home, XDG_DATA_HOME: join(root, 'data') }, cwd },
      []
    );
    expect(scan.ok).toBe(false);
  });

  it('OPENCODE_AUTH_CONTENT replaces the file, as opencode reads it', () => {
    write(authFile(), WELLKNOWN);
    const env = { HOME: home, OPENCODE_AUTH_CONTENT: '{"p":{"type":"api","key":"k"}}' };
    expect(scanOpenCodeMcpServers({ env, cwd }, []).ok).toBe(true);
    const inline = { HOME: home, OPENCODE_AUTH_CONTENT: WELLKNOWN };
    expect(scanOpenCodeMcpServers({ env: inline, cwd }, []).ok).toBe(false);
  });

  it('an unparseable auth.json is refused: a credential cannot be ruled out', () => {
    write(authFile(), '{"x":');
    expect(scanOpenCodeMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(false);
  });
});

describe('codex: plugin and cloud-managed MCP sources fail closed (#6970)', () => {
  const pluginDir = (): string =>
    join(home, '.codex', 'plugins', 'cache', 'market', 'plug', '1.0.0');

  it('an enabled plugins entry refuses the task', async () => {
    write(join(home, '.codex', 'config.toml'), '[plugins."plug@market"]\nenabled = true\n');
    expect(await refusalOf(new CodexProbe({ sandboxProbe: () => ({ status: 'ok' }) }))).toMatch(
      /plugin "plug@market"/
    );
  });

  it('a plugins entry set enabled = false is not refused', () => {
    write(join(home, '.codex', 'config.toml'), '[plugins."plug@market"]\nenabled = false\n');
    expect(scanCodexMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(true);
  });

  it('an installed plugin with a .mcp.json is refused', () => {
    write(join(pluginDir(), '.mcp.json'), '{"mcpServers":{}}');
    const scan = scanCodexMcpServers({ env: { HOME: home }, cwd }, []);
    expect(!scan.ok && scan.error).toMatch(/\.mcp\.json/);
  });

  it('a plugin manifest declaring mcpServers is refused', () => {
    write(
      join(pluginDir(), '.claude-plugin', 'plugin.json'),
      '{"name":"p","mcpServers":"./m.json"}'
    );
    expect(scanCodexMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(false);
  });

  it('a skills-and-apps plugin (the shape installed on the dev host) is not refused', () => {
    write(
      join(pluginDir(), '.codex-plugin', 'plugin.json'),
      '{"name":"sites","skills":"./skills/","apps":"./.app.json"}'
    );
    write(join(pluginDir(), '.app.json'), '{"apps":{}}');
    expect(scanCodexMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(true);
  });

  it('an unparseable plugin manifest is refused', () => {
    write(join(pluginDir(), '.codex-plugin', 'plugin.json'), '{');
    expect(scanCodexMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(false);
  });

  it('a cached cloud-managed config bundle is refused, under CODEX_HOME', () => {
    write(join(root, 'ch', 'cloud-config-bundle-cache.json'), '{}');
    const scan = scanCodexMcpServers(
      { env: { HOME: home, CODEX_HOME: join(root, 'ch') }, cwd },
      []
    );
    expect(!scan.ok && scan.error).toMatch(/cloud-managed/);
  });
});

describe('readConfigIfPresent: only a bounded regular file is read (#6970)', () => {
  it('a missing file is undefined', () => {
    expect(readConfigIfPresent(join(root, 'absent'))).toEqual({ ok: true, value: undefined });
  });

  it('a file of exactly the cap is read', () => {
    const path = join(root, 'cap.toml');
    writeFileSync(path, 'a'.repeat(MAX_CONFIG_BYTES));
    const read = readConfigIfPresent(path);
    expect(read.ok && read.value?.length).toBe(MAX_CONFIG_BYTES);
  });

  it('a file one byte over the cap is refused', () => {
    const path = join(root, 'big.toml');
    writeFileSync(path, 'a'.repeat(MAX_CONFIG_BYTES + 1));
    const read = readConfigIfPresent(path);
    expect(!read.ok && read.error).toMatch(/larger than/);
  });

  it('a directory in place of the file is refused', () => {
    mkdirSync(join(root, 'dir.toml'));
    expect(readConfigIfPresent(join(root, 'dir.toml')).ok).toBe(false);
  });

  it.skipIf(!existsSync('/dev/zero'))(
    'a committed symlink to /dev/zero refuses the codex task without hanging',
    async () => {
      mkdirSync(join(project, '.codex'), { recursive: true });
      symlinkSync('/dev/zero', join(project, '.codex', 'config.toml'));
      const message = await refusalOf(new CodexProbe({ sandboxProbe: () => ({ status: 'ok' }) }));
      expect(message).toMatch(/not a regular file/);
    }
  );

  const mkfifo = ((): boolean => {
    try {
      execFileSync('mkfifo', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  // Node's fs has no mkfifo; the coreutils binary is the portable way to make one.
  it.skipIf(!mkfifo)('a FIFO (symlinked or not) is refused without blocking', () => {
    const fifo = join(root, 'fifo');
    execFileSync('mkfifo', [fifo]);
    expect(readConfigIfPresent(fifo)).toMatchObject({ ok: false });
    symlinkSync(fifo, join(project, 'opencode.json'));
    expect(scanOpenCodeMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(false);
  });
});
