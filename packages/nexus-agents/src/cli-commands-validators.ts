/**
 * nexus-agents CLI Commands - Validators
 *
 * Type validation functions for CLI command arguments.
 *
 * @module cli-commands-validators
 * (Source: Extracted from cli-commands.ts for #272)
 */

import type { ExpertListFormat, IndexSubcommand } from './cli/index.js';

/**
 * Validates and coerces format to ExpertListFormat.
 */
export function isValidExpertListFormat(value: string): value is ExpertListFormat {
  return ['table', 'json', 'yaml'].includes(value);
}

/**
 * Validates model option for orchestrate command.
 */
export function isValidOrchestrateModel(value: string): value is 'claude' | 'gemini' | 'codex' {
  return ['claude', 'gemini', 'codex'].includes(value);
}

/**
 * Validates threshold option for vote command.
 */
export function isValidThreshold(
  value: string
): value is 'majority' | 'supermajority' | 'unanimous' {
  return ['majority', 'supermajority', 'unanimous'].includes(value);
}

/**
 * Validates index subcommand.
 */
export function isValidIndexSubcommand(value: string | undefined): value is IndexSubcommand {
  const validSubcommands = [
    'generate',
    'check',
    'diagram',
    'validate',
    'entrypoints',
    'freshness',
    'links',
  ];
  return value !== undefined && validSubcommands.includes(value);
}

/**
 * Validates output format for index command.
 */
export function isValidIndexFormat(value: string): value is 'yaml' | 'json' {
  return value === 'yaml' || value === 'json';
}

/**
 * Validates output format for research command.
 */
export function isValidResearchFormat(value: string): value is 'table' | 'json' {
  return value === 'table' || value === 'json';
}

/**
 * Re-export isValidResearchSubcommand from research-command.
 */
export { isValidResearchSubcommand } from './cli/index.js';
