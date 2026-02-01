/**
 * nexus-agents custom expert parsing
 *
 * Config file parsing and expert conversion helpers.
 *
 * (Source: Issue #300)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'yaml';
import type { SecurityError } from '../core/index.js';
import type { Result } from '../core/index.js';
import { ok, err, getErrorMessage } from '../core/index.js';
import { CustomExpertDefinitionSchema, type CustomExpertDefinition } from '../config/index.js';
import type { ExpertDefinition } from '../agents/experts/expert-selector-types.js';
import {
  validateConfigPath,
  formatZodError,
  type CustomExpertError,
} from './custom-expert-validation.js';

/**
 * Default config file name.
 */
const DEFAULT_CONFIG_FILE = 'nexus-agents.yaml';

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
 * Result of finding config path - includes potential security errors.
 */
interface FindConfigResult {
  path?: string;
  securityError?: SecurityError;
}

/**
 * Finds the config file path with path traversal validation.
 */
export function findConfigPath(): FindConfigResult {
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
export function parseYaml(content: string): Result<unknown, Error> {
  try {
    const parsed: unknown = yaml.parse(content);
    return ok(parsed);
  } catch (error) {
    return err(
      new Error(`YAML parse error: ${getErrorMessage(error, 'Unknown YAML parse error')}`)
    );
  }
}

/**
 * Extracts raw expert config from parsed YAML without full validation.
 */
export function extractRawExpertConfig(
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
 * Formats an expert ID into a human-readable name.
 */
function formatExpertName(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
 * Validates and converts custom experts.
 */
export function processCustomExperts(customExperts: Record<string, unknown>): {
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
 */
export function resolveConfigPath(configPath: string | undefined): {
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
export function readConfigContent(configPath: string): {
  content?: string;
  error?: CustomExpertError;
} {
  try {
    return { content: readFileSync(configPath, 'utf-8') };
  } catch (error) {
    return {
      error: {
        expertId: 'config',
        field: 'file',
        message: `Failed to read config file: ${getErrorMessage(error)}`,
      },
    };
  }
}
