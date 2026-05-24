/**
 * Tests for setup-mcp MCP configuration helpers
 *
 * Verifies MCP server and hook configuration functionality.
 * Mocks all child_process and os operations.
 * (Source: Issue #363, #411, #416)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  NEXUS_AGENTS_MCP_ENTRY,
  NEXUS_AGENTS_MCP_NPX_ENTRY,
  isMcpServerConfigured,
  configureMcpServer,
  generateMcpSnippet,
  getMcpJsonPath,
  generateHookConfig,
  areHooksConfigured,
  getExistingHooks,
  readExistingHooks,
  mergeHookConfigs,
  configureHooks,
  generateHookSnippet,
} from './setup-mcp.js';
import type { HookSettingsConfig } from './setup-mcp.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

const mockedExecSync = vi.mocked(execSync);
const mockedExecFileSync = vi.mocked(execFileSync);
const mockedHomedir = vi.mocked(homedir);

// ============================================================================
// Factory Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createHookEntry(command: string, matcher?: string) {
  const entry: { matcher?: string; hooks: Array<{ type: 'command'; command: string }> } = {
    hooks: [{ type: 'command' as const, command }],
  };
  if (matcher !== undefined) {
    entry.matcher = matcher;
  }
  return entry;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createExistingHooks() {
  const hooks: HookSettingsConfig['hooks'] = {
    PreToolUse: [createHookEntry('my-custom-lint --check', 'Bash')],
    Stop: [createHookEntry('my-custom-cleanup')],
  };
  return hooks;
}

// ============================================================================
// Constants
// ============================================================================

describe('setup-mcp constants', () => {
  it('should export correct NEXUS_AGENTS_MCP_ENTRY', () => {
    expect(NEXUS_AGENTS_MCP_ENTRY.command).toBe('nexus-agents');
    expect(NEXUS_AGENTS_MCP_ENTRY.args).toEqual(['--mode=server']);
  });

  it('should export correct NEXUS_AGENTS_MCP_NPX_ENTRY', () => {
    expect(NEXUS_AGENTS_MCP_NPX_ENTRY.command).toBe('npx');
    expect(NEXUS_AGENTS_MCP_NPX_ENTRY.args).toEqual(['-y', 'nexus-agents@latest', '--mode=server']);
  });
});

// ============================================================================
// isMcpServerConfigured
// ============================================================================

describe('isMcpServerConfigured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when output contains nexus-agents', () => {
    mockedExecSync.mockReturnValue('nexus-agents: stdio server running');

    expect(isMcpServerConfigured()).toBe(true);
    expect(mockedExecSync).toHaveBeenCalledWith(
      'claude mcp get nexus-agents',
      expect.objectContaining({ encoding: 'utf-8' })
    );
  });

  it('should return false when output does not contain nexus-agents', () => {
    mockedExecSync.mockReturnValue('other-server: running');

    expect(isMcpServerConfigured()).toBe(false);
  });

  it('should return false when execSync throws', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('Command not found');
    });

    expect(isMcpServerConfigured()).toBe(false);
  });
});

// ============================================================================
// configureMcpServer
// ============================================================================

describe('configureMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return already-configured when server exists and force=false', () => {
    // First call: isMcpServerConfigured check
    mockedExecSync.mockReturnValue('nexus-agents: configured');

    const result = configureMcpServer(false, false);

    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(true);
    expect(result.message).toContain('already configured');
  });

  it('should add server when not configured', () => {
    // isMcpServerConfigured: throws (not configured)
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    // addMcpServer uses execFileSync
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('added'));

    const result = configureMcpServer(false, false);

    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
    expect(result.message).toContain('Added nexus-agents');
  });

  it('should use npx entry when useNpx=true', () => {
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('added'));

    configureMcpServer(true, false);

    // addMcpServer uses execFileSync with 'claude' as first arg
    const addCall = mockedExecFileSync.mock.calls[0]!;
    // Args include the npx JSON config
    const jsonArg = addCall[1] as string[];
    expect(jsonArg).toBeDefined();
    expect(JSON.stringify(jsonArg)).toContain('npx');
  });

  it('should remove and re-add when force=true and already configured', () => {
    // isMcpServerConfigured: returns true
    mockedExecSync
      .mockReturnValueOnce('nexus-agents: configured')
      // removeExistingMcpServer uses execSync
      .mockReturnValueOnce('removed');
    // addMcpServer uses execFileSync
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('added'));

    const result = configureMcpServer(false, true);

    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
    expect(mockedExecSync).toHaveBeenCalledTimes(2);
    expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
  });

  it('should return failure when add command throws', () => {
    // isMcpServerConfigured: not configured
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    // addMcpServer (execFileSync) throws
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('Permission denied');
    });

    const result = configureMcpServer(false, false);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to add MCP server');
    expect(result.message).toContain('Permission denied');
  });

  it('should handle non-Error throw from add command', () => {
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    mockedExecFileSync.mockImplementationOnce(() => {
      const err: unknown = 'string error';
      throw err;
    });

    const result = configureMcpServer(false, false);

    expect(result.success).toBe(false);
    expect(result.message).toContain('string error');
  });

  it('should pass -s user flag by default', () => {
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('added'));

    configureMcpServer(false, false);

    const addCall = mockedExecFileSync.mock.calls[0]!;
    const args = addCall[1] as string[];
    expect(args).toContain('-s');
    expect(args).toContain('user');
  });

  it('should pass -s local flag when scope is project', () => {
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('added'));

    configureMcpServer(false, false, 'project');

    const addCall = mockedExecFileSync.mock.calls[0]!;
    const args = addCall[1] as string[];
    expect(args).toContain('-s');
    expect(args).toContain('local');
  });

  it('should include scope label in success message', () => {
    mockedExecSync.mockImplementationOnce(() => {
      throw new Error('not found');
    });
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('added'));

    const result = configureMcpServer(false, false, 'user');
    expect(result.message).toContain('global');
  });

  it('should use matching scope for remove when force=true', () => {
    mockedExecSync.mockReturnValueOnce('nexus-agents: configured').mockReturnValueOnce('removed');
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('added'));

    configureMcpServer(false, true, 'project');

    // Remove call uses execSync with -s local
    const removeCall = mockedExecSync.mock.calls[1]!;
    const removeCmd = removeCall[0];
    expect(removeCmd).toContain('-s local');
  });
});

// ============================================================================
// generateMcpSnippet
// ============================================================================

describe('generateMcpSnippet', () => {
  it('should generate snippet with direct command by default', () => {
    const snippet = generateMcpSnippet();
    const parsed = JSON.parse(snippet);

    expect(parsed.mcpServers['nexus-agents'].command).toBe('nexus-agents');
    expect(parsed.mcpServers['nexus-agents'].args).toEqual(['--mode=server']);
  });

  it('should generate snippet with npx when useNpx=true', () => {
    const snippet = generateMcpSnippet(true);
    const parsed = JSON.parse(snippet);

    expect(parsed.mcpServers['nexus-agents'].command).toBe('npx');
    expect(parsed.mcpServers['nexus-agents'].args).toContain('nexus-agents@latest');
  });

  it('should produce valid pretty-printed JSON', () => {
    const snippet = generateMcpSnippet();

    expect(snippet).toContain('\n');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    expect(() => JSON.parse(snippet)).not.toThrow();
  });
});

// ============================================================================
// getMcpJsonPath
// ============================================================================

describe('getMcpJsonPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return project .mcp.json for project scope', () => {
    const result = getMcpJsonPath('project', '/my/project');

    expect(result).toBe(join('/my/project', '.mcp.json'));
  });

  it('should return user ~/.claude.json for user scope', () => {
    mockedHomedir.mockReturnValue('/mock/home');

    const result = getMcpJsonPath('user', '/my/project');

    expect(result).toBe(join('/mock/home', '.claude.json'));
  });
});

// ============================================================================
// generateHookConfig
// ============================================================================

describe('generateHookConfig', () => {
  it('should include all four hook types', () => {
    const config = generateHookConfig();

    expect(config.hooks.SessionStart).toBeDefined();
    expect(config.hooks.PreToolUse).toBeDefined();
    expect(config.hooks.PostToolUse).toBeDefined();
    expect(config.hooks.Stop).toBeDefined();
  });

  it('should set PreToolUse matcher to Bash', () => {
    const config = generateHookConfig();
    const preToolUse = config.hooks.PreToolUse!;

    expect(preToolUse[0]!.matcher).toBe('Bash');
  });

  it('should set PostToolUse matcher to wildcard', () => {
    const config = generateHookConfig();
    const postToolUse = config.hooks.PostToolUse!;

    expect(postToolUse[0]!.matcher).toBe('*');
  });

  it('should use command type for all hook entries', () => {
    const config = generateHookConfig();
    const allHookEntries = [
      ...config.hooks.SessionStart!,
      ...config.hooks.PreToolUse!,
      ...config.hooks.PostToolUse!,
      ...config.hooks.Stop!,
    ];

    for (const entry of allHookEntries) {
      for (const hook of entry.hooks) {
        expect(hook.type).toBe('command');
      }
    }
  });

  it('should prefix all commands with nexus-agents hooks', () => {
    const config = generateHookConfig();
    const allCommands = [
      ...config.hooks.SessionStart!,
      ...config.hooks.PreToolUse!,
      ...config.hooks.PostToolUse!,
      ...config.hooks.Stop!,
    ].flatMap((e) => e.hooks.map((h) => h.command));

    for (const cmd of allCommands) {
      expect(cmd).toMatch(/^nexus-agents hooks /);
    }
  });
});

// ============================================================================
// areHooksConfigured
// ============================================================================

describe('areHooksConfigured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when hooks output contains nexus-agents', () => {
    mockedExecSync.mockReturnValue(
      '{"PreToolUse": [{"hooks": [{"command": "nexus-agents hooks"}]}]}'
    );

    expect(areHooksConfigured()).toBe(true);
  });

  it('should return false when hooks output lacks nexus-agents', () => {
    mockedExecSync.mockReturnValue('{"PreToolUse": [{"hooks": [{"command": "other-tool"}]}]}');

    expect(areHooksConfigured()).toBe(false);
  });

  it('should return false when command throws', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('not configured');
    });

    expect(areHooksConfigured()).toBe(false);
  });
});

// ============================================================================
// getExistingHooks
// ============================================================================

describe('getExistingHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return parsed hooks from valid JSON output', () => {
    const hookData = { PreToolUse: [{ hooks: [{ type: 'command', command: 'lint' }] }] };
    mockedExecSync.mockReturnValue(JSON.stringify(hookData));

    const result = getExistingHooks();

    expect(result).toEqual(hookData);
  });

  it('should return undefined for empty output', () => {
    mockedExecSync.mockReturnValue('   \n  ');

    expect(getExistingHooks()).toBeUndefined();
  });

  it('should return undefined for null string', () => {
    mockedExecSync.mockReturnValue('null');

    expect(getExistingHooks()).toBeUndefined();
  });

  it('should return undefined for undefined string', () => {
    mockedExecSync.mockReturnValue('undefined');

    expect(getExistingHooks()).toBeUndefined();
  });

  it('should return undefined when command throws', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('failed');
    });

    expect(getExistingHooks()).toBeUndefined();
  });

  it('should return undefined for invalid JSON', () => {
    mockedExecSync.mockReturnValue('not-json{{{');

    expect(getExistingHooks()).toBeUndefined();
  });
});

// ============================================================================
// readExistingHooks (#2975 — distinguishes parse failure from absence)
// ============================================================================

describe('readExistingHooks (#2975)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns kind=present with parsed hooks for valid JSON', () => {
    const hookData = { PreToolUse: [{ hooks: [{ type: 'command', command: 'lint' }] }] };
    mockedExecSync.mockReturnValue(JSON.stringify(hookData));

    const result = readExistingHooks();

    expect(result).toEqual({ kind: 'present', hooks: hookData });
  });

  it('returns kind=absent for empty/null/undefined CLI output', () => {
    for (const output of ['', '   \n  ', 'null', 'undefined']) {
      mockedExecSync.mockReturnValue(output);
      expect(readExistingHooks()).toEqual({ kind: 'absent' });
    }
  });

  it('returns kind=unreadable when the CLI throws', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('claude CLI not on PATH');
    });

    const result = readExistingHooks();
    expect(result.kind).toBe('unreadable');
    if (result.kind === 'unreadable') {
      expect(result.reason).toContain('claude CLI not on PATH');
    }
  });

  it('returns kind=parse_failed (NOT absent) for malformed JSON', () => {
    mockedExecSync.mockReturnValue('not-json{{{');

    const result = readExistingHooks();
    expect(result.kind).toBe('parse_failed');
    if (result.kind === 'parse_failed') {
      expect(result.raw).toBe('not-json{{{');
      expect(result.reason).toMatch(/JSON|parse/i);
    }
  });
});

// ============================================================================
// configureHooks parse-failure guard (#2975)
// ============================================================================

describe('configureHooks parse-failure guard (#2975)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHomedir.mockReturnValue('/mock/home');
  });

  it('refuses to configure when existing hooks fail to parse — does not call config set', () => {
    // First execSync = `claude config get hooks` → returns malformed JSON.
    // areHooksConfigured() also calls execSync; return malformed for any call.
    mockedExecSync.mockReturnValue('not-json{{{');

    const result = configureHooks(/* force */ true);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Refusing to configure hooks/);
    expect(result.message).toMatch(/parse error/i);
    // Critical: never reached the destructive write.
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });

  it('proceeds normally when existing hooks parse cleanly', () => {
    mockedExecSync.mockReturnValue(JSON.stringify({}));

    const result = configureHooks(true);

    expect(result.success).toBe(true);
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['config', 'set', 'hooks']),
      expect.anything()
    );
  });
});

