/**
 * nexus-agents/indexer - CLI Command Extractor
 *
 * Extracts CLI commands from source code using TypeScript AST parsing.
 *
 * (Source: Epic #261 - Automated Documentation System)
 */

import { SyntaxKind, type Project, type SourceFile } from 'ts-morph';
import * as path from 'node:path';
import type { CliCommandSpec, OptionSpec } from './entrypoint-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * CLI command metadata from HELP_TEXT parsing.
 */
interface CliCommandMeta {
  name: string;
  description: string;
  subcommands: string[];
}

// ============================================================================
// HELP_TEXT Parsing
// ============================================================================

/**
 * Parses CLI commands from the HELP_TEXT constant.
 * Looks for the COMMANDS: section and extracts command names/descriptions.
 */
// eslint-disable-next-line complexity -- AST parsing requires nested conditions
function parseHelpTextCommands(helpText: string): CliCommandMeta[] {
  const commands: CliCommandMeta[] = [];
  const lines = helpText.split('\n');
  let inCommandsSection = false;

  for (const line of lines) {
    // Detect section boundaries
    if (line.trim() === 'COMMANDS:') {
      inCommandsSection = true;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.endsWith(':') && trimmed !== 'COMMANDS:' && !trimmed.startsWith('-')) {
      inCommandsSection = false;
      continue;
    }

    if (!inCommandsSection) continue;

    // Parse command lines (format: "  command       Description")
    const match = line.match(/^\s{2}(\S+(?:\s+\S+)?)\s{2,}(.+)$/);
    if (match !== null) {
      const cmdPart = match[1];
      const descriptionPart = match[2];
      if (cmdPart === undefined || descriptionPart === undefined) continue;

      const parts = cmdPart.trim().split(/\s+/);
      const name = parts[0];
      if (name === undefined) continue;

      const subcommand = parts.length > 1 ? parts[1] : undefined;

      // Find existing command or create new
      const existing = commands.find((c) => c.name === name);
      if (existing !== undefined && subcommand !== undefined) {
        existing.subcommands.push(subcommand);
      } else if (existing === undefined) {
        commands.push({
          name,
          description: descriptionPart.trim(),
          subcommands: subcommand !== undefined ? [subcommand] : [],
        });
      }
    }
  }

  return commands;
}

// ============================================================================
// Options Extraction
// ============================================================================

/**
 * Extracts options from the PARSE_ARGS_CONFIG object.
 */
