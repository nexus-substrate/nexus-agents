/**
 * Every hook command `setup` installs must run (#6679).
 *
 * `generateHookConfig()` installs `hooks pre-tool --tool Bash --validate`,
 * `hooks post-tool --track-metrics` and `hooks stop --check-tasks`. The strict
 * global parser rejected those router-owned flags, so each installed hook
 * exited 3 on every call. This drives each installed string exactly as Claude
 * Code would: argv through the REAL `parseCliArgs`, then `handleHooksCommand`
 * into the hook router, with the event JSON on stdin.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { parseCliArgs } from '../../cli.js';
import { handleHooksCommand } from '../../cli-commands-handlers.js';
import { generateHookConfig } from '../setup-mcp.js';

/** Thrown by the `process.exit` double so the exit code can be read. */
class ExitCalled extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

const BASE = {
  session_id: 's-6679',
  transcript_path: '/tmp/t.jsonl',
  cwd: '/tmp',
  permission_mode: 'default',
};

/** One stdin payload per event, shaped like Claude Code's hook input. */
const PAYLOADS: Readonly<Record<string, Record<string, unknown>>> = {
  SessionStart: { ...BASE, hook_event_name: 'SessionStart', source: 'startup' },
  PreToolUse: {
    ...BASE,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
    tool_use_id: 'tu-1',
  },
  PostToolUse: {
    ...BASE,
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
    tool_response: { stdout: 'ok' },
    tool_use_id: 'tu-1',
  },
  Stop: { ...BASE, hook_event_name: 'Stop', stop_hook_active: false },
};

interface InstalledHook {
  readonly event: string;
  readonly command: string;
}

function installedHooks(): InstalledHook[] {
  const out: InstalledHook[] = [];
  for (const [event, entries] of Object.entries(generateHookConfig().hooks)) {
    for (const entry of entries ?? []) {
      for (const hook of entry.hooks) out.push({ event, command: hook.command });
    }
  }
  return out;
}

/** argv as the shell hands it to the binary: the command string minus the program name. */
function argvOf(command: string): string[] {
  const [program, ...rest] = command.split(/\s+/);
  expect(program).toBe('nexus-agents');
  return rest;
}

describe('setup-installed hook commands (#6679)', () => {
  const hooks = installedHooks();
  let dir: string;
  let savedStdin: typeof process.stdin;
  let exitSpy: MockInstance;
  let stdoutSpy: MockInstance;
  let stderr: string[];
  let stderrSpy: MockInstance;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'installed-hooks-'));
    vi.stubEnv('NEXUS_DATA_DIR', dir);
    vi.stubEnv('NEXUS_SESSIONS_DB', join(dir, 'sessions.db'));
    savedStdin = process.stdin;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ExitCalled(typeof code === 'number' ? code : undefined);
    });
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = [];
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: savedStdin, writable: true });
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('installs at least the four hook events this test has payloads for', () => {
    expect(hooks.map((h) => h.event).sort()).toEqual(Object.keys(PAYLOADS).sort());
  });

  it.each(installedHooks().map((h) => [h.command, h] as const))(
    '%s parses and exits 0',
    async (_label, hook) => {
      const payload = PAYLOADS[hook.event];
      expect(payload).toBeDefined();
      Object.defineProperty(process, 'stdin', {
        value: Readable.from([JSON.stringify(payload)]),
        writable: true,
      });

      const parsed = parseCliArgs(argvOf(hook.command));
      // The router, not the global parser, owns the hook flags: they reach it verbatim.
      expect(parsed.command).toBe('hooks');
      expect(parsed.positionals).toEqual(argvOf(hook.command));

      let exitCode: number | undefined;
      try {
        await handleHooksCommand(parsed);
      } catch (caught) {
        if (!(caught instanceof ExitCalled)) throw caught;
        exitCode = caught.code;
      }
      // stderr carries the handlers' info logs; it is the diagnostic on failure.
      expect(exitCode, stderr.join('')).toBe(0);
    }
  );

  it('keeps per-command help reachable', () => {
    const parsed = parseCliArgs(['hooks', 'post-tool', '--help']);
    expect(parsed.options.help).toBe(true);
    expect(parsed.command).toBe('hooks');
  });
});
