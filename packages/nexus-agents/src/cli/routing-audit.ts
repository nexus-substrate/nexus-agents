/**
 * nexus-agents/cli - Routing Audit Command
 *
 * CLI command to audit and debug routing decisions without executing tasks.
 * Shows budget filtering, TOPSIS ranking, and LinUCB selection details.
 *
 * @module cli/routing-audit
 * (Source: Issue #170, Alignment Roadmap Phase 1)
 */

import { createLogger } from '../core/index.js';
import type { RoutingAuditOptions } from './routing-audit-types.js';
import { auditRouting } from './routing-audit-logic.js';
import { formatAsciiOutput, formatJsonOutput } from './routing-audit-format.js';

// Re-export types for backward API compatibility
export type {
  RoutingAuditOptions,
  RoutingAuditResult,
  BudgetFilterResult,
  LinUCBArmDetail,
  FeatureImportance,
  DetailedArmStats,
  ExplorationStats,
  BanditStats,
} from './routing-audit-types.js';

// Re-export logic functions
export { auditRouting } from './routing-audit-logic.js';

const logger = createLogger({ component: 'routing-audit' });

// =============================================================================
// Command Entry Point
// =============================================================================

/**
 * Runs the routing-audit command.
 *
 * @param options - Command options
 * @returns Exit code (0 for success)
 */
export function routingAuditCommand(options: RoutingAuditOptions): number {
  try {
    const result = auditRouting(options);

    const output =
      options.json === true ? formatJsonOutput(result) : formatAsciiOutput(result, options);

    process.stdout.write(output + '\n');

    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${msg}\n`);
    logger.error('Routing audit failed', error instanceof Error ? error : new Error(msg));
    return 1;
  }
}
