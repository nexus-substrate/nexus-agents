/**
 * CLI Command Handlers Integration Tests
 *
 * Tests for the config command routing in cli-commands-handlers.ts.
 * (Source: Issue #378)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { ParsedCliArgs } from './cli-types.js';
import type { ServerMode } from './cli/index.js';

// Mock process.exit to prevent actual exit during tests
const mockExit = vi.fn();
vi.stubGlobal('process', {
  ...process,
  exit: mockExit,
  stdout: {
    write: vi.fn(),
  },
});

// Mock configCommand and configInitCommand
vi.mock('./cli/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./cli/index.js')>();
  return {
    ...original,
    configCommand: vi.fn().mockResolvedValue(0),
    configInitCommand: vi.fn().mockResolvedValue(0),
    // #3210: stub status-returning commands so we can assert the handler's
    // CliExitResult maps the underlying 0|non-0 status to SUCCESS|SERVER_START_FAILED.
    expertListCommand: vi.fn().mockReturnValue(0),
    helloCommand: vi.fn().mockReturnValue(0),
  };
});

import {
  handleConfigCommand,
  handleExpertCommand,
  handleHelloCommand,
  handleUnimplementedCommand,
} from './cli-commands-handlers.js';
import { configCommand, configInitCommand, expertListCommand, helloCommand } from './cli/index.js';

/**
 * Creates a ParsedCliArgs object with default values.
 * Uses omission pattern for optional properties to comply with exactOptionalPropertyTypes.
 */
function createMockArgs(overrides: Partial<ParsedCliArgs> = {}): ParsedCliArgs {
  const baseOptions = {
    help: false,
    version: false,
    verbose: false,
    interactive: false,
    all: false,
    mode: 'server' as ServerMode,
    force: false,
    format: 'table',
    dryRun: false,
    banditStats: false,
    setup: false,
    skipChecks: false,
    createIssue: false,
    fix: false,
    quick: false,
    resume: false,
    nonInteractive: false,
    skipMcp: false,
    skipRules: false,
    skipHooks: false,
    skipConfig: false,
    skipOpencode: false,
    skipGemini: false,
    skipCodex: false,
    mock: false,
    deep: false,
  };

  return {
    command: 'config',
    options: baseOptions,
    positionals: ['config'],
    ...overrides,
  };
}

describe('handleConfigCommand routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('init subcommand', () => {
    it('routes to configInitCommand', async () => {
      const args = createMockArgs({
        subcommand: 'init',
        positionals: ['config', 'init'],
      });

      await handleConfigCommand(args);

      expect(configInitCommand).toHaveBeenCalledWith({
        force: false,
      });
      expect(configCommand).not.toHaveBeenCalled();
    });

    it('passes force option to configInitCommand', async () => {
      const args = createMockArgs({
        subcommand: 'init',
        positionals: ['config', 'init'],
        options: {
          ...createMockArgs().options,
          force: true,
        },
      });

      await handleConfigCommand(args);

      expect(configInitCommand).toHaveBeenCalledWith({
        force: true,
      });
    });

    it('passes output option to configInitCommand', async () => {
      const args = createMockArgs({
        subcommand: 'init',
        positionals: ['config', 'init'],
        options: {
          ...createMockArgs().options,
          output: './custom-config.yaml',
        },
      });

      await handleConfigCommand(args);

      expect(configInitCommand).toHaveBeenCalledWith({
        force: false,
        output: './custom-config.yaml',
      });
    });
  });

  describe('get subcommand', () => {
    it('routes to configCommand with get action', async () => {
      const args = createMockArgs({
        subcommand: 'get',
        positionals: ['config', 'get', 'TIMEOUT_DEFAULTS.cliMs'],
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'get',
          key: 'TIMEOUT_DEFAULTS.cliMs',
          format: 'json',
        })
      );
    });
  });

  describe('set subcommand', () => {
    it('routes to configCommand with set action', async () => {
      const args = createMockArgs({
        subcommand: 'set',
        positionals: ['config', 'set', 'TIMEOUT_DEFAULTS.cliMs', '90000'],
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'set',
          key: 'TIMEOUT_DEFAULTS.cliMs',
          value: '90000',
        })
      );
    });
  });

  describe('list subcommand', () => {
    it('routes to configCommand with list action', async () => {
      const args = createMockArgs({
        subcommand: 'list',
        positionals: ['config', 'list'],
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'list',
        })
      );
    });

    it('passes verbose option', async () => {
      const args = createMockArgs({
        subcommand: 'list',
        positionals: ['config', 'list'],
        options: {
          ...createMockArgs().options,
          verbose: true,
        },
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'list',
          verbose: true,
        })
      );
    });
  });

  describe('reset subcommand', () => {
    it('routes to configCommand with reset action for specific key', async () => {
      const args = createMockArgs({
        subcommand: 'reset',
        positionals: ['config', 'reset', 'TIMEOUT_DEFAULTS.cliMs'],
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reset',
          key: 'TIMEOUT_DEFAULTS.cliMs',
        })
      );
    });

    it('routes to configCommand with reset action for all keys', async () => {
      const args = createMockArgs({
        subcommand: 'reset',
        positionals: ['config', 'reset'],
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'reset',
        })
      );
    });
  });

  describe('export subcommand', () => {
    it('routes to configCommand with export action', async () => {
      const args = createMockArgs({
        subcommand: 'export',
        positionals: ['config', 'export', './my-config.json'],
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'export',
          file: './my-config.json',
        })
      );
    });

    it('passes yaml format option', async () => {
      const args = createMockArgs({
        subcommand: 'export',
        positionals: ['config', 'export', './my-config.yaml'],
        options: {
          ...createMockArgs().options,
          format: 'yaml',
        },
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'export',
          format: 'yaml',
        })
      );
    });
  });

  describe('import subcommand', () => {
    it('routes to configCommand with import action', async () => {
      const args = createMockArgs({
        subcommand: 'import',
        positionals: ['config', 'import', './my-config.json'],
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'import',
          file: './my-config.json',
        })
      );
    });

    it('passes force option', async () => {
      const args = createMockArgs({
        subcommand: 'import',
        positionals: ['config', 'import', './my-config.json'],
        options: {
          ...createMockArgs().options,
          force: true,
        },
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'import',
          force: true,
        })
      );
    });
  });

  describe('unknown subcommand', () => {
    it('prints error and exits with INVALID_ARGS for unknown subcommand', async () => {
      const args = createMockArgs({
        subcommand: 'unknown',
        positionals: ['config', 'unknown'],
      });

      const result = await handleConfigCommand(args);

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining("Unknown config subcommand: 'unknown'")
      );
      // #3210: handler RETURNS the exit code; the dispatcher owns process.exit.
      expect(result).toEqual({ success: false, exitCode: 3 }); // EXIT_CODES.INVALID_ARGS
      expect(configCommand).not.toHaveBeenCalled();
    });

    it('prints valid subcommands list', async () => {
      const args = createMockArgs({
        subcommand: 'invalid',
        positionals: ['config', 'invalid'],
      });

      await handleConfigCommand(args);

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('Valid subcommands: init, get, set, list, reset, export, import')
      );
    });
  });

  describe('empty subcommand', () => {
    it('treats empty subcommand as unknown', async () => {
      // Omit subcommand entirely (not set to undefined) for exactOptionalPropertyTypes
      const args = createMockArgs({
        positionals: ['config'],
      });

      const result = await handleConfigCommand(args);

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining("Unknown config subcommand: ''")
      );
      expect(result).toEqual({ success: false, exitCode: 3 });
    });
  });
});

