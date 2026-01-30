/**
 * nexus-agents/consensus - Helper Functions
 *
 * Utility functions for the consensus engine.
 */

import type { ProposalId } from './types.js';
import { getTimeProvider, getRandomProvider } from '../core/index.js';

/**
 * Generate a unique proposal ID.
 */
export function generateProposalId(): ProposalId {
  const timestamp = getTimeProvider().now().toString(36);
  const random = getRandomProvider().random().toString(36).substring(2, 8);
  return `prop_${timestamp}_${random}`;
}
