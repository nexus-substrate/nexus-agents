/**
 * Read-only analysis mode (#6754): each CLI adapter maps
 * `accessMode: 'read-only-analysis'` to its CLI's own enforcement, and an
 * adapter that cannot enforce the mode refuses the task instead of running
 * with its defaults.
 *
 * Every argv/env assertion is paired with the default-mode row, so a mapping
 * that is applied unconditionally (or never) fails one of the two.
 *
 * @module cli-adapters/read-only-analysis.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { Result } from '../core/index.js';
import { ok } from '../core/index.js';
import type {
  CliError,
  CliResponse,
  CliTask,
  ICliAdapter,
  ModelInfo,
  ResolvedExecutionOptions,
} from './types.js';
import { DEFAULT_CAPABILITIES } from './types.js';
import type { CommandConfig } from './subprocess-adapter.js';
import { BaseCliAdapter } from './base-adapter.js';
import { CliToModelAdapter } from './cli-to-model-adapter.js';
import { isCallerInputCliError } from './cli-error-helpers.js';
import { readOnlyAnalysisRefusal } from './read-only-analysis.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { CodexMcpAdapter } from './adapters/codex-mcp-adapter.js';

const READ_ONLY: CliTask = { content: 'review this', accessMode: 'read-only-analysis' };
const DEFAULT_MODE: CliTask = { content: 'review this' };

class ClaudeProbe extends ClaudeCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
}
class OpenCodeProbe extends OpenCodeCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
}
class GeminiProbe extends GeminiCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
}
class CodexProbe extends CodexCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
}

/** The value following `flag` in `args`, or undefined. */
function flagValue(args: readonly string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe('claude maps read-only analysis to disallowed tools (#6754)', () => {
  it('offers only the read tools, loads no MCP server, and pins the permission mode', () => {
    const { args, env } = new ClaudeProbe().command(READ_ONLY);
    expect(flagValue(args, '--tools')).toBe('Read,Grep,Glob');
    expect(args).toContain('--strict-mcp-config');
    expect(flagValue(args, '--permission-mode')).toBe('manual');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(env).toBeUndefined();
  });

  it('the allow list is exactly the read tools — no network, command or write tool', () => {
    const allowed = flagValue(new ClaudeProbe().command(READ_ONLY).args, '--tools')?.split(',');
    expect(allowed?.sort()).toEqual(['Glob', 'Grep', 'Read']);
  });

  it('also denies command, write and network tools, WebSearch included', () => {
    const { args } = new ClaudeProbe().command(READ_ONLY);
    const denied = flagValue(args, '--disallowedTools')?.split(',') ?? [];
    expect(denied.sort()).toEqual(
      ['Bash', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Write'].sort()
    );
  });

  it('the default mode carries none of the flags', () => {
    const { args } = new ClaudeProbe().command(DEFAULT_MODE);
    expect(args).not.toContain('--tools');
    expect(args).not.toContain('--strict-mcp-config');
    expect(args).not.toContain('--disallowedTools');
    expect(args).not.toContain('--permission-mode');
  });

  it('refuses a read-only task that also names an MCP config', async () => {
    const adapter = new ClaudeProbe();
    const spawnPath = vi.spyOn(adapter, 'executeTask');
    const result = await adapter.execute({
      ...READ_ONLY,
      options: { mcpConfigPath: '/tmp/mcp.json' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/MCP config/);
    expect(spawnPath).not.toHaveBeenCalled();
  });

  it('refuses a read-only task that also asks to skip permissions, before spawning', async () => {
    const adapter = new ClaudeProbe();
    const spawnPath = vi.spyOn(adapter, 'executeTask');
    const result = await adapter.execute({
      ...READ_ONLY,
      options: { skipPermissions: true },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/read-only analysis mode/);
    expect(result.error.message).toMatch(/skip permissions/);
    expect(isCallerInputCliError(result.error)).toBe(true);
    expect(spawnPath).not.toHaveBeenCalled();
  });

  it('skipPermissions still works in the default mode (implement tasks unchanged)', () => {
    const { args } = new ClaudeProbe().command({
      ...DEFAULT_MODE,
      options: { skipPermissions: true },
    });
    expect(args).toContain('--dangerously-skip-permissions');
  });
});

describe('opencode maps read-only analysis to an OPENCODE_PERMISSION deny config (#6754)', () => {
  it('sets the deny config in the child env', () => {
    const { env } = new OpenCodeProbe().command(READ_ONLY);
    expect(Object.keys(env ?? {})).toEqual(['OPENCODE_PERMISSION']);
    const permission = JSON.parse(env?.['OPENCODE_PERMISSION'] ?? 'null') as unknown;
    expect(permission).toEqual({ bash: 'deny', edit: 'deny', webfetch: 'deny' });
  });

  it('the default mode sets no env', () => {
    expect(new OpenCodeProbe().command(DEFAULT_MODE).env).toBeUndefined();
  });
});

describe('gemini (agy) maps read-only analysis to plan mode in a sandbox (#6754)', () => {
  it('adds --mode plan and --sandbox, before the --print prompt', () => {
    const { args } = new GeminiProbe().command(READ_ONLY);
    expect(flagValue(args, '--mode')).toBe('plan');
    expect(args).toContain('--sandbox');
    expect(args.indexOf('--sandbox')).toBeLessThan(args.indexOf('--print'));
  });

  it('the default mode carries neither flag', () => {
    const { args } = new GeminiProbe().command(DEFAULT_MODE);
    expect(args).not.toContain('--mode');
    expect(args).not.toContain('--sandbox');
  });

  it('executeWithMetadata applies the refusal too (it bypasses the base execute)', async () => {
    const adapter = new GeminiProbe();
    Object.defineProperty(adapter, 'enforcesReadOnlyAnalysis', { value: false });
    const result = await adapter.executeWithMetadata(READ_ONLY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/cannot enforce/);
  });
});

describe('codex runs every exec in the read-only sandbox (#6754)', () => {
  it('passes -s read-only under read-only analysis mode', () => {
    expect(flagValue(new CodexProbe().command(READ_ONLY).args, '-s')).toBe('read-only');
  });

  it('declares enforcement', () => {
    expect(new CodexProbe().enforcesReadOnlyAnalysis).toBe(true);
    expect(new CodexMcpAdapter().enforcesReadOnlyAnalysis).toBe(true);
  });

  it('codex-mcp refuses a read-only task that continues a session', async () => {
    const adapter = new CodexMcpAdapter();
    const connect = vi.spyOn(adapter, 'initialize');
    const result = await adapter.execute({ ...READ_ONLY, sessionId: 'thread-1' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/continued codex session/);
    expect(connect).not.toHaveBeenCalled();
  });
});

/** A CLI adapter that implements nothing about the mode — a new adapter's starting point. */
class UndeclaredAdapter extends BaseCliAdapter {
  readonly name = 'opencode' as const;
  readonly transport = 'subprocess' as const;
  readonly executeTaskSpy = vi.fn();
  executeTask(
    task: CliTask,
    _options: ResolvedExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    this.executeTaskSpy(task);
    return Promise.resolve(ok({ text: 'ran' }));
  }
  getModelInfo(): ModelInfo {
    return {
      id: 'm',
      name: 'm',
      contextWindow: 1,
      maxOutput: 1,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    };
  }
  initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }
  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

describe('an adapter that does not declare enforcement fails closed (#6754)', () => {
  it('BaseCliAdapter refuses the read-only task and never reaches executeTask', async () => {
    const adapter = new UndeclaredAdapter();
    const result = await adapter.execute(READ_ONLY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/cannot enforce/);
    expect(adapter.executeTaskSpy).not.toHaveBeenCalled();
  });

  it('the same adapter still runs a default-mode task', async () => {
    const adapter = new UndeclaredAdapter();
    const result = await adapter.execute(DEFAULT_MODE);
    expect(result.ok).toBe(true);
    expect(adapter.executeTaskSpy).toHaveBeenCalledTimes(1);
  });

  it('readOnlyAnalysisRefusal passes only an explicit true', () => {
    expect(readOnlyAnalysisRefusal({ name: 'claude' }, READ_ONLY)).toBeDefined();
    expect(
      readOnlyAnalysisRefusal({ name: 'claude', enforcesReadOnlyAnalysis: false }, READ_ONLY)
    ).toBeDefined();
    expect(
      readOnlyAnalysisRefusal({ name: 'claude', enforcesReadOnlyAnalysis: true }, READ_ONLY)
    ).toBeUndefined();
    expect(readOnlyAnalysisRefusal({ name: 'claude' }, DEFAULT_MODE)).toBeUndefined();
  });
});

/** A bare ICliAdapter (not a BaseCliAdapter) that records the task it is handed. */
function bareCliAdapter(enforces: boolean | undefined): {
  adapter: ICliAdapter;
  tasks: CliTask[];
} {
  const tasks: CliTask[] = [];
  const adapter: ICliAdapter = {
    name: 'claude',
    transport: 'subprocess',
    capabilities: DEFAULT_CAPABILITIES.claude,
    ...(enforces !== undefined ? { enforcesReadOnlyAnalysis: enforces } : {}),
    execute: (task: CliTask) => {
      tasks.push(task);
      return Promise.resolve(ok({ text: 'answer' }));
    },
    healthCheck: vi.fn(),
    getCapacity: vi.fn(),
    getVersion: vi.fn(),
    getModelInfo: () => ({
      id: 'm',
      name: 'm',
      contextWindow: 1,
      maxOutput: 1,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    }),
    initialize: vi.fn(),
    dispose: vi.fn(),
  };
  return { adapter, tasks };
}

const REQUEST = {
  messages: [{ role: 'user' as const, content: 'review this' }],
  accessMode: 'read-only-analysis' as const,
};

describe('the CLI→model bridge forwards the mode and fails closed (#6754)', () => {
  it('forwards accessMode onto the CliTask for an enforcing adapter', async () => {
    const { adapter, tasks } = bareCliAdapter(true);
    const result = await new CliToModelAdapter(adapter).complete(REQUEST);
    expect(result.ok).toBe(true);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.accessMode).toBe('read-only-analysis');
  });

  it('refuses without calling execute when the adapter declares nothing', async () => {
    const { adapter, tasks } = bareCliAdapter(undefined);
    const result = await new CliToModelAdapter(adapter).complete(REQUEST);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/cannot enforce/);
    expect(tasks).toHaveLength(0);
  });

  it('a default-mode request carries no accessMode and runs on any adapter', async () => {
    const { adapter, tasks } = bareCliAdapter(undefined);
    const result = await new CliToModelAdapter(adapter).complete({
      messages: REQUEST.messages,
    });
    expect(result.ok).toBe(true);
    expect(tasks[0]).not.toHaveProperty('accessMode');
  });
});

/**
 * The child the subprocess adapter really spawns prints the permission config
 * it received, in opencode's NDJSON text shape, so the whole path — getCommand
 * env → spawn env — is measured, not just the command config.
 */
const PRINT_PERMISSION =
  'const v = process.env.OPENCODE_PERMISSION ?? "UNSET";' +
  'process.stdout.write(JSON.stringify({type:"text",sessionID:"s",part:{type:"text",text:v}}) + "\\n");';

class OpenCodeSpawnProbe extends OpenCodeCliAdapter {
  override initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }
  protected override getCommand(task: CliTask): CommandConfig {
    const real = super.getCommand(task);
    return { ...real, command: process.execPath, args: ['-e', PRINT_PERMISSION] };
  }
}

/** Run `body` with the named env vars set, restoring their previous values after. */
async function withEnv(vars: Record<string, string>, body: () => Promise<void>): Promise<void> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    await body();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = v;
    }
  }
}

