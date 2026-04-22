/**
 * Tests for entrypoint-cli-extractor.
 *
 * Post-#2156 the extractor reads command names + descriptions from
 * `cli-command-catalog.ts` (single source of truth) and only uses ts-morph
 * for handler source-line lookups and PARSE_ARGS_CONFIG option parsing.
 * Previous tests that fed synthetic HELP_TEXT strings into the regex
 * parser were deleted — the regex is gone.
 *
 * @module indexer/entrypoint-cli-extractor.test
 */

import { describe, it, expect } from 'vitest';
import { SyntaxKind } from 'ts-morph';
import { extractCliCommands } from './entrypoint-cli-extractor.js';
import { COMMAND_CATALOG, catalogForExtractors } from '../cli-command-catalog.js';

// ============================================================================
// Mock Helpers
// ============================================================================

/** Creates a mock option object literal with type, short, and default. */
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
              getInitializer: () => ({ getText: () => val }),
            };
          }
          return undefined;
        },
      };
    },
  };
}

/** Creates a mock SourceFile for cli-types.ts (PARSE_ARGS_CONFIG only). */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockTypesFile(
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
                                    return { getProperties: () => optionProps };
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

/** Creates a mock commands SourceFile. Pass a map of handlerName → line. */
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

/** Creates a mock Project that returns specific source files by suffix match. */
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
// Tests
// ============================================================================

describe('extractCliCommands (post-#2156: reads from catalog)', () => {
  describe('catalog-driven extraction', () => {
    it('emits exactly the commands in the catalog (minus the (default) placeholder)', () => {
      const typesFile = makeMockTypesFile([]);
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

      expect(result.length).toBe(catalogForExtractors().length);
      for (const cmd of result) {
        expect(cmd.name).not.toBe('(default)');
      }
    });

    it('preserves the catalog description verbatim', () => {
      const typesFile = makeMockTypesFile([]);
      const cmdsFile = makeMockCommandsFile({ handleDoctorCommand: 42 });
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
      const catalogDoctor = COMMAND_CATALOG.find((c) => c.command === 'doctor');
      expect(doctor?.description).toBe(catalogDoctor?.description);
    });

    it('emits internal-tier commands (#2156 — they are real commands, just hidden from --help)', () => {
      const typesFile = makeMockTypesFile([]);
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
      const names = result.map((c) => c.name);
      expect(names).toContain('e2e-eval');
      expect(names).toContain('warm-up');
      expect(names).toContain('memory-benchmark');
    });
  });

  describe('source_line lookup via ts-morph', () => {
    it('uses the handler function start line when found', () => {
      const typesFile = makeMockTypesFile([]);
      const cmdsFile = makeMockCommandsFile({
        handleDoctorCommand: 42,
        handleOrchestrateCommand: 100,
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
      expect(result.find((c) => c.name === 'doctor')?.source_line).toBe(42);
      expect(result.find((c) => c.name === 'orchestrate')?.source_line).toBe(100);
    });

    it('defaults source_line to 1 when handler not found', () => {
      const typesFile = makeMockTypesFile([]);
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
      // All handlers missing from mock → source_line is 1 for every command.
      expect(result.every((c) => c.source_line === 1)).toBe(true);
    });
  });

  describe('option binding', () => {
    it('attaches orchestrate options', () => {
      const typesFile = makeMockTypesFile([
        { name: 'model', type: "'string'" },
        { name: 'format', type: "'string'" },
        { name: 'verbose', type: "'boolean'" },
      ]);
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
      const orchestrate = result.find((c) => c.name === 'orchestrate');
      const optNames = (orchestrate as unknown as { options?: { name: string }[] }).options?.map(
        (o) => o.name
      );
      expect(optNames).toEqual(expect.arrayContaining(['model', 'format', 'verbose']));
    });

    it('attaches routing-audit options', () => {
      const typesFile = makeMockTypesFile([
        { name: 'format', type: "'string'" },
        { name: 'verbose', type: "'boolean'" },
        { name: 'dry-run', type: "'boolean'" },
        { name: 'bandit-stats', type: "'boolean'" },
      ]);
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
      const routing = result.find((c) => c.name === 'routing-audit');
      const optNames = (routing as unknown as { options?: { name: string }[] }).options?.map(
        (o) => o.name
      );
      expect(optNames).toEqual(expect.arrayContaining(['format', 'verbose']));
    });
  });

  describe('warnings channel (#2153)', () => {
    it('pushes a warning when commands file not found', () => {
      const typesFile = makeMockTypesFile([]);
      const project = makeMockProject({ 'cli-types.ts': typesFile });
      const warnings: string[] = [];
      extractCliCommands(project as never, '/pkg', 'cli-commands.ts', 'cli-types.ts', warnings);
      expect(warnings.some((w) => /commands file not loaded/.test(w))).toBe(true);
    });

    it('pushes a warning when types file not loaded (options missing)', () => {
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({ 'cli-commands.ts': cmdsFile });
      const warnings: string[] = [];
      extractCliCommands(project as never, '/pkg', 'cli-commands.ts', 'cli-types.ts', warnings);
      expect(warnings.some((w) => /types file not loaded/.test(w))).toBe(true);
    });

    it('pushes a warning when a cataloged command has no matching handler (naming drift)', () => {
      const typesFile = makeMockTypesFile([]);
      // Only `doctor` has a handler; other catalog entries trigger the warning.
      const cmdsFile = makeMockCommandsFile({ handleDoctorCommand: 10 });
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });
      const warnings: string[] = [];
      extractCliCommands(project as never, '/pkg', 'cli-commands.ts', 'cli-types.ts', warnings);
      expect(warnings.some((w) => /naming drift/.test(w))).toBe(true);
    });

    it('is backwards compatible — works without the warnings arg', () => {
      const typesFile = makeMockTypesFile([]);
      const cmdsFile = makeMockCommandsFile({});
      const project = makeMockProject({
        'cli-types.ts': typesFile,
        'cli-commands.ts': cmdsFile,
      });
      expect(() => {
        extractCliCommands(project as never, '/pkg', 'cli-commands.ts', 'cli-types.ts');
      }).not.toThrow();
    });
  });
});
