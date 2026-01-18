/**
 * nexus-agents custom expert loader
 *
 * Loads and validates custom expert definitions from nexus-agents.yaml config.
 *
 * (Source: Issue #300)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import * as yaml from 'yaml';
import type { ZodError } from 'zod';
import type { Result } from '../core/index.js';
import { ok, err, SecurityError } from '../core/index.js';
import {
  CustomExpertDefinitionSchema,
  VALID_EXPERT_TIERS,
  VALID_EXPERT_DOMAINS,
  MAX_SYSTEM_PROMPT_LENGTH,
  type CustomExpertDefinition,
} from '../config/index.js';
import type { ExpertDefinition } from '../agents/experts/expert-selector-types.js';

/**
 * Default config file name.
 */
const DEFAULT_CONFIG_FILE = 'nexus-agents.yaml';

/**
 * Validates that a file path is within the allowed root directory.
 * Prevents path traversal attacks (e.g., ../../../etc/passwd).
 * @param userPath - The user-provided file path
 * @param allowedRoot - The root directory that paths must be within
 * @returns Result with validated absolute path or SecurityError
 */
function validateConfigPath(userPath: string, allowedRoot: string): Result<string, SecurityError> {
  const resolvedRoot = resolve(allowedRoot);
  const resolved = resolve(allowedRoot, userPath);

  if (!resolved.startsWith(resolvedRoot + sep) && resolved !== resolvedRoot) {
    return err(
      new SecurityError('Path traversal detected: config path escapes allowed root directory', {
        context: { userPath, allowedRoot: resolvedRoot },
      })
    );
  }
  return ok(resolved);
}

/**
 * Error details for custom expert validation failures.
 */
export interface CustomExpertError {
  /** Expert ID that failed validation */
  expertId: string;
  /** Field that caused the error */
  field: string;
  /** Error message */
  message: string;
  /** Suggestion for fixing the error */
  suggestion?: string;
}

/**
 * Result of loading custom experts.
 */
export interface CustomExpertLoadResult {
  /** Successfully loaded experts */
  experts: ExpertDefinition[];
  /** Validation errors encountered */
  errors: CustomExpertError[];
  /** Path to config file (if loaded) */
  configPath?: string;
}

/**
 * Gets an actionable suggestion for a validation error field.
 */
function getSuggestion(field: string, issueMessage: string, issueCode: string): string | undefined {
  if (field === 'tier' || issueMessage.includes('tier')) {
    return `Valid options: ${VALID_EXPERT_TIERS.join(', ')}`;
  }
  if (field === 'domain' || issueMessage.includes('domain')) {
    return `Valid options: ${VALID_EXPERT_DOMAINS.join(', ')}`;
  }
  if (field === 'systemPrompt' && issueCode === 'too_big') {
    return `Maximum length is ${String(MAX_SYSTEM_PROMPT_LENGTH)} characters`;
  }
  if (field === 'capabilities') {
    return 'Provide at least one capability (e.g., task_execution, code_generation)';
  }
  if (field === 'temperature') {
    return 'Value must be between 0 and 1';
  }
  if (field === 'weight') {
    return 'Value must be between 0 and 1';
  }
  return undefined;
}

/**
 * Formats a Zod validation error into a user-friendly message.
 */
function formatZodError(expertId: string, zodError: ZodError): CustomExpertError[] {
  return zodError.issues.map((issue) => {
    const field = issue.path.join('.') || 'unknown';
    const suggestion = getSuggestion(field, issue.message, issue.code);

    const error: CustomExpertError = {
      expertId,
      field,
      message: issue.message,
    };

    if (suggestion !== undefined) {
      error.suggestion = suggestion;
    }

    return error;
  });
}

/**
 * Converts a custom expert definition to an ExpertDefinition.
 */
function toExpertDefinition(id: string, custom: CustomExpertDefinition): ExpertDefinition {
  return {
    id: `custom-${id}`,
    role: 'custom',
    name: formatExpertName(id),
    description: custom.description ?? `Custom expert: ${id}`,
    capabilities: custom.capabilities,
    primaryDomain: custom.domain,
    secondaryDomains: custom.secondaryDomains ?? [],
    weight: custom.weight,
    available: custom.available,
  };
}

/**
 * Formats an expert ID into a human-readable name.
 */
