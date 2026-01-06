/**
 * nexus-agents/consensus - Helper Functions
 *
 * Utility functions for the consensus engine.
 */

import type { ProposalId } from './types.js';

/**
 * Generate a unique proposal ID.
 */
export function generateProposalId(): ProposalId {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `prop_${timestamp}_${random}`;
}
