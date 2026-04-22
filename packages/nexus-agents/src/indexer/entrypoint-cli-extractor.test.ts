/**
 * Tests for entrypoint-cli-extractor.
 *
 * Covers: extractCliCommands (exported), and exercises internal helpers
 * parseHelpTextCommands, toPascalCase, getCommandOptions, extractCliOptions
 * via mock ts-morph objects.
 *
 * @module indexer/entrypoint-cli-extractor.test
 */

import { describe, it, expect } from 'vitest';
import { SyntaxKind } from 'ts-morph';
import { extractCliCommands } from './entrypoint-cli-extractor.js';

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Creates a mock option object literal with type, short, and default.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockOptionObjLiteral(optType?: string, short?: string, defaultVal?: string) {
  const props = new Map<string, string>();
  if (optType !== undefined) props.set('type', optType);
  if (short !== undefined) props.set('short', short);
  if (defaultVal !== undefined) props.set('default', defaultVal);

  return {
    getProperty: (propName: string) => {
      const val = props.get(propName);
      if (val === undefined) return undefined;
      return {
        asKind: (kind: unknown) => {
          if (kind === SyntaxKind.PropertyAssignment) {
            return {
              getInitializer: () => ({
                getText: () => val,
              }),
            };
          }
          return undefined;
        },
      };
    },
  };
}

