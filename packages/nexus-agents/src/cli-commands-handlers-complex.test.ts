/**
 * CLI Command Handlers - Complex Commands Tests
 *
 * Tests for handleConfigCommand, handleOrchestrateCommand, and handleSweBenchCommand
 * in cli-commands-handlers-complex.ts.
 *
 * @module cli-commands-handlers-complex.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ParsedCliArgs } from './cli-types.js';
import type { ServerMode } from './cli/index.js';

// Mock process.exit as no-op to prevent actual exit during tests
const mockExit = vi.fn();
const writeSpy = vi.fn().mockReturnValue(true);

vi.stubGlobal('process', {
  ...process,
  exit: mockExit,
  stdout: {
    ...process.stdout,
    write: writeSpy,
  },
});

// Mock cli/index.js exports
vi.mock('./cli/index.js', () => ({
  configInitCommand: vi.fn(() => Promise.resolve(0)),
  configCommand: vi.fn(() => Promise.resolve(0)),
  isValidConfigAction: vi.fn((action: string) =>
    ['get', 'set', 'list', 'reset', 'export', 'import'].includes(action)
  ),
  orchestrateCommand: vi.fn(() => Promise.resolve(0)),
}));

// Mock validators
vi.mock('./cli-commands-validators.js', () => ({
  isValidOrchestrateModel: vi.fn((m: string) => ['claude', 'gemini', 'codex'].includes(m)),
}));

// Mock usage printers
vi.mock('./cli-commands-usage.js', () => ({
  printOrchestrateUsage: vi.fn(),
}));

import {
  handleConfigCommand,
  handleOrchestrateCommand,
  handleSweBenchCommand,
} from './cli-commands-handlers-complex.js';

import { configInitCommand, configCommand, orchestrateCommand } from './cli/index.js';

import { printOrchestrateUsage } from './cli-commands-usage.js';

/**
 * Creates a ParsedCliArgs object with default values and optional overrides.
 * Uses omission pattern for optional properties to comply with exactOptionalPropertyTypes.
 */
function createArgs(overrides: Record<string, unknown> = {}): ParsedCliArgs {
  const baseOptions = {
    help: false,
    version: false,
    verbose: false,
    interactive: false,
    mode: 'server' as ServerMode,
    force: false,
    format: 'json',
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
    mock: false,
  };

  const result = {
    command: 'config' as const,
    options: baseOptions,
    positionals: ['config'],
    ...overrides,
  } as unknown as ParsedCliArgs;

  return result;
}

