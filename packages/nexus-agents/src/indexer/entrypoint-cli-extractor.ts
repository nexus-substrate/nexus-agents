/**
 * nexus-agents/indexer - CLI Command Extractor
 *
 * Emits `CliCommandSpec[]` for the entrypoints manifest.
 *
 * Command names + descriptions are read from the `cli-command-catalog.ts`
 * single-source-of-truth (#2156). Handler source lines and per-command
 * option bindings are still resolved via ts-morph against
 * `cli-commands.ts` and `cli-types.ts`.
 *
 * Prior to #2156 this module parsed commands out of the HELP_TEXT string
 * via regex — that regex had a long-standing miss on long command names
 * (#2146, release-validate / release-announce / learning-metrics) and
 * silently disagreed with `scripts/generate-repo-index.ts` on command
 * count. Reading from the catalog removes both failure modes.
 *
 * (Source: Epic #261 - Automated Documentation System)
 */

import { SyntaxKind, type Project, type SourceFile } from 'ts-morph';
import * as path from 'node:path';
import type { CliCommandSpec, OptionSpec } from './entrypoint-types.js';
import { catalogForExtractors } from '../cli-command-catalog.js';

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
 *
 * Legacy hand-crafted mapping from before PARSE_ARGS_CONFIG was parseable
 * via ts-morph. Kept for stability of the manifest output — switching it
 * to a declarative per-command option list is a separate change.
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

/** Per-catalog-entry build context — packaged to keep buildCommandSpec ≤5 params. */
interface BuildContext {
  readonly commandsFile: SourceFile;
  readonly relativePath: string;
  readonly cliOptions: Map<string, OptionSpec>;
  readonly cliCommandsPath: string;
  readonly warnings?: string[];
}

/**
 * Builds one `CliCommandSpec` from a catalog entry. Extracted to keep
 * `extractCliCommands` under the 50-line cap.
 */
function buildCommandSpec(
  entry: { command: string; description: string },
  ctx: BuildContext
): CliCommandSpec {
  const handlerName = `handle${toPascalCase(entry.command)}Command`;
  const handlerFunc = ctx.commandsFile.getFunction(handlerName);
  const sourceLine = handlerFunc?.getStartLineNumber() ?? 1;

  if (handlerFunc === undefined && ctx.warnings !== undefined) {
    ctx.warnings.push(
      `CLI extraction: catalog entry "${entry.command}" has no matching ` +
        `${handlerName} function in ${ctx.cliCommandsPath}. Check naming drift.`
    );
  }

  const cmdOptions = getCommandOptions(entry.command, ctx.cliOptions);
  const cmdSpec: CliCommandSpec = {
    name: entry.command,
    description: entry.description,
    source_file: ctx.relativePath,
    source_line: sourceLine,
  };
  if (cmdOptions.length > 0) {
    (cmdSpec as { options: readonly OptionSpec[] }).options = cmdOptions;
  }
  return cmdSpec;
}

/**
 * Extracts CLI commands from the catalog + cli-commands source file.
 *
 * Name and description come from `cli-command-catalog.ts`. Handler source
 * location comes from locating `handle<PascalName>Command` in
 * `cli-commands.ts` via ts-morph. Option bindings come from
 * `PARSE_ARGS_CONFIG` in `cli-types.ts`.
 *
 * @param warnings - Optional sink for non-fatal diagnostics (#2153).
 */
export function extractCliCommands(
  project: Project,
  packageRoot: string,
  cliCommandsPath: string,
  cliTypesPath: string,
  warnings?: string[]
): CliCommandSpec[] {
  const typesFullPath = path.join(packageRoot, cliTypesPath);
  const typesFile = project.getSourceFile(typesFullPath);
  if (typesFile === undefined && warnings !== undefined) {
    warnings.push(
      `CLI extraction: types file not loaded (${typesFullPath}). ` +
        `PARSE_ARGS_CONFIG options will be missing from the manifest.`
    );
  }
  const cliOptions =
    typesFile !== undefined ? extractCliOptions(typesFile) : new Map<string, OptionSpec>();

  const commandsFullPath = path.join(packageRoot, cliCommandsPath);
  const commandsFile = project.getSourceFile(commandsFullPath);
  if (commandsFile === undefined) {
    if (warnings !== undefined) {
      warnings.push(
        `CLI extraction: commands file not loaded (${commandsFullPath}). ` +
          `Returning zero commands.`
      );
    }
    return [];
  }

  const ctx: BuildContext = {
    commandsFile,
    relativePath: path.relative(process.cwd(), commandsFullPath),
    cliOptions,
    cliCommandsPath,
    ...(warnings !== undefined && { warnings }),
  };
  return catalogForExtractors().map((entry) => buildCommandSpec(entry, ctx));
}
