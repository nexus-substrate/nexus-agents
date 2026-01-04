/**
 * nexus-agents/agents - Aggregator Helpers
 *
 * Helper functions for result aggregation operations.
 * Extracted to keep the main aggregator class under 400 lines.
 */

import type {
  CollaborationPattern,
  VoteMessage,
  ReviewResponseMessage,
  ResultConflict,
} from './collaboration-types.js';
import type { AggregationStrategy, ExpertResult, ConflictResolver } from './result-aggregator.js';

/**
 * Default conflict resolver - prefers higher confidence.
 */
export const defaultConflictResolver: ConflictResolver = (_conflict, result1, result2) => {
  const confidence1 = result1.confidence ?? 0.5;
  const confidence2 = result2.confidence ?? 0.5;
  return confidence1 >= confidence2 ? 'expert1' : 'expert2';
};

/**
 * Default quality scorer - based on result completeness.
 */
export function defaultQualityScorer(results: ExpertResult[], aggregatedOutput: unknown): number {
  if (results.length === 0) {
    return 0;
  }

  const avgConfidence = results.reduce((sum, r) => sum + (r.confidence ?? 0.5), 0) / results.length;
  const hasOutput = aggregatedOutput !== null && aggregatedOutput !== undefined;
  const outputScore = hasOutput ? 1 : 0;

  return (avgConfidence + outputScore) / 2;
}

/**
 * Determines aggregation strategy from pattern.
 */
export function determineStrategy(pattern: CollaborationPattern): AggregationStrategy {
  switch (pattern) {
    case 'sequential':
      return 'sequential_chain';
    case 'parallel':
      return 'merge';
    case 'review':
      return 'select_best';
    case 'consensus':
      return 'consensus';
    default:
      return 'merge';
  }
}

/**
 * Type guard for string arrays.
 */
export function areAllStrings(outputs: unknown[]): outputs is string[] {
  return outputs.every((o) => typeof o === 'string');
}

/**
 * Type guard for object arrays.
 */
export function areAllObjects(outputs: unknown[]): outputs is Record<string, unknown>[] {
  return outputs.every((o) => typeof o === 'object' && o !== null && !Array.isArray(o));
}

/**
 * Type guard for array arrays.
 */
export function areAllArrays(outputs: unknown[]): outputs is unknown[][] {
  return outputs.every((o) => Array.isArray(o));
}

/**
 * Merges string outputs.
 */
export function mergeStrings(outputs: string[]): string {
  const uniqueLines = new Set<string>();

  for (const output of outputs) {
    const lines = output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of lines) {
      uniqueLines.add(line);
    }
  }

  return Array.from(uniqueLines).join('\n');
}

/**
 * Merges array outputs.
 */
export function mergeArrays(outputs: unknown[][]): unknown[] {
  const seen = new Set<string>();
  const merged: unknown[] = [];

  for (const output of outputs) {
    for (const item of output) {
      const key = JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  }

  return merged;
}

/**
 * Deep equality check.
 */
export function deepEquals(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (typeof a !== 'object' || a === null || b === null) {
    return false;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => deepEquals(aObj[key], bObj[key]));
}

interface ConflictContext {
  existing: { expertId: string; value: unknown };
  newResult: ExpertResult;
  key: string;
  value: unknown;
  results: ExpertResult[];
  conflictResolver: ConflictResolver;
}

/**
 * Handles a single field conflict.
 */
function handleFieldConflict(ctx: ConflictContext): ResultConflict {
  const conflict: ResultConflict = {
    expert1Id: ctx.existing.expertId,
    expert2Id: ctx.newResult.expertId,
    field: ctx.key,
    description: `Conflicting values for field '${ctx.key}'`,
    resolution: 'unresolved',
  };

  const result1 = ctx.results.find((r) => r.expertId === ctx.existing.expertId);
  if (result1 !== undefined) {
    const resolution = ctx.conflictResolver(conflict, result1, ctx.newResult);
    conflict.resolution = resolution;
    const resolutionDesc = resolution === 'merged' ? 'merge' : `${resolution} value`;
    conflict.resolutionReason = `Resolved using ${resolutionDesc}`;
  }

  return conflict;
}

/**
 * Merges object outputs with conflict detection.
 */
export function mergeObjects(
  results: ExpertResult[],
  outputs: Record<string, unknown>[],
  conflictResolver: ConflictResolver
): { output: unknown; conflicts: ResultConflict[] } {
  const merged: Record<string, unknown> = {};
  const conflicts: ResultConflict[] = [];
  const keyOwners = new Map<string, { expertId: string; value: unknown }>();

  for (let i = 0; i < outputs.length; i++) {
    const output = outputs[i];
    const result = results[i];
    if (output === undefined || result === undefined) continue;

    for (const [key, value] of Object.entries(output)) {
      const existing = keyOwners.get(key);

      if (existing === undefined) {
        keyOwners.set(key, { expertId: result.expertId, value });
        merged[key] = value;
        continue;
      }

      if (deepEquals(existing.value, value)) continue;

      const conflict = handleFieldConflict({
        existing,
        newResult: result,
        key,
        value,
        results,
        conflictResolver,
      });

      if (conflict.resolution === 'expert2') {
        merged[key] = value;
        keyOwners.set(key, { expertId: result.expertId, value });
      }

      conflicts.push(conflict);
    }
  }

  return { output: merged, conflicts };
}

/**
 * Selects the best result based on reviews and confidence.
 */
export function selectBest(results: ExpertResult[], reviews?: ReviewResponseMessage[]): unknown {
  if (results.length === 1) {
    return results[0]?.result.output;
  }

  if (reviews !== undefined && reviews.length > 0) {
    const approvedReview = reviews.find((r) => r.approved);
    if (approvedReview !== undefined) {
      const approvedResult = results.find((r) => r.expertId === approvedReview.requesterId);
      if (approvedResult !== undefined) {
        return approvedResult.result.output;
      }
    }
  }

  const sortedByConfidence = [...results].sort(
    (a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5)
  );

  return sortedByConfidence[0]?.result.output;
}

/**
 * Builds consensus from votes and results.
 */
export function buildConsensus(results: ExpertResult[], votes?: VoteMessage[]): unknown {
  if (votes === undefined || votes.length === 0) {
    return selectBest(results);
  }

  const approveVotes = votes.filter((v) => v.decision === 'approve');
  const rejectVotes = votes.filter((v) => v.decision === 'reject');

  const consensusDecision = approveVotes.length > rejectVotes.length ? 'approved' : 'rejected';

  const reasonings = votes.map((v) => ({
    expertId: v.expertId,
    decision: v.decision,
    reasoning: v.reasoning,
  }));

  return {
    decision: consensusDecision,
    approveCount: approveVotes.length,
    rejectCount: rejectVotes.length,
    abstainCount: votes.length - approveVotes.length - rejectVotes.length,
    reasonings,
    outputs: results.map((r) => ({
      expertId: r.expertId,
      output: r.result.output,
    })),
  };
}

/**
 * Chains sequential results together.
 */
export function chainSequential(results: ExpertResult[]): unknown {
  const sortedResults = [...results].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (sortedResults.length === 1) {
    return sortedResults[0]?.result.output;
  }

  const lastResult = sortedResults[sortedResults.length - 1];

  return {
    finalOutput: lastResult?.result.output,
    chain: sortedResults.map((r, index) => ({
      step: index + 1,
      expertId: r.expertId,
      output: r.result.output,
    })),
  };
}
