/**
 * Workspace-edit mode (#6792): an implement expert may read, and edit files
 * inside its working directory, but may not run commands, fetch from the
 * network or load MCP servers. The claude adapter maps the mode to
 * `--permission-mode acceptEdits` plus a tool allow list; every other CLI
 * adapter refuses the task, because none of them declares the mode. A
 * direct-API arm runs nothing on the host, so it satisfies the mode by
 * construction.
 *
 * Every argv assertion is paired with the default-mode row, so a mapping that
 * is applied unconditionally (or never) fails one of the two.
 *
 * @module cli-adapters/workspace-edit.test
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
import { unenforcedAccessModeRefusal } from './access-mode.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { CodexMcpAdapter } from './adapters/codex-mcp-adapter.js';

const WORKSPACE_EDIT: CliTask = { content: 'implement this', accessMode: 'workspace-edit' };
const DEFAULT_MODE: CliTask = { content: 'implement this' };

class ClaudeProbe extends ClaudeCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
}

/** The value following `flag` in `args`, or undefined. */
function flagValue(args: readonly string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe('claude maps workspace-edit to acceptEdits with a tool allow list (#6792)', () => {
  it('pins acceptEdits, loads no MCP server, and never skips permissions', () => {
    const { args, env } = new ClaudeProbe().command(WORKSPACE_EDIT);
    expect(flagValue(args, '--permission-mode')).toBe('acceptEdits');
    expect(args).toContain('--strict-mcp-config');
    expect(args).not.toContain('--mcp-config');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(env).toBeUndefined();
  });

  it('the allow list is exactly the read and edit tools — no command or network tool', () => {
    const allowed = flagValue(new ClaudeProbe().command(WORKSPACE_EDIT).args, '--tools');
    expect(allowed?.split(',').sort()).toEqual(['Edit', 'Glob', 'Grep', 'Read', 'Write']);
  });

  it('also denies command and network tools, WebSearch included', () => {
    const denied = flagValue(new ClaudeProbe().command(WORKSPACE_EDIT).args, '--disallowedTools');
    expect(denied?.split(',').sort()).toEqual(
      ['Bash', 'NotebookEdit', 'WebFetch', 'WebSearch'].sort()
    );
  });

  it('keeps the workDir as the only added directory', () => {
    const { args } = new ClaudeProbe().command({
      ...WORKSPACE_EDIT,
      options: { workDir: '/repo/checkout' },
    });
    expect(args.filter((a) => a === '--add-dir')).toHaveLength(1);
    expect(flagValue(args, '--add-dir')).toBe('/repo/checkout');
  });

  it('the default mode carries none of the flags', () => {
    const { args } = new ClaudeProbe().command(DEFAULT_MODE);
    expect(args).not.toContain('--tools');
    expect(args).not.toContain('--strict-mcp-config');
    expect(args).not.toContain('--disallowedTools');
    expect(args).not.toContain('--permission-mode');
  });

  it('declares the mode', () => {
    expect(new ClaudeProbe().enforcesWorkspaceEdit).toBe(true);
  });

  it('refuses a workspace-edit task that also asks to skip permissions, before spawning', async () => {
    const adapter = new ClaudeProbe();
    const spawnPath = vi.spyOn(adapter, 'executeTask');
    const result = await adapter.execute({ ...WORKSPACE_EDIT, options: { skipPermissions: true } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/workspace-edit mode/);
    expect(result.error.message).toMatch(/skip permissions/);
    expect(isCallerInputCliError(result.error)).toBe(true);
    expect(spawnPath).not.toHaveBeenCalled();
  });

  it('refuses a workspace-edit task that also names an MCP config, before spawning', async () => {
    const adapter = new ClaudeProbe();
    const spawnPath = vi.spyOn(adapter, 'executeTask');
    const result = await adapter.execute({
      ...WORKSPACE_EDIT,
      options: { mcpConfigPath: '/tmp/mcp.json' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/workspace-edit mode/);
    expect(result.error.message).toMatch(/MCP config/);
    expect(spawnPath).not.toHaveBeenCalled();
  });
});

describe('CLI adapters that cannot enforce workspace-edit refuse it (#6792)', () => {
  const nonDeclaring: ReadonlyArray<readonly [string, () => ICliAdapter]> = [
    ['opencode', () => new OpenCodeCliAdapter()],
    ['gemini (agy)', () => new GeminiCliAdapter()],
    ['codex', () => new CodexCliAdapter()],
    ['codex-mcp', () => new CodexMcpAdapter()],
  ];

  it.each(nonDeclaring)('%s does not declare the mode', (_name, make) => {
    expect(make().enforcesWorkspaceEdit).not.toBe(true);
  });

  it.each(nonDeclaring)('%s refuses a workspace-edit task without running it', async (_n, make) => {
    const adapter = make();
    const result = await adapter.execute(WORKSPACE_EDIT, { allowRetry: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/workspace-edit mode/);
    expect(result.error.message).toMatch(/cannot enforce/);
    expect(isCallerInputCliError(result.error)).toBe(true);
  });

  it('agy executeWithMetadata applies the refusal too (it bypasses the base execute)', async () => {
    const result = await new GeminiCliAdapter().executeWithMetadata(WORKSPACE_EDIT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/cannot enforce/);
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

describe('an adapter that does not declare workspace-edit fails closed (#6792)', () => {
  it('BaseCliAdapter refuses the task and never reaches executeTask', async () => {
    const adapter = new UndeclaredAdapter();
    const result = await adapter.execute(WORKSPACE_EDIT);
    expect(result.ok).toBe(false);
    expect(adapter.executeTaskSpy).not.toHaveBeenCalled();
  });

  it('declaring read-only analysis does not stand in for workspace-edit', () => {
    expect(
      unenforcedAccessModeRefusal(
        { name: 'claude', enforcesReadOnlyAnalysis: true },
        WORKSPACE_EDIT
      )
    ).toBeDefined();
  });

  it('declaring workspace-edit does not stand in for read-only analysis', () => {
    expect(
      unenforcedAccessModeRefusal(
        { name: 'claude', enforcesWorkspaceEdit: true },
        { accessMode: 'read-only-analysis' }
      )
    ).toBeDefined();
  });

  it('passes only an explicit true', () => {
    expect(unenforcedAccessModeRefusal({ name: 'claude' }, WORKSPACE_EDIT)).toBeDefined();
    expect(
      unenforcedAccessModeRefusal({ name: 'claude', enforcesWorkspaceEdit: false }, WORKSPACE_EDIT)
    ).toBeDefined();
    expect(
      unenforcedAccessModeRefusal({ name: 'claude', enforcesWorkspaceEdit: true }, WORKSPACE_EDIT)
    ).toBeUndefined();
    expect(unenforcedAccessModeRefusal({ name: 'claude' }, DEFAULT_MODE)).toBeUndefined();
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
    ...(enforces !== undefined ? { enforcesWorkspaceEdit: enforces } : {}),
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

describe('the CLI→model bridge forwards workspace-edit and fails closed (#6792)', () => {
  const request = {
    messages: [{ role: 'user' as const, content: 'implement this' }],
    accessMode: 'workspace-edit' as const,
  };

  it('forwards the mode onto the CliTask for a declaring adapter', async () => {
    const { adapter, tasks } = bareCliAdapter(true);
    const result = await new CliToModelAdapter(adapter).complete(request);
    expect(result.ok).toBe(true);
    expect(tasks[0]?.accessMode).toBe('workspace-edit');
  });

  it('refuses without calling execute when the adapter declares nothing', async () => {
    const { adapter, tasks } = bareCliAdapter(undefined);
    const result = await new CliToModelAdapter(adapter).complete(request);
    expect(result.ok).toBe(false);
    expect(tasks).toHaveLength(0);
  });
});
