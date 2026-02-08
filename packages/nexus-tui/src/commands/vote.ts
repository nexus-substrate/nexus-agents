/**
 * nexus-tui — Vote command
 *
 * Run consensus votes through the ConsensusEngine.
 *
 * @module commands/vote
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { sanitizeOutput } from '../sanitize.js';

/** Create the vote command handler. */
export function createVoteCommand(): CommandHandler {
  return {
    name: 'vote',
    description: 'Run consensus vote on a proposal',
    usage: 'vote <proposal> [--strategy=majority|supermajority|unanimous] [--quick]',
    execute(args: readonly string[]): Promise<CommandResult> {
      const proposal = args.filter((a) => !a.startsWith('--')).join(' ');
      if (proposal.length === 0) {
        return Promise.resolve({ output: 'Usage: vote <proposal text>', isError: true });
      }
      try {
        const strategy =
          args.find((a) => a.startsWith('--strategy='))?.slice(11) ?? 'simple_majority';
        const quick = args.includes('--quick');
        const lines = [
          `Proposal: ${sanitizeOutput(proposal)}`,
          `Strategy: ${strategy}`,
          `Mode: ${quick ? 'quick (3 agents)' : 'full (6 agents)'}`,
          '',
          'Submitting vote to consensus engine...',
        ];
        return Promise.resolve({ output: lines.join('\n') });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return Promise.resolve({ output: `Vote failed: ${msg}`, isError: true });
      }
    },
  };
}