// eslint-disable-next-line complexity -- AST traversal requires nested conditions
function extractCliOptions(sourceFile: SourceFile): Map<string, OptionSpec> {
  const options = new Map<string, OptionSpec>();

  // Find PARSE_ARGS_CONFIG variable declaration
  const configVar = sourceFile.getVariableDeclaration('PARSE_ARGS_CONFIG');
  if (configVar === undefined) return options;

  const objLiteral = configVar.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (objLiteral === undefined) return options;

  const optionsProperty = objLiteral.getProperty('options');
  if (optionsProperty === undefined) return options;

  const optionsObj = optionsProperty
    .asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer()
    ?.asKind(SyntaxKind.ObjectLiteralExpression);
  if (optionsObj === undefined) return options;

  // Parse each option
  for (const prop of optionsObj.getProperties()) {
    const propAssign = prop.asKind(SyntaxKind.PropertyAssignment);
    if (propAssign === undefined) continue;

    const optName = propAssign.getName().replace(/['"]/g, '');
    const optValue = propAssign.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (optValue === undefined) continue;

    const spec: OptionSpec = {
      name: optName,
      type: 'string', // Default
    };

    extractOptionType(optValue, spec);
    extractOptionShort(optValue, spec);
    extractOptionDefault(optValue, spec);

    options.set(optName, spec);
  }

  return options;
}

/**
 * Extracts the type from an option object.
 */
function extractOptionType(optValue: unknown, spec: OptionSpec): void {
  const obj = optValue as {
    getProperty(name: string): { asKind(kind: unknown): unknown } | undefined;
  };
  const typeProp = obj.getProperty('type');
  if (typeProp === undefined) return;

  const propAssign = typeProp.asKind(SyntaxKind.PropertyAssignment) as
    | { getInitializer(): { getText(): string } | undefined }
    | undefined;
  if (propAssign === undefined) return;

  const init = propAssign.getInitializer();
  if (init === undefined) return;

  const text = init.getText();
  const typeValue = text.replace(/['"]/g, '').replace(' as const', '');
  if (typeValue !== '') {
    (spec as { type: string }).type = typeValue;
  }
}

/**
 * Extracts the short alias from an option object.
 */
function extractOptionShort(optValue: unknown, spec: OptionSpec): void {
  const obj = optValue as {
    getProperty(name: string): { asKind(kind: unknown): unknown } | undefined;
  };
  const shortProp = obj.getProperty('short');
  if (shortProp === undefined) return;

  const propAssign = shortProp.asKind(SyntaxKind.PropertyAssignment) as
    | { getInitializer(): { getText(): string } | undefined }
    | undefined;
  if (propAssign === undefined) return;

  const init = propAssign.getInitializer();
  if (init === undefined) return;

  const text = init.getText().replace(/['"]/g, '');
  if (text !== '') {
    (spec as { short: string }).short = text;
  }
}

/**
 * Extracts the default value from an option object.
 */
function extractOptionDefault(optValue: unknown, spec: OptionSpec): void {
  const obj = optValue as {
    getProperty(name: string): { asKind(kind: unknown): unknown } | undefined;
  };
  const defaultProp = obj.getProperty('default');
  if (defaultProp === undefined) return;

  const propAssign = defaultProp.asKind(SyntaxKind.PropertyAssignment) as
    | { getInitializer(): { getText(): string } | undefined }
    | undefined;
  if (propAssign === undefined) return;

  const init = propAssign.getInitializer();
  if (init === undefined) return;

  const text = init.getText();
  if (text !== '') {
    (spec as { default: string }).default = text;
  }
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Converts kebab-case to PascalCase.
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Maps command options based on command name.
 */
function getCommandOptions(name: string, cliOptions: Map<string, OptionSpec>): OptionSpec[] {
  const cmdOptions: OptionSpec[] = [];
  let optionNames: string[] = [];

  if (name === 'orchestrate') {
    optionNames = ['model', 'format', 'verbose', 'dry-run', 'max-tokens', 'max-cost-usd'];
  } else if (['workflow', 'config'].includes(name)) {
    optionNames = ['input', 'output', 'force', 'dry-run', 'verbose'];
  } else if (name === 'routing-audit') {
    optionNames = ['format', 'verbose', 'dry-run', 'bandit-stats'];
  } else if (name === 'vote') {
    optionNames = ['proposal', 'threshold', 'quick', 'dry-run', 'verbose'];
  } else if (name === 'index') {
    optionNames = ['format', 'output', 'verbose'];
  } else {
    optionNames = ['verbose', 'help'];
  }

  for (const opt of optionNames) {
    const spec = cliOptions.get(opt);
    if (spec !== undefined) cmdOptions.push(spec);
  }

  return cmdOptions;
}

/**
 * Loads and parses the CLI command metadata from HELP_TEXT.
 *
 * HELP_TEXT was split out of cli-types.ts in #293 (Jan 2026) and now lives
 * in cli-help-text.ts. cli-types.ts only re-exports it; ts-morph doesn't
 * chase re-exports for variable declarations, so we read from the source
 * file directly. The typesFile fallback is kept for robustness.
 */
function loadHelpTextCommands(
  project: Project,
  packageRoot: string,
  typesFile: SourceFile | undefined
): CliCommandMeta[] {
  const helpTextPath = path.join(packageRoot, 'src/cli-help-text.ts');
  const helpTextFile = project.getSourceFile(helpTextPath) ?? typesFile;
  if (helpTextFile === undefined) return [];

  const helpTextVar = helpTextFile.getVariableDeclaration('HELP_TEXT');
  if (helpTextVar === undefined) return [];

  const helpText = helpTextVar.getInitializer()?.getText() ?? '';
  const cleanText = helpText
    .slice(1, -1)
    .replace(/^\s*\n/, '')
    .replace(/\n\s*$/, '');
  return parseHelpTextCommands(cleanText);
}

/**
 * Extracts CLI commands from source files.
 */
export function extractCliCommands(
  project: Project,
  packageRoot: string,
  cliCommandsPath: string,
  cliTypesPath: string
): CliCommandSpec[] {
  const commands: CliCommandSpec[] = [];

  const typesFullPath = path.join(packageRoot, cliTypesPath);
  const typesFile = project.getSourceFile(typesFullPath);
  const helpTextCommands = loadHelpTextCommands(project, packageRoot, typesFile);
  const cliOptions =
    typesFile !== undefined ? extractCliOptions(typesFile) : new Map<string, OptionSpec>();

  // Load CLI commands file for source locations
  const commandsFullPath = path.join(packageRoot, cliCommandsPath);
  const commandsFile = project.getSourceFile(commandsFullPath);

  if (commandsFile === undefined) return commands;

  // Map commands from HELP_TEXT with source locations from switch cases
  const relativePath = path.relative(process.cwd(), commandsFullPath);

  for (const cmdMeta of helpTextCommands) {
    // Skip (default) command as it's not a real command
    if (cmdMeta.name === '(default)') continue;

    // Find the handler function for this command
    const handlerName = `handle${toPascalCase(cmdMeta.name)}Command`;
    const handlerFunc = commandsFile.getFunction(handlerName);
    const sourceLine = handlerFunc?.getStartLineNumber() ?? 1;

    // Get options for this command
    const cmdOptions = getCommandOptions(cmdMeta.name, cliOptions);

    const cmdSpec: CliCommandSpec = {
      name: cmdMeta.name,
      description: cmdMeta.description,
      source_file: relativePath,
      source_line: sourceLine,
    };
    if (cmdMeta.subcommands.length > 0) {
      (cmdSpec as { subcommands: readonly string[] }).subcommands = cmdMeta.subcommands;
    }
    if (cmdOptions.length > 0) {
      (cmdSpec as { options: readonly OptionSpec[] }).options = cmdOptions;
    }
    commands.push(cmdSpec);
  }

  return commands;
}