function formatExpertName(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Result of finding config path - includes potential security errors.
 */
interface FindConfigResult {
  path?: string;
  securityError?: SecurityError;
}

/**
 * Finds the config file path with path traversal validation.
 *
 * The NEXUS_CONFIG_PATH environment variable is validated to ensure it
 * stays within the current working directory to prevent path traversal attacks.
 *
 * @returns Object containing the validated path or a security error
 */
function findConfigPath(): FindConfigResult {
  const cwd = process.cwd();

  // Check environment variable first
  const envPath = process.env['NEXUS_CONFIG_PATH'];
  if (envPath !== undefined && envPath !== '') {
    // Validate that the environment variable path stays within cwd
    const validation = validateConfigPath(envPath, cwd);
    if (!validation.ok) {
      return { securityError: validation.error };
    }

    if (existsSync(validation.value)) {
      return { path: validation.value };
    }
    // Path is valid but file doesn't exist - fall through to cwd check
  }

  // Check current directory
  const cwdPath = resolve(cwd, DEFAULT_CONFIG_FILE);
  if (existsSync(cwdPath)) {
    return { path: cwdPath };
  }

  return {};
}

/**
 * Parses YAML content safely.
 */
function parseYaml(content: string): Result<unknown, Error> {
  try {
    const parsed: unknown = yaml.parse(content);
    return ok(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown YAML parse error';
    return err(new Error(`YAML parse error: ${message}`));
  }
}

/**
 * Extracts raw expert config from parsed YAML without full validation.
 * Returns the custom experts map for individual validation.
 */
function extractRawExpertConfig(
  parsed: unknown
): Result<Record<string, unknown> | undefined, CustomExpertError[]> {
  if (parsed === null || typeof parsed !== 'object') {
    return ok(undefined);
  }

  const config = parsed as Record<string, unknown>;
  if (config['experts'] === undefined) {
    return ok(undefined);
  }

  const expertConfig = config['experts'];
  if (expertConfig === null || typeof expertConfig !== 'object') {
    return ok(undefined);
  }

  const experts = expertConfig as Record<string, unknown>;
  if (experts['custom'] === undefined) {
    return ok(undefined);
  }

  const customExperts = experts['custom'];
  if (customExperts === null || typeof customExperts !== 'object') {
    return err([
      {
        expertId: 'config',
        field: 'custom',
        message: 'Custom experts must be an object',
      },
    ]);
  }

  return ok(customExperts as Record<string, unknown>);
}

/**
 * Validates and converts custom experts.
 */
function processCustomExperts(customExperts: Record<string, unknown>): {
  experts: ExpertDefinition[];
  errors: CustomExpertError[];
} {
  const experts: ExpertDefinition[] = [];
  const errors: CustomExpertError[] = [];

  for (const [id, definition] of Object.entries(customExperts)) {
    // Validate expert ID format
    if (!/^[a-z][a-z0-9_]*$/.test(id)) {
      errors.push({
        expertId: id,
        field: 'id',
        message: `Invalid expert ID '${id}'`,
        suggestion:
          'ID must start with a letter and contain only lowercase letters, numbers, and underscores',
      });
      continue;
    }

    // Validate the definition
    const validation = CustomExpertDefinitionSchema.safeParse(definition);
    if (!validation.success) {
      errors.push(...formatZodError(id, validation.error));
      continue;
    }

    // Convert to ExpertDefinition
    experts.push(toExpertDefinition(id, validation.data));
  }

  return { experts, errors };
}

/**
 * Resolves the config path, either from explicit argument or auto-detection.
 * Returns a security error if path traversal is detected.
 */
function resolveConfigPath(configPath: string | undefined): {
  path?: string;
  error?: CustomExpertError;
} {
  if (configPath !== undefined) {
    return { path: configPath };
  }

  const findResult = findConfigPath();
  if (findResult.securityError !== undefined) {
    return {
      error: {
        expertId: 'config',
        field: 'path',
        message: findResult.securityError.message,
        suggestion: 'NEXUS_CONFIG_PATH must be within the current working directory',
      },
    };
  }

  if (findResult.path !== undefined) {
    return { path: findResult.path };
  }
  return {};
}

/**
 * Reads and parses the config file content.
 */
function readConfigContent(configPath: string): { content?: string; error?: CustomExpertError } {
  try {
    return { content: readFileSync(configPath, 'utf-8') };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      error: {
        expertId: 'config',
        field: 'file',
        message: `Failed to read config file: ${message}`,
      },
    };
  }
}

/**
 * Loads custom experts from the nexus-agents.yaml config file.
 *
 * @param configPath - Optional path to config file (auto-detected if not provided)
 * @returns Result containing loaded experts and any validation errors
 */
export function loadCustomExperts(configPath?: string): CustomExpertLoadResult {
  const result: CustomExpertLoadResult = { experts: [], errors: [] };

  // Resolve config path with security validation
  const pathResult = resolveConfigPath(configPath);
  if (pathResult.error !== undefined) {
    result.errors.push(pathResult.error);
    return result;
  }
  if (pathResult.path === undefined) {
    return result; // No config file found - not an error
  }
  result.configPath = pathResult.path;

  // Read config file
  const contentResult = readConfigContent(pathResult.path);
  if (contentResult.error !== undefined || contentResult.content === undefined) {
    if (contentResult.error !== undefined) {
      result.errors.push(contentResult.error);
    }
    return result;
  }

  // Parse YAML
  const parseResult = parseYaml(contentResult.content);
  if (!parseResult.ok) {
    result.errors.push({ expertId: 'config', field: 'yaml', message: parseResult.error.message });
    return result;
  }

  // Extract and process custom experts
  const configResult = extractRawExpertConfig(parseResult.value);
  if (!configResult.ok) {
    result.errors.push(...configResult.error);
    return result;
  }
  if (configResult.value === undefined) {
    return result;
  }

  const processed = processCustomExperts(configResult.value);
  result.experts = processed.experts;
  result.errors = processed.errors;
  return result;
}

/**
 * Formats validation errors for CLI output.
 */
export function formatValidationErrors(errors: readonly CustomExpertError[]): string {
  if (errors.length === 0) {
    return '';
  }

  const lines: string[] = ['Custom expert validation errors:'];

  for (const error of errors) {
    lines.push(`  Error: ${error.message}`);
    if (error.expertId !== 'config') {
      lines.push(`    Expert: ${error.expertId}`);
    }
    if (error.field !== 'unknown' && error.field !== 'file' && error.field !== 'yaml') {
      lines.push(`    Field: ${error.field}`);
    }
    if (error.suggestion !== undefined) {
      lines.push(`    Suggestion: ${error.suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
