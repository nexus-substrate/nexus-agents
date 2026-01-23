#!/usr/bin/env npx tsx
/**
 * Entrypoint Extraction Script
 *
 * Extracts CLI commands, MCP tools, and REST endpoints from source code AST
 * and generates a machine-readable manifest at docs/.generated/entrypoints.yaml.
 *
 * Usage:
 *   pnpm extract-entrypoints [--format=yaml|json] [--output=<path>] [--verbose]
 *
 * @module scripts/extract-entrypoints
 * (Source: Epic #261 - Automated Documentation System)
 */

/* eslint-disable no-console */
// Console output is intentional for CLI user feedback

// Type safety rules disabled because ESLint cannot resolve types from .js imports in scripts

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';
import { parseArgs } from 'node:util';
import { extractEntrypoints } from '../packages/nexus-agents/src/indexer/entrypoint-extractor.js';
import {
  EntrypointManifestSchema,
  type EntrypointManifest,
  type EntrypointExtractionResult,
  type ParameterSpec,
} from '../packages/nexus-agents/src/indexer/entrypoint-types.js';

// ============================================================================
// Types
// ============================================================================

interface ScriptOptions {
  format: 'yaml' | 'json';
  output: string;
  verbose: boolean;
  validate: boolean;
  help: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OUTPUT = 'docs/.generated/entrypoints.yaml';

const HELP_TEXT = `
Entrypoint Extraction Script

Extracts CLI commands, MCP tools, and REST endpoints from source code AST
and generates a machine-readable manifest.

Usage: pnpm extract-entrypoints [options]

Options:
  --format=<yaml|json>  Output format (default: yaml)
  --output=<path>       Output file path (default: ${DEFAULT_OUTPUT})
  --verbose, -v         Show detailed extraction progress
  --validate            Validate output against schema
  --help, -h            Show this help message

Examples:
  pnpm extract-entrypoints
  pnpm extract-entrypoints --format=json --output=docs/entrypoints.json
  pnpm extract-entrypoints --verbose --validate
`;

// ============================================================================
// Argument Parsing
// ============================================================================

/**
 * Parses command line arguments.
 */
function parseCliArgs(): ScriptOptions {
  const { values } = parseArgs({
    options: {
      format: { type: 'string', default: 'yaml' },
      output: { type: 'string', short: 'o' },
      verbose: { type: 'boolean', short: 'v', default: false },
      validate: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const format = values.format === 'json' ? 'json' : 'yaml';
  const rawOutput = values.output;
  const output =
    typeof rawOutput === 'string'
      ? rawOutput
      : format === 'json'
        ? 'docs/.generated/entrypoints.json'
        : DEFAULT_OUTPUT;

  return {
    format,
    output,
    verbose: Boolean(values.verbose),
    validate: Boolean(values.validate),
    help: Boolean(values.help),
  };
}

// ============================================================================
// Output Generation
// ============================================================================

/**
 * Serializes the manifest to YAML format.
 */
function toYaml(manifest: EntrypointManifest): string {
  return YAML.stringify(manifest, {
    indent: 2,
    lineWidth: 120,
  });
}

/**
 * Serializes the manifest to JSON format.
 */
function toJson(manifest: EntrypointManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Writes the manifest to a file.
 */
function writeManifest(
  manifest: EntrypointManifest,
  outputPath: string,
  format: 'yaml' | 'json'
): void {
  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = format === 'json' ? toJson(manifest) : toYaml(manifest);
  fs.writeFileSync(outputPath, content, 'utf-8');
}

// ============================================================================
// Progress Logging
// ============================================================================

/**
 * Logs progress with verbose option.
 */
function log(message: string, verbose: boolean): void {
  if (verbose) {
    console.log(`[extract-entrypoints] ${message}`);
  }
}

/**
 * Prints extraction summary.
 */
function printSummary(result: EntrypointExtractionResult): void {
  const manifest = result.manifest;
  if (manifest === undefined) {
    console.error('Extraction failed - no manifest generated');
    return;
  }

  console.log('\nExtraction Summary:');
  console.log(`  CLI Commands:    ${String(manifest.cli_commands.length)}`);
  console.log(`  MCP Tools:       ${String(manifest.mcp_tools.length)}`);
  console.log(`  REST Endpoints:  ${String(manifest.rest_endpoints.length)}`);

  const warnings = result.warnings;
  if (warnings.length > 0) {
    console.log(`\nWarnings (${String(warnings.length)}):`);
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }

  const errors = result.errors;
  if (errors.length > 0) {
    console.log(`\nErrors (${String(errors.length)}):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
  }
}

/**
 * Prints detailed extraction info.
 */
function printDetails(result: EntrypointExtractionResult): void {
  const manifest = result.manifest;
  if (manifest === undefined) return;

  console.log('\nCLI Commands:');
  for (const cmd of manifest.cli_commands) {
    const subsArr = cmd.subcommands;
    const subs = subsArr !== undefined ? ` [${subsArr.join(', ')}]` : '';
    console.log(`  - ${cmd.name}${subs}: ${cmd.description.slice(0, 60)}...`);
  }

  console.log('\nMCP Tools:');
  for (const tool of manifest.mcp_tools) {
    const params = tool.parameters.map((p: ParameterSpec) => p.name).join(', ');
    console.log(`  - ${tool.name}(${params})`);
  }

  console.log('\nREST Endpoints:');
  for (const endpoint of manifest.rest_endpoints) {
    console.log(`  - ${endpoint.method} ${endpoint.path}`);
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates the manifest against the schema.
 */
function validateManifest(manifest: EntrypointManifest): boolean {
  const result = EntrypointManifestSchema.safeParse(manifest);
  if (!result.success) {
    console.error('\nValidation failed:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    return false;
  }
  console.log('\nValidation passed.');
  return true;
}

// ============================================================================
// Main
// ============================================================================

/**
 * Main entry point.
 */
function main(): void {
  const options = parseCliArgs();

  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  console.log('Extracting entrypoints from source code...');
  log(`Output format: ${options.format}`, options.verbose);
  log(`Output path: ${options.output}`, options.verbose);

  // Run extraction
  log('Starting AST extraction...', options.verbose);
  const result = extractEntrypoints({
    packageRoot: 'packages/nexus-agents',
  });

  if (!result.success || !result.manifest) {
    console.error('\nExtraction failed!');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  // Validate if requested
  if (options.validate) {
    const valid = validateManifest(result.manifest);
    if (!valid) {
      process.exit(1);
    }
  }

  // Write output
  log(`Writing manifest to ${options.output}...`, options.verbose);
  writeManifest(result.manifest, options.output, options.format);

  // Print summary
  printSummary(result);

  if (options.verbose) {
    printDetails(result);
  }

  console.log(`\nManifest written to: ${options.output}`);
}

// Run if executed directly
main();