// ============================================================================
// mergeHookConfigs
// ============================================================================

describe('mergeHookConfigs', () => {
  it('should return new config when existing is undefined', () => {
    const newConfig = generateHookConfig().hooks;

    const result = mergeHookConfigs(undefined, newConfig);

    expect(result).toEqual(newConfig);
  });

  it('should preserve existing non-nexus hooks', () => {
    const existing = createExistingHooks();
    const newConfig = generateHookConfig().hooks;

    const result = mergeHookConfigs(existing, newConfig);

    // The custom lint hook should still be present
    const preToolEntries = result.PreToolUse!;
    const customHook = preToolEntries.find((e) =>
      e.hooks.some((h) => h.command === 'my-custom-lint --check')
    );
    expect(customHook).toBeDefined();
  });

  it('should add nexus-agents hooks alongside existing hooks', () => {
    const existing = createExistingHooks();
    const newConfig = generateHookConfig().hooks;

    const result = mergeHookConfigs(existing, newConfig);

    const preToolEntries = result.PreToolUse!;
    const nexusHook = preToolEntries.find((e) =>
      e.hooks.some((h) => h.command.startsWith('nexus-agents'))
    );
    expect(nexusHook).toBeDefined();
  });

  it('should not duplicate nexus-agents hooks on re-merge', () => {
    const firstMerge = mergeHookConfigs(undefined, generateHookConfig().hooks);
    const secondMerge = mergeHookConfigs(firstMerge, generateHookConfig().hooks);

    const stopEntries = secondMerge.Stop!;
    const nexusStopHooks = stopEntries.filter((e) =>
      e.hooks.some((h) => h.command.startsWith('nexus-agents'))
    );
    expect(nexusStopHooks).toHaveLength(1);
  });

  it('should preserve existing hooks for types not in new config', () => {
    const existing: HookSettingsConfig['hooks'] = {
      SessionEnd: [createHookEntry('my-session-end')],
    };
    const newConfig: HookSettingsConfig['hooks'] = {
      SessionStart: [createHookEntry('nexus-agents hooks session-start')],
    };

    const result = mergeHookConfigs(existing, newConfig);

    expect(result.SessionEnd).toBeDefined();
    expect(result.SessionStart).toBeDefined();
  });
});

