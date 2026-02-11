/**
 * nexus-agents/indexer - Entrypoint Extractor
 *
 * Extracts CLI commands, MCP tools, and REST endpoints from source code
 * using TypeScript AST parsing via ts-morph.
 *
 * (Source: Epic #261 - Automated Documentation System)
 */

import { Project } from 'ts-morph';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { getErrorMessage, getTimeProvider } from '../core/index.js';
import type {
  EntrypointManifest,
  EntrypointExtractionResult,
  EntrypointExtractorOptions,
} from './entrypoint-types.js';
import {
  ENTRYPOINT_SCHEMA_VERSION,
  DEFAULT_ENTRYPOINT_EXTRACTOR_OPTIONS,
} from './entrypoint-types.js';

// Re-export from submodules
export { sanitizeValue } from './entrypoint-sanitizer.js';
export { extractCliCommands } from './entrypoint-cli-extractor.js';
export { extractMcpTools } from './entrypoint-mcp-extractor.js';
export { extractRestEndpoints } from './entrypoint-rest-extractor.js';

// Import from submodules
import { sanitizeCommand, sanitizeTool, sanitizeEndpoint } from './entrypoint-sanitizer.js';
import { extractCliCommands } from './entrypoint-cli-extractor.js';
import { extractMcpTools } from './entrypoint-mcp-extractor.js';
import { extractRestEndpoints } from './entrypoint-rest-extractor.js';

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Generates an ISO 8601 timestamp in America/New_York timezone.
 */
function generateTimestamp(): string {
  return new Date(getTimeProvider().now()).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Creates a ts-morph project and adds source files.
 */
function createProject(opts: EntrypointExtractorOptions): Project {
  const project = new Project({
    tsConfigFilePath: path.join(opts.packageRoot, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths([
    path.join(opts.packageRoot, opts.cliCommandsPath),
    path.join(opts.packageRoot, 'src/cli-types.ts'),
    path.join(opts.packageRoot, opts.mcpToolsPath, '*.ts'),
    path.join(opts.packageRoot, opts.restRoutesPath, '*.ts'),
  ]);
  return project;
}

/**
 * Extracts all entrypoints and generates the manifest.
 *
 * @param options - Extraction options
 * @returns Extraction result with manifest or errors
 */
export function extractEntrypoints(
  options: Partial<EntrypointExtractorOptions> = {}
): EntrypointExtractionResult {
  const opts = { ...DEFAULT_ENTRYPOINT_EXTRACTOR_OPTIONS, ...options };
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const project = createProject(opts);
    const cliCommands = extractCliCommands(
      project,
      opts.packageRoot,
      opts.cliCommandsPath,
      'src/cli-types.ts'
    );
    const mcpTools = extractMcpTools(project, opts.packageRoot, opts.mcpToolsPath);
    const restEndpoints = extractRestEndpoints(project, opts.packageRoot, opts.restRoutesPath);

    const finalCommands = opts.sanitize ? cliCommands.map(sanitizeCommand) : cliCommands;
    const finalTools = opts.sanitize ? mcpTools.map(sanitizeTool) : mcpTools;
    const finalEndpoints = opts.sanitize ? restEndpoints.map(sanitizeEndpoint) : restEndpoints;

    const manifest: EntrypointManifest = {
      schema_version: ENTRYPOINT_SCHEMA_VERSION,
      generated_at: generateTimestamp(),
      cli_commands: finalCommands,
      mcp_tools: finalTools,
      rest_endpoints: finalEndpoints,
    };
    return { success: true, manifest, errors, warnings };
  } catch (error) {
    const message = getErrorMessage(error);
    errors.push(`Extraction failed: ${message}`);
    return { success: false, errors, warnings };
  }
}

// ============================================================================
// Manifest Serialization
// ============================================================================

/**
 * Converts an entrypoint manifest to YAML format.
 */
export function manifestToYaml(manifest: EntrypointManifest): string {
  const doc = new yaml.Document(manifest);
  doc.commentBefore =
    ' Nexus-Agents Entrypoint Manifest\n Generated automatically - do not edit manually';

  return doc.toString({
    lineWidth: 120,
    minContentWidth: 20,
  });
}

/**
 * Converts an entrypoint manifest to JSON format.
 */
export function manifestToJson(manifest: EntrypointManifest): string {
  return JSON.stringify(manifest, null, 2);
}
