/**
 * nexus-agents/cli - CLI Argument Parsing Tests
 *
 * Tests for CLI argument parsing and command routing.
 * (Source: Node.js 22.x util.parseArgs documentation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCliArgs, printHelp, printVersion, EXIT_CODES, type ParsedCliArgs } from './cli.js';
import { VERSION } from './version.js';

describe('CLI Argument Parsing', () => {
  describe('parseCliArgs', () => {
    describe('default behavior', () => {
      it('should default to server command with no arguments', () => {
        const result = parseCliArgs([]);

        expect(result.command).toBe('server');
        expect(result.options.help).toBe(false);
        expect(result.options.version).toBe(false);
        expect(result.options.verbose).toBe(false);
        expect(result.options.mode).toBe('server');
        expect(result.positionals).toEqual([]);
      });

      it('should default to server command with unknown positional', () => {
        const result = parseCliArgs(['unknown-command']);

        expect(result.command).toBe('server');
        expect(result.positionals).toEqual(['unknown-command']);
      });
    });

    describe('help flag', () => {
      it('should parse --help flag', () => {
        const result = parseCliArgs(['--help']);

        expect(result.command).toBe('help');
        expect(result.options.help).toBe(true);
      });

      it('should parse -h short flag', () => {
        const result = parseCliArgs(['-h']);

        expect(result.command).toBe('help');
        expect(result.options.help).toBe(true);
      });

      it('should prioritize help flag over other arguments', () => {
        const result = parseCliArgs(['--help', '--version']);

        expect(result.command).toBe('help');
      });
    });

    describe('version flag', () => {
      it('should parse --version flag', () => {
        const result = parseCliArgs(['--version']);

        expect(result.command).toBe('version');
        expect(result.options.version).toBe(true);
      });

      it('should parse -v short flag', () => {
        const result = parseCliArgs(['-v']);

        expect(result.command).toBe('version');
        expect(result.options.version).toBe(true);
      });
    });

    describe('verbose flag', () => {
      it('should parse --verbose flag', () => {
        const result = parseCliArgs(['--verbose']);

        expect(result.command).toBe('server');
        expect(result.options.verbose).toBe(true);
      });

      it('should combine verbose with other commands', () => {
        const result = parseCliArgs(['config', '--verbose']);

        expect(result.command).toBe('config');
        expect(result.options.verbose).toBe(true);
      });
    });

    describe('interactive flag', () => {
      it('should parse --interactive flag', () => {
        const result = parseCliArgs(['--interactive']);

        expect(result.command).toBe('server');
        expect(result.options.interactive).toBe(true);
      });

      it('should combine interactive with verbose', () => {
        const result = parseCliArgs(['--interactive', '--verbose']);

        expect(result.command).toBe('server');
        expect(result.options.interactive).toBe(true);
        expect(result.options.verbose).toBe(true);
      });

      it('should default interactive to false', () => {
        const result = parseCliArgs([]);

        expect(result.options.interactive).toBe(false);
      });
    });

    describe('mode flag', () => {
      it('should parse --mode=server flag', () => {
        const result = parseCliArgs(['--mode=server']);

        expect(result.command).toBe('server');
        expect(result.options.mode).toBe('server');
      });

      it('should parse --mode=orchestrator flag', () => {
        const result = parseCliArgs(['--mode=orchestrator']);

        expect(result.command).toBe('server');
        expect(result.options.mode).toBe('orchestrator');
      });

      it('should parse --mode=mesh flag', () => {
        const result = parseCliArgs(['--mode=mesh']);

        expect(result.command).toBe('server');
        expect(result.options.mode).toBe('mesh');
      });

      it('should parse -m short flag', () => {
        const result = parseCliArgs(['-m', 'orchestrator']);

        expect(result.options.mode).toBe('orchestrator');
      });

      it('should default to server mode for invalid mode', () => {
        const result = parseCliArgs(['--mode=invalid']);

        expect(result.options.mode).toBe('server');
      });

      it('should combine mode with verbose', () => {
        const result = parseCliArgs(['--mode=mesh', '--verbose']);

        expect(result.options.mode).toBe('mesh');
        expect(result.options.verbose).toBe(true);
      });
    });

    describe('command parsing', () => {
      it('should parse server command', () => {
        const result = parseCliArgs(['server']);

        expect(result.command).toBe('server');
        expect(result.positionals).toEqual(['server']);
      });

      it('should parse config command', () => {
        const result = parseCliArgs(['config']);

        expect(result.command).toBe('config');
      });

      it('should parse expert command', () => {
        const result = parseCliArgs(['expert']);

        expect(result.command).toBe('expert');
      });

      it('should parse workflow command', () => {
        const result = parseCliArgs(['workflow']);

        expect(result.command).toBe('workflow');
      });

      it('should parse help command', () => {
        const result = parseCliArgs(['help']);

        expect(result.command).toBe('help');
      });

      it('should parse version command', () => {
        const result = parseCliArgs(['version']);

        expect(result.command).toBe('version');
      });
    });

    describe('subcommand parsing', () => {
      it('should parse subcommand as second positional', () => {
        const result = parseCliArgs(['config', 'show']);

        expect(result.command).toBe('config');
        expect(result.subcommand).toBe('show');
        expect(result.positionals).toEqual(['config', 'show']);
      });

      it('should not have subcommand with single positional', () => {
        const result = parseCliArgs(['config']);

        expect(result.command).toBe('config');
        expect(result.subcommand).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should throw on unknown option', () => {
        expect(() => parseCliArgs(['--unknown-option'])).toThrow();
      });

      it('should throw on invalid option format', () => {
        expect(() => parseCliArgs(['--help=invalid'])).toThrow();
      });
    });
  });

  describe('EXIT_CODES', () => {
    it('should have correct exit codes', () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
      expect(EXIT_CODES.SERVER_START_FAILED).toBe(1);
      expect(EXIT_CODES.SHUTDOWN_ERROR).toBe(2);
      expect(EXIT_CODES.INVALID_ARGS).toBe(3);
    });
  });

  describe('printHelp', () => {
    let stdoutWriteMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      stdoutWriteMock = vi.fn().mockReturnValue(true);
      vi.spyOn(process.stdout, 'write').mockImplementation(
        stdoutWriteMock as unknown as typeof process.stdout.write
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should print help text', () => {
      printHelp();

      expect(stdoutWriteMock).toHaveBeenCalledTimes(1);
      const output = stdoutWriteMock.mock.calls[0]?.[0] as string;
      expect(output).toContain('nexus-agents');
      expect(output).toContain('USAGE:');
      expect(output).toContain('COMMANDS:');
      expect(output).toContain('OPTIONS:');
      expect(output).toContain('--help');
      expect(output).toContain('--version');
    });

    it('should mention future commands', () => {
      printHelp();

      const output = stdoutWriteMock.mock.calls[0]?.[0] as string;
      expect(output).toContain('config');
      expect(output).toContain('expert');
      expect(output).toContain('workflow');
    });
  });

  describe('printVersion', () => {
    let stdoutWriteMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      stdoutWriteMock = vi.fn().mockReturnValue(true);
      vi.spyOn(process.stdout, 'write').mockImplementation(
        stdoutWriteMock as unknown as typeof process.stdout.write
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should print version string', () => {
      printVersion();

      expect(stdoutWriteMock).toHaveBeenCalledTimes(1);
      expect(stdoutWriteMock).toHaveBeenCalledWith(`nexus-agents v${VERSION}\n`);
    });
  });

  describe('ParsedCliArgs type', () => {
    it('should have correct structure', () => {
      const args: ParsedCliArgs = {
        command: 'server',
        options: {
          help: false,
          version: false,
          verbose: false,
          interactive: false,
          all: false,
          mode: 'server',
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
          live: false,
        },
        positionals: [],
      };

      expect(args.command).toBe('server');
      expect(args.subcommand).toBeUndefined();
      expect(args.options.help).toBe(false);
      expect(args.options.mode).toBe('server');
      expect(args.options.force).toBe(false);
      expect(args.options.format).toBe('table');
      expect(args.options.dryRun).toBe(false);
      expect(args.options.interactive).toBe(false);
    });

    it('should allow subcommand to be set', () => {
      const args: ParsedCliArgs = {
        command: 'config',
        subcommand: 'show',
        options: {
          help: false,
          version: false,
          verbose: false,
          interactive: false,
          all: false,
          mode: 'server',
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
          live: false,
        },
        positionals: ['config', 'show'],
      };

      expect(args.subcommand).toBe('show');
    });

    it('should allow mode to be set to different values', () => {
      const args: ParsedCliArgs = {
        command: 'server',
        options: {
          help: false,
          version: false,
          verbose: false,
          interactive: false,
          all: false,
          mode: 'mesh',
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
          live: false,
        },
        positionals: [],
      };

      expect(args.options.mode).toBe('mesh');
    });
  });
});

describe('CLI Command Priority', () => {
  it('should prioritize help flag over version flag', () => {
    const result = parseCliArgs(['--help', '--version']);
    expect(result.command).toBe('help');
  });

  it('should return command with help flag for per-command help', () => {
    // Per-command help: `nexus-agents config --help` returns 'config' with help=true
    // The main() function intercepts this to show per-command help
    const result = parseCliArgs(['config', '--help']);
    expect(result.command).toBe('config');
    expect(result.options.help).toBe(true);
  });

  it('should prioritize version flag over positional command', () => {
    const result = parseCliArgs(['config', '--version']);
    expect(result.command).toBe('version');
  });
});
