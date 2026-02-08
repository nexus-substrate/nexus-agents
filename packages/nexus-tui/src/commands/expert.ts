/**
 * nexus-tui — Expert command
 *
 * List available expert roles.
 *
 * @module commands/expert
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { formatTable } from '../formatter.js';

/** Create the expert command handler. */
export function createExpertCommand(): CommandHandler {
  return {
    name: 'expert',
    description: 'List available expert agent roles',
    usage: 'expert list',
    async execute(args: readonly string[]): Promise<CommandResult> {
      const sub = args[0]?.toLowerCase();
      if (sub === 'list' || sub === undefined) return listExperts();
      return { output: 'Usage: expert list', isError: true };
    },
  };
}

async function listExperts(): Promise<CommandResult> {
  try {
    const { getAvailableRoles, getCapabilitiesForRole } = await import('nexus-agents');
    const roles = getAvailableRoles();
    const rows: Array<readonly [string, string]> = roles.map((role) => {
      const caps = getCapabilitiesForRole(role);
      const desc = caps !== undefined ? caps.join(', ') : 'No capabilities';
      return [role, desc] as const;
    });
    return { output: formatTable(rows) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { output: `Failed to list experts: ${msg}`, isError: true };
  }
}