// ============================================================================
// configureHooks
// ============================================================================

describe('configureHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return already-configured when hooks exist and force=false', () => {
    mockedExecSync.mockReturnValue('nexus-agents hooks configured');

    const result = configureHooks(false);

    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(true);
    expect(result.message).toContain('already configured');
  });

  it('should configure hooks when not yet configured', () => {
    mockedExecSync
      // areHooksConfigured: no nexus-agents
      .mockReturnValueOnce('{}')
      // getExistingHooks: no existing hooks
      .mockReturnValueOnce('null');
    // config set hooks uses execFileSync
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('ok'));

    const result = configureHooks(false);

    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
    expect(result.message).toContain('Configured nexus-agents hooks');
  });

  it('should merge with existing hooks and report merge', () => {
    const existingHooks = { PreToolUse: [{ hooks: [{ type: 'command', command: 'lint' }] }] };
    mockedExecSync
      // areHooksConfigured: no nexus-agents
      .mockReturnValueOnce('{}')
      // getExistingHooks: has existing hooks
      .mockReturnValueOnce(JSON.stringify(existingHooks));
    // config set hooks uses execFileSync
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('ok'));

    const result = configureHooks(false);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Merged');
  });

  it('should reconfigure when force=true even if already configured', () => {
    mockedExecSync
      // areHooksConfigured: has nexus-agents
      .mockReturnValueOnce('nexus-agents hooks')
      // getExistingHooks
      .mockReturnValueOnce('null');
    // config set hooks uses execFileSync
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('ok'));

    const result = configureHooks(true);

    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
  });

  it('should return failure when config set throws', () => {
    mockedExecSync
      // areHooksConfigured
      .mockReturnValueOnce('{}')
      // getExistingHooks
      .mockReturnValueOnce('null');
    // config set hooks (execFileSync) throws
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('write failed');
    });

    const result = configureHooks(false);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to configure hooks');
    expect(result.message).toContain('write failed');
  });
});

// ============================================================================
// generateHookSnippet
// ============================================================================

describe('generateHookSnippet', () => {
  it('should produce valid pretty-printed JSON', () => {
    const snippet = generateHookSnippet();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    expect(() => JSON.parse(snippet)).not.toThrow();
    expect(snippet).toContain('\n');
  });

  it('should contain hooks key with all hook types', () => {
    const snippet = generateHookSnippet();
    const parsed = JSON.parse(snippet);

    expect(parsed.hooks).toBeDefined();
    expect(parsed.hooks.SessionStart).toBeDefined();
    expect(parsed.hooks.PreToolUse).toBeDefined();
    expect(parsed.hooks.PostToolUse).toBeDefined();
    expect(parsed.hooks.Stop).toBeDefined();
  });
});
