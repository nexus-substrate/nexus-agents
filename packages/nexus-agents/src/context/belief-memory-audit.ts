/**
 * nexus-agents/context - Hindsight Belief Memory Audit
 *
 * Counterfactual reasoning, audit, and statistics methods.
 *
 * @module context/belief-memory-audit
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/logger.js';
import { MemoryError } from './memory-backend-types.js';
import type {
  Belief,
  BeliefMemoryStats,
  BeliefUpdate,
  Counterfactual,
  HindsightRecord,
} from './belief-types.js';
import { initializeStatsCounters, buildStatsResult } from './belief-memory-helpers.js';
// Shared utilities per ADR-0013
import { generateId } from '../utils/id-utils.js';

/** Data stores required for audit operations */
export interface AuditDataStores {
  readonly beliefs: Map<string, Belief>;
  readonly updates: Map<string, BeliefUpdate[]>;
  readonly counterfactuals: Map<string, Counterfactual>;
  readonly hindsightRecords: Map<string, HindsightRecord[]>;
  readonly logger: ILogger;
}

/** Create a counterfactual scenario */
export function createCounterfactualInternal(
  stores: AuditDataStores,
  hypothesis: string,
  taskContext?: string
): Promise<Result<Counterfactual, MemoryError>> {
  try {
    const affectedBeliefs = findAffectedBeliefs(stores.beliefs, hypothesis);
    const baseCounterfactual = {
      counterfactualId: generateId('cf'),
      hypothesis,
      affectedBeliefs: affectedBeliefs.map((b) => b.beliefId),
      predictedOutcomes: predictOutcomes(hypothesis, affectedBeliefs),
      validated: false as const,
      createdAt: new Date(getTimeProvider().now()),
    };
    const counterfactual: Counterfactual =
      taskContext !== undefined ? { ...baseCounterfactual, taskContext } : baseCounterfactual;
    stores.counterfactuals.set(counterfactual.counterfactualId, counterfactual);
    stores.logger.debug('Counterfactual created', {
      counterfactualId: counterfactual.counterfactualId,
    });
    return Promise.resolve(ok(counterfactual));
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return Promise.resolve(
      err(new MemoryError('Failed to create counterfactual', { cause: causeError }))
    );
  }
}

/** Validate a counterfactual with actual outcomes */
export function validateCounterfactualInternal(
  stores: AuditDataStores,
  counterfactualId: string,
  actualOutcomes: readonly string[]
): Promise<Result<Counterfactual, MemoryError>> {
  try {
    const existing = stores.counterfactuals.get(counterfactualId);
    if (existing === undefined) {
      return Promise.resolve(
        err(new MemoryError('Counterfactual not found', { context: { counterfactualId } }))
      );
    }
    const validated: Counterfactual = { ...existing, actualOutcomes, validated: true };
    stores.counterfactuals.set(counterfactualId, validated);
    stores.logger.debug('Counterfactual validated', { counterfactualId });
    return Promise.resolve(ok(validated));
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return Promise.resolve(
      err(new MemoryError('Failed to validate counterfactual', { cause: causeError }))
    );
  }
}

/** Get counterfactuals for a task context */
export function getCounterfactualsInternal(
  stores: AuditDataStores,
  taskContext: string
): Promise<Result<readonly Counterfactual[], MemoryError>> {
  try {
    const results: Counterfactual[] = [];
    for (const cf of stores.counterfactuals.values()) {
      if (cf.taskContext === taskContext) results.push(cf);
    }
    return Promise.resolve(ok(results));
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return Promise.resolve(
      err(new MemoryError('Failed to get counterfactuals', { cause: causeError }))
    );
  }
}

/** Get update history for a belief */
export function getUpdateHistoryInternal(
  stores: AuditDataStores,
  beliefId: string
): Promise<Result<readonly BeliefUpdate[], MemoryError>> {
  try {
    return Promise.resolve(ok(stores.updates.get(beliefId) ?? []));
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return Promise.resolve(
      err(new MemoryError('Failed to get update history', { cause: causeError }))
    );
  }
}

/** Get hindsight records for a task */
export function getHindsightRecordsInternal(
  stores: AuditDataStores,
  taskId: string
): Promise<Result<readonly HindsightRecord[], MemoryError>> {
  try {
    return Promise.resolve(ok(stores.hindsightRecords.get(taskId) ?? []));
  } catch (error) {
    const causeError = error instanceof Error ? error : new Error(String(error));
    return Promise.resolve(
      err(new MemoryError('Failed to get hindsight records', { cause: causeError }))
    );
  }
}

/** Compute belief memory statistics */
export function computeStatsInternal(stores: AuditDataStores): BeliefMemoryStats {
  const { beliefsByConfidence, beliefsBySource } = initializeStatsCounters();
  let activeBeliefs = 0,
    supersededBeliefs = 0;
  let oldestBelief: Date | undefined, newestBelief: Date | undefined;

  for (const belief of stores.beliefs.values()) {
    beliefsByConfidence[belief.confidence]++;
    beliefsBySource[belief.sourceType]++;
    if (belief.superseded) {
      supersededBeliefs++;
    } else {
      activeBeliefs++;
    }
    if (oldestBelief === undefined || belief.createdAt < oldestBelief)
      oldestBelief = belief.createdAt;
    if (newestBelief === undefined || belief.createdAt > newestBelief)
      newestBelief = belief.createdAt;
  }

  let totalUpdates = 0,
    totalHindsightRecords = 0;
  for (const history of stores.updates.values()) totalUpdates += history.length;
  for (const records of stores.hindsightRecords.values()) totalHindsightRecords += records.length;

  return buildStatsResult(
    {
      totalBeliefs: stores.beliefs.size,
      activeBeliefs,
      supersededBeliefs,
      beliefsByConfidence,
      beliefsBySource,
      totalUpdates,
      totalCounterfactuals: stores.counterfactuals.size,
      totalHindsightRecords,
    },
    oldestBelief,
    newestBelief
  );
}

/** Find beliefs affected by a hypothesis */
function findAffectedBeliefs(beliefs: Map<string, Belief>, hypothesis: string): Belief[] {
  const keywords = hypothesis.toLowerCase().split(/\s+/);
  const affected: Belief[] = [];
  for (const belief of beliefs.values()) {
    if (belief.superseded) continue;
    const beliefText = `${belief.subject} ${belief.predicate} ${belief.object}`.toLowerCase();
    if (keywords.some((k) => beliefText.includes(k))) affected.push(belief);
  }
  return affected;
}

/** Predict outcomes for a hypothesis */
function predictOutcomes(hypothesis: string, affectedBeliefs: Belief[]): string[] {
  return affectedBeliefs.map(
    (b) => `If "${hypothesis}", then ${b.subject} ${b.predicate} may change`
  );
}