// #3210: migrated handlers RETURN a CliExitResult instead of calling
// process.exit. These tests prove the returned exitCode is identical to the
// pre-refactor exit code on both a success and a failure path, without
// asserting on real process.exit.
describe('CliExitResult return contract (#3210)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleExpertCommand', () => {
    it('returns SUCCESS (0) when expertListCommand reports 0', () => {
      vi.mocked(expertListCommand).mockReturnValueOnce(0);
      const args = createMockArgs({ command: 'expert', subcommand: 'list' });
      expect(handleExpertCommand(args)).toEqual({ success: true, exitCode: 0 });
    });

    it('returns SERVER_START_FAILED (1) when expertListCommand reports non-zero', () => {
      vi.mocked(expertListCommand).mockReturnValueOnce(1);
      const args = createMockArgs({ command: 'expert', subcommand: 'list' });
      expect(handleExpertCommand(args)).toEqual({ success: false, exitCode: 1 });
    });

    it('returns NOT_IMPLEMENTED (4) for an unimplemented subcommand', () => {
      const args = createMockArgs({ command: 'expert', subcommand: 'create' });
      expect(handleExpertCommand(args)).toEqual({ success: false, exitCode: 4 });
    });
  });

  describe('handleHelloCommand', () => {
    it('returns SUCCESS (0) when helloCommand reports 0', () => {
      vi.mocked(helloCommand).mockReturnValueOnce(0);
      expect(handleHelloCommand(createMockArgs({ command: 'hello' }))).toEqual({
        success: true,
        exitCode: 0,
      });
    });

    it('returns SERVER_START_FAILED (1) when helloCommand reports non-zero', () => {
      vi.mocked(helloCommand).mockReturnValueOnce(2);
      expect(handleHelloCommand(createMockArgs({ command: 'hello' }))).toEqual({
        success: false,
        exitCode: 1,
      });
    });
  });
});

// #3207: did-you-mean suggestions + tracking-issue link for unimplemented
// (recognized-but-not-built) CLI subcommands. Writes to stderr; we spy on it
// directly since the module-level process stub only mocks stdout.
describe('handleUnimplementedCommand (#3207)', () => {
  let stderrSpy: MockInstance;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  function stderrOutput(): string {
    return stderrSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('');
  }

  it('always reports the command is not implemented and points at the tracker', () => {
    handleUnimplementedCommand('workflow bogus');
    const out = stderrOutput();
    expect(out).toContain("The 'workflow bogus' CLI subcommand is not yet implemented.");
    expect(out).toContain('https://github.com/nexus-substrate/nexus-agents/issues');
  });

  it('suggests the closest implemented subcommand for a near-miss typo', () => {
    // `lst` is one edit from `list` (an implemented workflow subcommand).
    handleUnimplementedCommand('workflow lst');
    expect(stderrOutput()).toContain('Did you mean: workflow list?');
  });

  it('suggests a workflow run typo', () => {
    // `runn` is one edit from `run`; short 2-char inputs are intentionally
    // below the suggester's relative-distance floor, so use a 4-char near-miss.
    handleUnimplementedCommand('workflow runn');
    expect(stderrOutput()).toContain('Did you mean: workflow run?');
  });

  it('does not emit a bogus suggestion when no implemented subcommand is close', () => {
    // `create` is far from the only implemented expert subcommand (`list`).
    handleUnimplementedCommand('expert create');
    expect(stderrOutput()).not.toContain('Did you mean');
  });

  it('still names the equivalent MCP tool when one exists', () => {
    handleUnimplementedCommand('expert create');
    expect(stderrOutput()).toContain('create_expert');
  });

  it('does not suggest when the subcommand is empty', () => {
    handleUnimplementedCommand('expert ');
    expect(stderrOutput()).not.toContain('Did you mean');
  });
});
