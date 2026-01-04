/**
 * @nexus-agents/agents - Protocol Helpers
 *
 * Helper functions for collaboration protocol operations.
 * Extracted to keep the main protocol classes under 400 lines.
 */

import type { Task } from '../../core/index.js';

/**
 * Extracts approval status from review output.
 */
export function extractApproval(output: unknown): boolean {
  if (typeof output === 'object' && output !== null && 'approved' in output) {
    return Boolean((output as Record<string, unknown>).approved);
  }
  if (typeof output === 'string') {
    const lowerOutput = output.toLowerCase();
    return lowerOutput.includes('approved') || lowerOutput.includes('lgtm');
  }
  return true;
}

/**
 * Extracts feedback from review output.
 */
export function extractFeedback(output: unknown): string {
  if (typeof output === 'object' && output !== null && 'feedback' in output) {
    return String((output as Record<string, unknown>).feedback);
  }
  if (typeof output === 'string') {
    return output;
  }
  return JSON.stringify(output);
}

/**
 * Vote decision type.
 */
export interface ParsedVote {
  decision: 'approve' | 'reject' | 'abstain';
  reasoning: string;
}

type VoteDecision = 'approve' | 'reject' | 'abstain';

/**
 * Checks if a string is a valid vote decision.
 */
function isValidVoteDecision(value: string): value is VoteDecision {
  return value === 'approve' || value === 'reject' || value === 'abstain';
}

/**
 * Attempts to parse vote from an object with decision/reasoning fields.
 */
function parseVoteFromDecisionField(obj: Record<string, unknown>): ParsedVote | null {
  if (!('decision' in obj && 'reasoning' in obj)) return null;
  const decision = String(obj.decision).toLowerCase();
  if (!isValidVoteDecision(decision)) return null;
  return { decision, reasoning: String(obj.reasoning) };
}

/**
 * Attempts to parse vote from an object with vote field.
 */
function parseVoteFromVoteField(obj: Record<string, unknown>): ParsedVote | null {
  if (!('vote' in obj)) return null;
  const vote = String(obj.vote).toLowerCase();
  if (!isValidVoteDecision(vote)) return null;
  const reasoning = 'reasoning' in obj ? String(obj.reasoning) : 'No reasoning provided';
  return { decision: vote, reasoning };
}

/**
 * Determines vote decision from string content.
 */
function determineVoteFromString(text: string): VoteDecision {
  const lower = text.toLowerCase();
  if (lower.includes('approve') || lower.includes('yes')) return 'approve';
  if (lower.includes('reject') || lower.includes('no')) return 'reject';
  return 'abstain';
}

/**
 * Extracts vote from output.
 */
export function extractVote(output: unknown): ParsedVote {
  if (typeof output === 'object' && output !== null) {
    const obj = output as Record<string, unknown>;
    const fromDecision = parseVoteFromDecisionField(obj);
    if (fromDecision !== null) return fromDecision;
    const fromVote = parseVoteFromVoteField(obj);
    if (fromVote !== null) return fromVote;
  }

  if (typeof output === 'string') {
    return { decision: determineVoteFromString(output), reasoning: output };
  }

  return { decision: 'abstain', reasoning: 'Could not parse vote from output' };
}

/**
 * Creates a review task from production output.
 */
export function createReviewTask(
  originalTask: Task,
  productionOutput: unknown,
  producerId: string
): Task {
  return {
    id: `${originalTask.id}-review`,
    description: `Review the following work and provide feedback:\n\n${JSON.stringify(productionOutput, null, 2)}`,
    context: {
      ...originalTask.context,
      metadata: {
        ...originalTask.context.metadata,
        reviewContext: {
          originalTaskId: originalTask.id,
          producerId,
          productionOutput,
        },
      },
    },
  };
}

/**
 * Creates a voting task from original task.
 */
export function createVotingTask(originalTask: Task): Task {
  return {
    ...originalTask,
    description: `${originalTask.description}\n\nPlease analyze this task and provide your vote (approve/reject/abstain) with reasoning.`,
  };
}

/**
 * Sleep utility for delays.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