describe('cli-commands-handlers-complex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleConfigCommand', () => {
    it('calls configInitCommand when subcommand is init', async () => {
      const args = createArgs({
        subcommand: 'init',
        positionals: ['config', 'init'],
      });

      await handleConfigCommand(args);

      expect(configInitCommand).toHaveBeenCalledWith({
        force: false,
      });
      expect(configCommand).not.toHaveBeenCalled();
    });

    it('calls configCommand for valid subcommand get', async () => {
      const args = createArgs({
        subcommand: 'get',
        positionals: ['config', 'get', 'some.key'],
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'get',
          key: 'some.key',
          format: 'json',
        })
      );
      expect(configInitCommand).not.toHaveBeenCalled();
    });

    it('calls configCommand for set with key and value', async () => {
      const args = createArgs({
        subcommand: 'set',
        positionals: ['config', 'set', 'timeout.ms', '5000'],
      });

      await handleConfigCommand(args);

      expect(configCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'set',
          key: 'timeout.ms',
          value: '5000',
        })
      );
    });

    it('prints error and exits for invalid subcommand', async () => {
      const args = createArgs({
        subcommand: 'bogus',
        positionals: ['config', 'bogus'],
      });

      await handleConfigCommand(args);

      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown config subcommand: 'bogus'")
      );
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('Valid subcommands: init, get, set, list, reset, export, import')
      );
      expect(mockExit).toHaveBeenCalledWith(3); // EXIT_CODES.INVALID_ARGS
      expect(configCommand).not.toHaveBeenCalled();
    });

    it('defaults to empty string when subcommand is undefined', async () => {
      const args = createArgs({
        positionals: ['config'],
      });

      await handleConfigCommand(args);

      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown config subcommand: ''")
      );
      expect(mockExit).toHaveBeenCalledWith(3);
    });

    it('exits SUCCESS on exit code 0', async () => {
      vi.mocked(configCommand).mockResolvedValueOnce(0);

      const args = createArgs({
        subcommand: 'list',
        positionals: ['config', 'list'],
      });

      await handleConfigCommand(args);

      expect(mockExit).toHaveBeenCalledWith(0); // EXIT_CODES.SUCCESS
    });

    it('exits SERVER_START_FAILED on non-zero exit code', async () => {
      vi.mocked(configCommand).mockResolvedValueOnce(1);

      const args = createArgs({
        subcommand: 'list',
        positionals: ['config', 'list'],
      });

      await handleConfigCommand(args);

      expect(mockExit).toHaveBeenCalledWith(1); // EXIT_CODES.SERVER_START_FAILED
    });

    it('passes format as yaml when specified', async () => {
      const args = createArgs({
        subcommand: 'export',
        positionals: ['config', 'export', './out.yaml'],
        options: {
          help: false,
          version: false,
          verbose: false,
          interactive: false,
          mode: 'server',
          force: false,
          format: 'yaml',
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
          mock: false,
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

  describe('handleOrchestrateCommand', () => {
    it('calls orchestrateCommand with task from positionals[1]', async () => {
      const args = createArgs({
        command: 'orchestrate',
        positionals: ['orchestrate', 'Implement feature X'],
      });

      await handleOrchestrateCommand(args);

      expect(orchestrateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          task: 'Implement feature X',
        })
      );
    });

    it('prints usage and exits when no task provided', async () => {
      const args = createArgs({
        command: 'orchestrate',
        positionals: ['orchestrate'],
      });

      await handleOrchestrateCommand(args);

      expect(printOrchestrateUsage).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(3); // EXIT_CODES.INVALID_ARGS
    });

    it('passes valid model through', async () => {
      const args = createArgs({
        command: 'orchestrate',
        positionals: ['orchestrate', 'some task'],
        options: {
          help: false,
          version: false,
          verbose: false,
          interactive: false,
          mode: 'server',
          force: false,
          format: 'json',
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
          mock: false,
          model: 'claude',
        },
      });

      await handleOrchestrateCommand(args);

      expect(orchestrateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude',
        })
      );
    });

    it('ignores invalid model and sets to undefined', async () => {
      const args = createArgs({
        command: 'orchestrate',
        positionals: ['orchestrate', 'some task'],
        options: {
          help: false,
          version: false,
          verbose: false,
          interactive: false,
          mode: 'server',
          force: false,
          format: 'json',
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
          mock: false,
          model: 'invalid-model',
        },
      });

      await handleOrchestrateCommand(args);

      expect(orchestrateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          model: undefined,
        })
      );
    });

    it('passes engine puppeteer when valid', async () => {
      const args = createArgs({
        command: 'orchestrate',
        positionals: ['orchestrate', 'some task'],
        options: {
          help: false,
          version: false,
          verbose: false,
          interactive: false,
          mode: 'server',
          force: false,
          format: 'json',
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
          mock: false,
          engine: 'puppeteer',
        },
      });

      await handleOrchestrateCommand(args);

      expect(orchestrateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          engine: 'puppeteer',
        })
      );
    });

    it('passes numeric options maxTokens and maxCostUsd', async () => {
      const args = createArgs({
        command: 'orchestrate',
        positionals: ['orchestrate', 'some task'],
        options: {
          help: false,
          version: false,
          verbose: false,
          interactive: false,
          mode: 'server',
          force: false,
          format: 'json',
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
          mock: false,
          maxTokens: 4096,
          maxCostUsd: 1.5,
        },
      });

      await handleOrchestrateCommand(args);

      expect(orchestrateCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 4096,
          maxCostUsd: 1.5,
        })
      );
    });

    it('exits with correct code on success', async () => {
      vi.mocked(orchestrateCommand).mockResolvedValueOnce(0);

      const args = createArgs({
        command: 'orchestrate',
        positionals: ['orchestrate', 'some task'],
      });

      await handleOrchestrateCommand(args);

      expect(mockExit).toHaveBeenCalledWith(0); // EXIT_CODES.SUCCESS
    });
  });

  describe('handleSweBenchCommand (deprecation shim, #2515)', () => {
    it('exits with INVALID_ARGS and prints migration message', async () => {
      const args = createArgs({
        command: 'swe-bench',
        positionals: ['swe-bench'],
      });
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await handleSweBenchCommand(args);
      expect(mockExit).toHaveBeenCalledWith(3); // EXIT_CODES.INVALID_ARGS
      const written = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(written).toContain('nexus-eval-swebench');
      stderrSpy.mockRestore();
    });
  });
});
