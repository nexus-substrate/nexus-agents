/**
 * nexus-agents scaffold command
 *
 * Generates project files following nexus-agents conventions.
 * Supports scaffolding MCP tools, expert types, workflow templates, and CLI commands.
 *
 * @module cli/scaffold
 * (Source: Issue #653 - Scaffold command)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  generateToolFiles,
  generateExpertFiles,
  generateWorkflowFiles,
  generateCommandFiles,
  type GeneratedFile,
} from './scaffold-templates.js';

/** Scaffold types supported by the command. */
export type ScaffoldType = 'tool' | 'expert' | 'workflow' | 'command';

/** Valid scaffold types for runtime validation. */
const VALID_SCAFFOLD_TYPES: readonly ScaffoldType[] = ['tool', 'expert', 'workflow', 'command'];

/** Options for the scaffold command. */
export interface ScaffoldOptions {
  readonly type: ScaffoldType;
  readonly name: string;
  readonly dryRun?: boolean;
}

/** Result of a scaffold operation. */
export interface ScaffoldResult {
  readonly success: boolean;
  readonly filesCreated: readonly string[];
  readonly message: string;
}

/** Checks if a value is a valid scaffold type. */
export function isValidScaffoldType(value: string): value is ScaffoldType {
  return (VALID_SCAFFOLD_TYPES as readonly string[]).includes(value);
}

/** Validates a scaffold name (kebab-case, starts with letter, max 50 chars). */
export function validateName(name: string): string | undefined {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return 'Name must be kebab-case (lowercase letters, numbers, hyphens, starting with a letter)';
  }
  if (name.length > 50) {
    return 'Name must be 50 characters or less';
  }
  return undefined;
}

/** Converts kebab-case to PascalCase. */
export function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

/** Converts kebab-case to camelCase. */
export function toCamelCase(name: string): string {
  return name
    .split('-')
    .map((s, i) => (i === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join('');
}

/** Converts kebab-case to SCREAMING_SNAKE_CASE. */
export function toScreamingSnake(name: string): string {
  return name.toUpperCase().replace(/-/g, '_');
}

/** Selects the appropriate file generator for the scaffold type. */
function getFilesForType(type: ScaffoldType, name: string): GeneratedFile[] {
  switch (type) {
    case 'tool':
      return generateToolFiles(name);
    case 'expert':
      return generateExpertFiles(name);
    case 'workflow':
      return generateWorkflowFiles(name);
    case 'command':
      return generateCommandFiles(name);
  }
}

/** Formats a dry-run result message. */
function formatDryRunMessage(paths: readonly string[]): string {
  const lines = paths.map((p) => `  ${p}`).join('\n');
  return `Dry run - would create ${String(paths.length)} file(s):\n${lines}`;
}

/** Writes generated files to disk, checking for conflicts. */
function writeFiles(files: GeneratedFile[]): ScaffoldResult {
  const createdPaths: string[] = [];

  for (const file of files) {
    const fullPath = path.resolve(process.cwd(), file.path);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(fullPath)) {
      return {
        success: false,
        filesCreated: createdPaths,
        message: `File already exists: ${file.path}. Use a different name.`,
      };
    }

    fs.writeFileSync(fullPath, file.content, 'utf-8');
    createdPaths.push(file.path);
  }

  const lines = createdPaths.map((p) => `  ${p}`).join('\n');
  return {
    success: true,
    filesCreated: createdPaths,
    message: `Created ${String(createdPaths.length)} file(s):\n${lines}`,
  };
}

/** Runs the scaffold command logic. */
export function runScaffold(options: ScaffoldOptions): ScaffoldResult {
  const nameError = validateName(options.name);
  if (nameError !== undefined) {
    return { success: false, filesCreated: [], message: nameError };
  }

  const files = getFilesForType(options.type, options.name);

  if (options.dryRun === true) {
    const paths = files.map((f) => f.path);
    return { success: true, filesCreated: paths, message: formatDryRunMessage(paths) };
  }

  return writeFiles(files);
}

/** Prints the scaffold result to stdout. */
export function printScaffoldResult(result: ScaffoldResult): void {
  process.stdout.write(result.message + '\n');
}

/** Prints scaffold usage information. */
export function printScaffoldUsage(): void {
  process.stdout.write('Usage: nexus-agents scaffold <type> <name> [options]\n');
  process.stdout.write('\nTypes:\n');
  process.stdout.write('  tool       Generate an MCP tool with schema + test\n');
  process.stdout.write('  expert     Generate an expert knowledge module\n');
  process.stdout.write('  workflow   Generate a workflow YAML template\n');
  process.stdout.write('  command    Generate a CLI command with test\n');
  process.stdout.write('\nOptions:\n');
  process.stdout.write('  --dry-run  Show what would be created without writing files\n');
  process.stdout.write('\nExamples:\n');
  process.stdout.write('  nexus-agents scaffold tool code-analysis\n');
  process.stdout.write('  nexus-agents scaffold expert performance\n');
  process.stdout.write('  nexus-agents scaffold workflow deploy-check\n');
  process.stdout.write('  nexus-agents scaffold command migrate --dry-run\n');
}

/** Main scaffold command entry point. Returns exit code. */
export function scaffoldCommand(options: ScaffoldOptions): number {
  const result = runScaffold(options);
  printScaffoldResult(result);
  return result.success ? 0 : 1;
}