/**
 * Creates a mock SourceFile for the types file (HELP_TEXT + PARSE_ARGS_CONFIG).
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockTypesFile(
  helpText: string,
  optionEntries: Array<{ name: string; type?: string; short?: string; default?: string }>
) {
  const optionProps = optionEntries.map((entry) => {
    const objLit = makeMockOptionObjLiteral(entry.type, entry.short, entry.default);
    return {
      asKind: (kind: unknown) => {
        if (kind === SyntaxKind.PropertyAssignment) {
          return {
            getName: () => entry.name,
            getInitializer: () => ({
              asKind: (k2: unknown) => {
                if (k2 === SyntaxKind.ObjectLiteralExpression) return objLit;
                return undefined;
              },
            }),
          };
        }
        return undefined;
      },
    };
  });

  return {
    getVariableDeclaration: (name: string) => {
      if (name === 'HELP_TEXT') {
        return {
          getInitializer: () => ({
            getText: () => '`' + helpText + '`',
          }),
        };
      }
      if (name === 'PARSE_ARGS_CONFIG') {
        return {
          getInitializer: () => ({
            asKind: (kind: unknown) => {
              if (kind === SyntaxKind.ObjectLiteralExpression) {
                return {
                  getProperty: (propName: string) => {
                    if (propName === 'options') {
                      return {
                        asKind: (k2: unknown) => {
                          if (k2 === SyntaxKind.PropertyAssignment) {
                            return {
                              getInitializer: () => ({
                                asKind: (k3: unknown) => {
                                  if (k3 === SyntaxKind.ObjectLiteralExpression) {
                                    return {
                                      getProperties: () => optionProps,
                                    };
                                  }
                                  return undefined;
                                },
                              }),
                            };
                          }
                          return undefined;
                        },
                      };
                    }
                    return undefined;
                  },
                };
              }
              return undefined;
            },
          }),
        };
      }
      return undefined;
    },
  };
}

/**
 * Creates a mock commands SourceFile with function declarations.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockCommandsFile(handlers: Record<string, number>) {
  return {
    getFunction: (name: string) => {
      const line = handlers[name];
      if (line === undefined) return undefined;
      return { getStartLineNumber: () => line };
    },
  };
}

/**
 * Creates a mock Project that returns specific source files.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockProject(files: Record<string, unknown>) {
  return {
    getSourceFile: (filePath: string) => {
      for (const [key, value] of Object.entries(files)) {
        if (filePath.endsWith(key) || filePath === key) return value;
      }
      return undefined;
    },
  };
}

// ============================================================================
// HELP_TEXT Fixtures
// ============================================================================

const BASIC_HELP_TEXT = `
nexus-agents - Multi-agent orchestration

COMMANDS:
  doctor          Check system health
  orchestrate     Run task orchestration
  vote            Consensus voting

OPTIONS:
  --help          Show help
`;

const HELP_TEXT_WITH_SUBCOMMANDS = `
COMMANDS:
  workflow list   List available workflows
  workflow run    Run a workflow
  config init     Initialize configuration
  config show     Show current config
  doctor          Check system health
`;

const EMPTY_HELP_TEXT = `
nexus-agents

OPTIONS:
  --help   Show help
`;

const HELP_TEXT_NO_COMMANDS_SECTION = `
nexus-agents - Multi-agent orchestration

OPTIONS:
  --verbose       Enable verbose output
`;

const HELP_TEXT_WITH_DEFAULT = `
COMMANDS:
  (default)       Show help text
  doctor          Check system health
  orchestrate     Orchestrate tasks
`;

// ============================================================================
// extractCliCommands Tests
// ============================================================================

describe('extractCliCommands', () => {
  // --------------------------------------------------------------------------
  // Basic extraction
  // --------------------------------------------------------------------------

  describe('basic command extraction', () => {
    it('should extract simple commands from HELP_TEXT', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, []);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 10,
        handleOrchestrateCommand: 50,
        handleVoteCommand: 100,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      expect(result).toHaveLength(3);
      const names = result.map((c) => c.name);
      expect(names).toContain('doctor');
      expect(names).toContain('orchestrate');
      expect(names).toContain('vote');
    });

    it('finds HELP_TEXT in cli-help-text.ts when cli-types.ts only has PARSE_ARGS_CONFIG (regression: 3-month silent empty output)', () => {
      // Simulates the real layout after #293 (Jan 2026): HELP_TEXT lives in
      // cli-help-text.ts and cli-types.ts only re-exports it. Prior to the
      // fix, the extractor only looked in cli-types.ts and returned zero
      // commands. See fix/entrypoint-cli-extractor-help-text-load.
      const typesFile = makeMockTypesFile('', []);
      // Override so the types file intentionally has no HELP_TEXT declaration
      // — mirrors the real post-split state where only a re-export exists.
      (typesFile as { getVariableDeclaration: (name: string) => unknown }).getVariableDeclaration =
        (name: string) =>
          name === 'HELP_TEXT' ? undefined : makeMockTypesFile('', []).getVariableDeclaration(name);

      const helpTextFile = {
        getVariableDeclaration: (name: string) =>
          name === 'HELP_TEXT'
            ? { getInitializer: () => ({ getText: () => '`' + BASIC_HELP_TEXT + '`' }) }
            : undefined,
      };
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 10,
        handleOrchestrateCommand: 50,
        handleVoteCommand: 100,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-help-text.ts': helpTextFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      expect(result).toHaveLength(3);
      expect(result.map((c) => c.name)).toEqual(
        expect.arrayContaining(['doctor', 'orchestrate', 'vote'])
      );
    });

    it('should extract command descriptions', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, []);
      const cmdsFile = makeMockCommandsFile({ handleDoctorCommand: 10 });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const doctor = result.find((c) => c.name === 'doctor');
      expect(doctor).toBeDefined();
      expect(doctor?.description).toBe('Check system health');
    });

    it('should set source_line from handler function', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, []);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 42,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const doctor = result.find((c) => c.name === 'doctor');
      expect(doctor?.source_line).toBe(42);
    });

    it('should default source_line to 1 when handler not found', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, []);
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      for (const cmd of result) {
        expect(cmd.source_line).toBe(1);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Subcommand extraction
  // --------------------------------------------------------------------------

  describe('subcommand extraction', () => {
    it('should extract subcommands for composite commands', () => {
      const typesFile = makeMockTypesFile(HELP_TEXT_WITH_SUBCOMMANDS, []);
      const cmdsFile = makeMockCommandsFile({
        handleWorkflowCommand: 10,
        handleConfigCommand: 50,
        handleDoctorCommand: 90,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const workflow = result.find((c) => c.name === 'workflow');
      expect(workflow).toBeDefined();
      expect(workflow?.subcommands).toContain('list');
      expect(workflow?.subcommands).toContain('run');
    });

    it('should group subcommands under the same parent', () => {
      const typesFile = makeMockTypesFile(HELP_TEXT_WITH_SUBCOMMANDS, []);
      const cmdsFile = makeMockCommandsFile({
        handleConfigCommand: 50,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const config = result.find((c) => c.name === 'config');
      expect(config).toBeDefined();
      expect(config?.subcommands).toEqual(['init', 'show']);
    });

    it('should not add subcommands property for simple commands', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, []);
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const doctor = result.find((c) => c.name === 'doctor');
      expect(doctor?.subcommands).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Options mapping
  // --------------------------------------------------------------------------

  describe('options mapping', () => {
    it('should attach options for orchestrate command', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, [
        { name: 'model', type: "'string'", short: "'m'" },
        { name: 'format', type: "'string'" },
        { name: 'verbose', type: "'boolean'", short: "'v'" },
        { name: 'dry-run', type: "'boolean'" },
        { name: 'max-tokens', type: "'string'" },
        { name: 'max-cost-usd', type: "'string'" },
      ]);
      const cmdsFile = makeMockCommandsFile({
        handleOrchestrateCommand: 20,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const orchestrate = result.find((c) => c.name === 'orchestrate');
      expect(orchestrate?.options).toBeDefined();
      expect(orchestrate?.options?.length).toBe(6);
      const optNames = orchestrate?.options?.map((o) => o.name) ?? [];
      expect(optNames).toContain('model');
      expect(optNames).toContain('verbose');
      expect(optNames).toContain('dry-run');
    });

    it('should attach options for vote command', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, [
        { name: 'proposal', type: "'string'" },
        { name: 'threshold', type: "'string'" },
        { name: 'quick', type: "'boolean'" },
        { name: 'dry-run', type: "'boolean'" },
        { name: 'verbose', type: "'boolean'" },
      ]);
      const cmdsFile = makeMockCommandsFile({
        handleVoteCommand: 30,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const vote = result.find((c) => c.name === 'vote');
      expect(vote?.options).toBeDefined();
      const optNames = vote?.options?.map((o) => o.name) ?? [];
      expect(optNames).toContain('proposal');
      expect(optNames).toContain('threshold');
      expect(optNames).toContain('quick');
    });

    it('should default to verbose+help for unknown commands', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, [
        { name: 'verbose', type: "'boolean'" },
        { name: 'help', type: "'boolean'" },
      ]);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 10,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const doctor = result.find((c) => c.name === 'doctor');
      expect(doctor?.options).toBeDefined();
      const optNames = doctor?.options?.map((o) => o.name) ?? [];
      expect(optNames).toContain('verbose');
      expect(optNames).toContain('help');
    });

    it('should not add options when none match', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, []);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 10,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const doctor = result.find((c) => c.name === 'doctor');
      expect(doctor?.options).toBeUndefined();
    });

    it('should parse option type removing quotes and as-const', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, [
        { name: 'verbose', type: "'boolean' as const" },
        { name: 'help', type: "'boolean'" },
      ]);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 10,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const doctor = result.find((c) => c.name === 'doctor');
      const verbose = doctor?.options?.find((o) => o.name === 'verbose');
      expect(verbose?.type).toBe('boolean');
    });

    it('should extract short alias from options', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, [
        { name: 'verbose', type: "'boolean'", short: "'v'" },
        { name: 'help', type: "'boolean'" },
      ]);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 10,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const doctor = result.find((c) => c.name === 'doctor');
      const verbose = doctor?.options?.find((o) => o.name === 'verbose');
      expect(verbose?.short).toBe('v');
    });

    it('should extract default value from options', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, [
        { name: 'verbose', type: "'boolean'", default: 'false' },
        { name: 'help', type: "'boolean'" },
      ]);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 10,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const doctor = result.find((c) => c.name === 'doctor');
      const verbose = doctor?.options?.find((o) => o.name === 'verbose');
      expect(verbose?.default).toBe('false');
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should return empty array when types file not found', () => {
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      expect(result).toEqual([]);
    });

    it('should return empty array when commands file not found', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, []);
      const project = makeMockProject({
        'cli-types.ts': typesFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      expect(result).toEqual([]);
    });

    it('pushes a warning when commands file not found (#2153)', () => {
      // Regression: previously empty-return with no signal. #2147's 3-month
      // silent regression was the same class. Now surfaces via warnings.
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, []);
      const project = makeMockProject({ 'cli-types.ts': typesFile });
      const warnings: string[] = [];
      extractCliCommands(project as never, '/pkg', 'cli-commands.ts', 'cli-types.ts', warnings);
      expect(warnings.some((w) => /commands file not loaded/.test(w))).toBe(true);
    });

    it('pushes a warning when HELP_TEXT parses to zero commands (#2153)', () => {
      const typesFile = makeMockTypesFile(EMPTY_HELP_TEXT, []);
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });
      const warnings: string[] = [];
      extractCliCommands(project as never, '/pkg', 'cli-commands.ts', 'cli-types.ts', warnings);
      expect(warnings.some((w) => /HELP_TEXT parsed to zero commands/.test(w))).toBe(true);
    });

    it('pushes a warning when types file not loaded (#2153)', () => {
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({ 'cli-commands.ts': cmdsFile });
      const warnings: string[] = [];
      extractCliCommands(project as never, '/pkg', 'cli-commands.ts', 'cli-types.ts', warnings);
      expect(warnings.some((w) => /types file not loaded/.test(w))).toBe(true);
    });

    it('does not push warnings when warnings array is not provided (backwards compat)', () => {
      const project = makeMockProject({});
      // No warnings arg — must not throw.
      expect(() => {
        extractCliCommands(project as never, '/pkg', 'cli-commands.ts', 'cli-types.ts');
      }).not.toThrow();
    });

    it('should return empty array for empty HELP_TEXT', () => {
      const typesFile = makeMockTypesFile(EMPTY_HELP_TEXT, []);
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      expect(result).toEqual([]);
    });

    it('should return empty when HELP_TEXT has no COMMANDS section', () => {
      const typesFile = makeMockTypesFile(HELP_TEXT_NO_COMMANDS_SECTION, []);
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      expect(result).toEqual([]);
    });

    it('should skip (default) command from HELP_TEXT', () => {
      const typesFile = makeMockTypesFile(HELP_TEXT_WITH_DEFAULT, []);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 10,
        handleOrchestrateCommand: 20,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const names = result.map((c) => c.name);
      expect(names).not.toContain('(default)');
      expect(names).toContain('doctor');
      expect(names).toContain('orchestrate');
    });

    it('should handle HELP_TEXT variable missing entirely', () => {
      const typesFile = {
        getVariableDeclaration: () => undefined,
      };
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      expect(result).toEqual([]);
    });

    it('should handle PARSE_ARGS_CONFIG missing', () => {
      const typesFile = {
        getVariableDeclaration: (name: string) => {
          if (name === 'HELP_TEXT') {
            return {
              getInitializer: () => ({
                getText: () => '`' + BASIC_HELP_TEXT + '`',
              }),
            };
          }
          return undefined;
        },
      };
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 10,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      expect(result.length).toBeGreaterThan(0);
      // No options should be attached since PARSE_ARGS_CONFIG is missing
      for (const cmd of result) {
        expect(cmd.options).toBeUndefined();
      }
    });

    it('should include source_file as relative path', () => {
      const typesFile = makeMockTypesFile(BASIC_HELP_TEXT, []);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 5,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      for (const cmd of result) {
        expect(cmd.source_file).toBeDefined();
        expect(typeof cmd.source_file).toBe('string');
      }
    });
  });

  // --------------------------------------------------------------------------
  // toPascalCase via handler lookup
  // --------------------------------------------------------------------------

  describe('toPascalCase (via handler name)', () => {
    it('should convert kebab-case command to PascalCase handler', () => {
      const helpText = `
COMMANDS:
  routing-audit     Audit routing decisions
`;
      const typesFile = makeMockTypesFile(helpText, []);
      const cmdsFile = makeMockCommandsFile({
        handleRoutingAuditCommand: 77,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const routingAudit = result.find((c) => c.name === 'routing-audit');
      expect(routingAudit).toBeDefined();
      expect(routingAudit?.source_line).toBe(77);
    });

    it('should handle single-word commands (no hyphens)', () => {
      const helpText = `
COMMANDS:
  doctor     Check health
`;
      const typesFile = makeMockTypesFile(helpText, []);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 33,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      expect(result[0]?.source_line).toBe(33);
    });
  });

  // --------------------------------------------------------------------------
  // Command-specific option routing
  // --------------------------------------------------------------------------

  describe('command-specific option routing', () => {
    it('should map routing-audit to format+verbose+dry-run+bandit-stats', () => {
      const helpText = `
COMMANDS:
  routing-audit     Audit routing decisions
`;
      const typesFile = makeMockTypesFile(helpText, [
        { name: 'format', type: "'string'" },
        { name: 'verbose', type: "'boolean'" },
        { name: 'dry-run', type: "'boolean'" },
        { name: 'bandit-stats', type: "'boolean'" },
      ]);
      const cmdsFile = makeMockCommandsFile({
        handleRoutingAuditCommand: 10,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const audit = result.find((c) => c.name === 'routing-audit');
      const optNames = audit?.options?.map((o) => o.name) ?? [];
      expect(optNames).toContain('format');
      expect(optNames).toContain('bandit-stats');
    });

    it('should map index command to format+output+verbose', () => {
      const helpText = `
COMMANDS:
  index     Index codebase
`;
      const typesFile = makeMockTypesFile(helpText, [
        { name: 'format', type: "'string'" },
        { name: 'output', type: "'string'" },
        { name: 'verbose', type: "'boolean'" },
      ]);
      const cmdsFile = makeMockCommandsFile({
        handleIndexCommand: 10,
      });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });

      const result = extractCliCommands(
        project as never,
        '/pkg',
        'cli-commands.ts',
        'cli-types.ts'
      );

      const index = result.find((c) => c.name === 'index');
      const optNames = index?.options?.map((o) => o.name) ?? [];
      expect(optNames).toContain('format');
      expect(optNames).toContain('output');
      expect(optNames).toContain('verbose');
    });
  });
});
