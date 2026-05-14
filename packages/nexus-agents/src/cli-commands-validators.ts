/**
 * nexus-agents CLI Commands - Validators
 *
 * Type validation functions for CLI command arguments.
 *
 * @module cli-commands-validators
 * (Source: Extracted from cli-commands.ts for #272)
 */

import type { ExpertListFormat, IndexSubcommand } from './cli/index.js';
import type { CliNameLiteral } from './config/model-capabilities-types.js';
import { CLI_NAMES } from './config/model-capabilities-types.js';
import {
  VoteThresholdSchema,
  ErrorPolicySchema,
  type VoteThreshold,
  type ErrorPolicy,
} from './mcp/tools/consensus-vote-types.js';

/**
 * Validates and coerces format to ExpertListFormat.
 */
export function isValidExpertListFormat(value: string): value is ExpertListFormat {
  return ['table', 'json', 'yaml'].includes(value);
}

/**
 * Validates model option for orchestrate command.
 */
export function isValidOrchestrateModel(value: string): value is CliNameLiteral {
  return (CLI_NAMES as readonly string[]).includes(value);
}

/**
 * Validates threshold option for vote command. Uses `VoteThresholdSchema`
 * as the single source of truth (#2638).
 */
export function isValidThreshold(value: string): value is VoteThreshold {
  return VoteThresholdSchema.safeParse(value).success;
}

/**
 * Validates errorPolicy option for vote command (#2630). Uses
 * `ErrorPolicySchema` as the single source of truth (#2638).
 */
export function isValidErrorPolicy(value: string): value is ErrorPolicy {
  return ErrorPolicySchema.safeParse(value).success;
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

/**
 * Re-export validation dashboard validators.
 * (Source: Issue #273)
 */
export { isValidPeriod, isValidDashboardFormat } from './cli/index.js';

/**
 * Parses a positive-integer CLI argument, falling back to `defaultVal` on
 * missing, non-numeric, zero, or negative input.
 *
 * Consolidates the `parseInt(arg, 10) + Number.isNaN(...) || x <= 0` pattern
 * that was duplicated 3× in `cli-commands-handlers.ts` (e2e-eval, routing-ab,
 * memory-eval) before #2161.
 *
 * Intentionally narrow — rejects zero and negatives since every caller uses
 * this for a "count" or "size" argument where 0 would be a no-op and
 * negatives are nonsensical. A caller that legitimately wants non-positive
 * input should parse inline instead.
 *
 * @param arg - The CLI argument value (typically `args.positionals[N]`)
 * @param defaultVal - Default when `arg` is undefined, non-numeric, or ≤ 0
 * @returns The parsed positive integer, or `defaultVal`
 */
export function parsePositiveInt(arg: string | undefined, defaultVal: number): number {
  if (arg === undefined) return defaultVal;
  const parsed = parseInt(arg, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? defaultVal : parsed;
}
