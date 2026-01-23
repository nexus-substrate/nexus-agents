/**
 * nexus-agents custom expert loader
 *
 * Loads and validates custom expert definitions from nexus-agents.yaml config.
 *
 * (Source: Issue #300)
 */

// Re-export validation types and functions
export {
  type CustomExpertError,
  validateConfigPath,
  getSuggestion,
  formatZodError,
  formatValidationErrors,
} from './custom-expert-validation.js';

// Re-export parsing helpers
export {
  type CustomExpertLoadResult,
  findConfigPath,
  parseYaml,
  extractRawExpertConfig,
  processCustomExperts,
  resolveConfigPath,
  readConfigContent,
} from './custom-expert-parsing.js';

// Import for main loader function
import type { CustomExpertLoadResult } from './custom-expert-parsing.js';
import {
  resolveConfigPath,
  readConfigContent,
  parseYaml,
  extractRawExpertConfig,
  processCustomExperts,
} from './custom-expert-parsing.js';

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
