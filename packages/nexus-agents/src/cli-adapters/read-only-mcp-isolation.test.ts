/**
 * Read-only analysis disables every configured MCP server (#6970).
 *
 * Observed live 2026-10-02: codex `exec -s read-only` started the
 * nexus-agents MCP server from the user's own CLI config, and that server
 * wrote `.gitignore` and `.nexus-agents/` into the tree. The codex adapters
 * now read every config codex would load and disable each server by name,
 * and refuse the task when a config cannot be read. (opencode refuses
 * read-only analysis outright, #6979.)
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
import { codexMcpDisableArgs, scanCodexMcpServers } from './codex-mcp-isolation.js';
import { MAX_CONFIG_BYTES, readConfigIfPresent } from './mcp-config-scan.js';

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
  vi.stubEnv('CODEX_HOME', '');
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
        'mcp_servers.projonly.command="nexus-agents-disabled-mcp-server"',
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

  it('repeats a url transport as the placeholder url, a TOML string', () => {
    expect(codexMcpDisableArgs([{ name: 'r', transportKey: 'url' }])).toEqual([
      '-c',
      'mcp_servers.r.enabled=false',
      '-c',
      'mcp_servers.r.url="http://disabled.invalid/"',
    ]);
  });
});

describe('codex: no project-only server value reaches the argv (#6978)', () => {
  // codex rejects a disable for a server no loaded layer defines, so the
  // override repeats the transport KEY. Its VALUE is a placeholder: the
  // configured url/command, args and env may carry credentials, and argv is
  // readable by other local users via ps and /proc.
  const SECRETS = ['URLSECRET123', 'userpass', 'ARGSECRET', 'ENVSECRET999', 'secret-cmd'];
  const PROJECT_TOML = `
[mcp_servers.tokensrv]
url = "https://user:userpass@host.example/mcp?token=URLSECRET123"
[mcp_servers.cmdsrv]
command = "/opt/secret-cmd"
args = ["--key", "ARGSECRET"]
env = { API_KEY = "ENVSECRET999" }
`;

  it('the codex exec argv carries none of the configured values', () => {
    write(join(project, '.codex', 'config.toml'), PROJECT_TOML);
    const { args } = new CodexProbe().command(readOnly());
    const argv = args.join(' ');
    for (const secret of SECRETS) expect(argv).not.toContain(secret);
    expect(mcpOverrides(args).sort()).toEqual(
      [
        'mcp_servers.cmdsrv.enabled=false',
        'mcp_servers.cmdsrv.command="nexus-agents-disabled-mcp-server"',
        'mcp_servers.tokensrv.enabled=false',
        'mcp_servers.tokensrv.url="http://disabled.invalid/"',
      ].sort()
    );
  });

  it('the scan result itself holds no configured value', () => {
    write(join(project, '.codex', 'config.toml'), PROJECT_TOML);
    const scan = scanCodexMcpServers({ env: { HOME: home }, cwd }, []);
    expect(scan.ok).toBe(true);
    const dump = JSON.stringify(scan.ok ? scan.value : null);
    for (const secret of SECRETS) expect(dump).not.toContain(secret);
  });
});

/** Run a read-only task and return its refusal message, asserting no spawn. */
async function refusalOf(adapter: CodexProbe): Promise<string> {
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

  it('a plugin root is not walked below its declarations (deep skills stay allowed)', () => {
    write(join(pluginDir(), '.codex-plugin', 'plugin.json'), '{"name":"sites"}');
    write(join(pluginDir(), 'skills', 'a', 'b', 'c', 'd', 'e', 'f', 'SKILL.md'), 'x');
    expect(scanCodexMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(true);
  });

  it('a tree deeper than the walk bound with no plugin root is refused, not "no MCP"', () => {
    // A declaration below this point would go unseen, so the walk refuses.
    const deep = join(home, '.codex', 'plugins', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
    write(join(deep, 'README.md'), 'x');
    const scan = scanCodexMcpServers({ env: { HOME: home }, cwd }, []);
    expect(!scan.ok && scan.error).toMatch(/deeper than 6 levels/);
  });

  it('a tree at the walk bound is still read to its plugin root', () => {
    const atBound = join(home, '.codex', 'plugins', 'a', 'b', 'c', 'd', 'e', 'f');
    write(join(atBound, '.mcp.json'), '{"mcpServers":{}}');
    const scan = scanCodexMcpServers({ env: { HOME: home }, cwd }, []);
    expect(!scan.ok && scan.error).toMatch(/installed plugin declares/);
  });

  it('a symlink loop in the plugin tree is refused', () => {
    const loopDir = join(home, '.codex', 'plugins', 'cache', 'market');
    mkdirSync(loopDir, { recursive: true });
    symlinkSync(loopDir, join(loopDir, 'again'));
    const scan = scanCodexMcpServers({ env: { HOME: home }, cwd }, []);
    expect(!scan.ok && scan.error).toMatch(/symlink loop/);
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
    mkdirSync(join(project, '.codex'), { recursive: true });
    symlinkSync(fifo, join(project, '.codex', 'config.toml'));
    expect(scanCodexMcpServers({ env: { HOME: home }, cwd }, []).ok).toBe(false);
  });
});