describe('the spawned child receives the command env (#6754)', () => {
  // `false` is the full-passthrough hatch: the inherited allow-all value DOES
  // reach buildChildEnv there, so only the merge order keeps the deny config.
  it.each(['true', 'false'])(
    'a read-only opencode task spawns with the deny config over an inherited allow-all (allowlist=%s)',
    async (allowlist) => {
      await withEnv(
        {
          NEXUS_SUBPROCESS_ENV_ALLOWLIST: allowlist,
          OPENCODE_PERMISSION: JSON.stringify({ bash: 'allow', edit: 'allow', webfetch: 'allow' }),
        },
        async () => {
          const result = await new OpenCodeSpawnProbe().execute(READ_ONLY, { allowRetry: false });
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(JSON.parse(result.value.text)).toEqual({
            bash: 'deny',
            edit: 'deny',
            webfetch: 'deny',
          });
        }
      );
    }
  );

  it('the inherited value does reach the child under passthrough in the default mode (control)', async () => {
    await withEnv(
      { NEXUS_SUBPROCESS_ENV_ALLOWLIST: 'false', OPENCODE_PERMISSION: '{"bash":"allow"}' },
      async () => {
        const result = await new OpenCodeSpawnProbe().execute(DEFAULT_MODE, { allowRetry: false });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.text).toBe('{"bash":"allow"}');
      }
    );
  });

  it('a default-mode opencode task spawns without it', async () => {
    const result = await new OpenCodeSpawnProbe().execute(DEFAULT_MODE, { allowRetry: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).not.toContain('deny');
  });
});
