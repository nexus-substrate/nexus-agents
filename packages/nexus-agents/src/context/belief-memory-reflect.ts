/**
 * nexus-agents/context - Belief Memory Reflect Operations
 *
 * Extracted reflect operations for HindsightBeliefMemory to comply with 400-line limit.
 *
 * @module context/belief-memory-reflect
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/logger.js';
import { MemoryError } from './memory-backend-types.js';
import type { Belief, BeliefUpdate, HindsightRecord } from './belief-types.js';
import {
  BeliefSourceType as BeliefSourceTypeEnum,
  BeliefUpdateType as BeliefUpdateTypeEnum,
} from './belief-types.js';
import { strengthenConfidence, weakenConfidence } from './belief-memory-helpers.js';

/**
 * Options for revising a belief.
 */
export interface ReviseOptions {
  readonly beliefId: string;
  readonly updates: Partial<Pick<Belief, 'object' | 'confidence' | 'metadata'>>;
  readonly reason: string;
}

/**
 * Options for superseding a belief.
 */
export interface SupersedeOptions {
  readonly beliefId: string;
  readonly newBelief: Omit<
    Belief,
    'beliefId' | 'version' | 'createdAt' | 'updatedAt' | 'superseded'
  >;
  readonly reason: string;
}

/**
 * Internal stores used by reflect operations.
 */
export interface ReflectDataStores {
  readonly beliefs: Map<string, Belief>;
  readonly updates: Map<string, BeliefUpdate[]>;
  readonly hindsightRecords: Map<string, HindsightRecord[]>;
  readonly logger: ILogger;
  readonly recordUpdate: (opts: RecordUpdateOptions) => void;
}

/**
 * Options for recording an update.
 */
export interface RecordUpdateOptions {
  readonly beliefId: string;
  readonly updateType: BeliefUpdate['updateType'];
  readonly previousState: Record<string, unknown>;
  readonly newState: Record<string, unknown>;
  readonly reason: string;
  readonly evidence?: string;
}

/**
 * Revise an existing belief with updates.
 */
export function reviseBeliefInternal(
  stores: ReflectDataStores,
  opts: ReviseOptions
): Promise<Result<Belief, MemoryError>> {
  const { beliefId, updates, reason } = opts;
  try {
    const existing = stores.beliefs.get(beliefId);
    if (existing === undefined) {
      return Promise.resolve(err(new MemoryError('Belief not found', { context: { beliefId } })));
    }
    if (existing.superseded) {
      return Promise.resolve(
        err(new MemoryError('Cannot revise superseded belief', { context: { beliefId } }))
      );
    }
    const now = new Date(getTimeProvider().now());
    const revised: Belief = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: now,
    };
    stores.beliefs.set(beliefId, revised);
    stores.recordUpdate({
      beliefId,
      updateType: BeliefUpdateTypeEnum.REVISE,
      previousState: { object: existing.object, confidence: existing.confidence },
      newState: updates as Record<string, unknown>,
      reason,
    });
    stores.logger.debug('Belief revised', { beliefId, reason });
    return Promise.resolve(ok(revised));
  } catch (error) {
    return Promise.resolve(
      err(
        new MemoryError('Failed to revise belief', {
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      )
    );
  }
}

/**
 * Apply hindsight correction to beliefs.
 */
export function applyHindsightInternal(
  stores: ReflectDataStores,
  record: HindsightRecord
): Promise<Result<readonly Belief[], MemoryError>> {
  try {
    const correctedBeliefs: Belief[] = [];
    const now = new Date(getTimeProvider().now());

    // Store the hindsight record
    const taskRecords = stores.hindsightRecords.get(record.taskId) ?? [];
    taskRecords.push(record);
    stores.hindsightRecords.set(record.taskId, taskRecords);

    // Apply corrections to all affected beliefs
    for (const beliefId of record.correctedBeliefs) {
      const belief = stores.beliefs.get(beliefId);
      if (belief === undefined || belief.superseded) continue;

      const corrected: Belief = {
        ...belief,
        confidence: weakenConfidence(belief.confidence),
        sourceType: BeliefSourceTypeEnum.HINDSIGHT,
        version: belief.version + 1,
        updatedAt: now,
      };
      stores.beliefs.set(beliefId, corrected);
      correctedBeliefs.push(corrected);

      stores.recordUpdate({
        beliefId,
        updateType: BeliefUpdateTypeEnum.CORRECT,
        previousState: { confidence: belief.confidence },
        newState: { confidence: corrected.confidence },
        reason: `Hindsight correction: expected "${record.expectedOutcome}", got "${record.actualOutcome}"`,
        evidence: record.hindsightId,
      });
    }

    stores.logger.info('Hindsight applied', {
      hindsightId: record.hindsightId,
      correctedCount: correctedBeliefs.length,
    });
    return Promise.resolve(ok(correctedBeliefs));
  } catch (error) {
    return Promise.resolve(
      err(
        new MemoryError('Failed to apply hindsight', {
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      )
    );
  }
}

/**
 * Adjust confidence of a belief (reinforce or weaken).
 */
export function adjustConfidenceInternal(
  stores: ReflectDataStores,
  beliefId: string,
  evidence: string,
  direction: 'reinforce' | 'weaken'
): Promise<Result<Belief, MemoryError>> {
  try {
    const existing = stores.beliefs.get(beliefId);
    if (existing === undefined) {
      return Promise.resolve(err(new MemoryError('Belief not found', { context: { beliefId } })));
    }
    if (existing.superseded) {
      return Promise.resolve(
        err(new MemoryError(`Cannot ${direction} superseded belief`, { context: { beliefId } }))
      );
    }

    const now = new Date(getTimeProvider().now());
    const newConfidence =
      direction === 'reinforce'
        ? strengthenConfidence(existing.confidence)
        : weakenConfidence(existing.confidence);

    const updated: Belief = {
      ...existing,
      confidence: newConfidence,
      version: existing.version + 1,
      updatedAt: now,
    };
    stores.beliefs.set(beliefId, updated);

    const updateType =
      direction === 'reinforce' ? BeliefUpdateTypeEnum.REINFORCE : BeliefUpdateTypeEnum.WEAKEN;
    stores.recordUpdate({
      beliefId,
      updateType,
      previousState: { confidence: existing.confidence },
      newState: { confidence: newConfidence },
      reason: direction === 'reinforce' ? 'Corroborating evidence' : 'Contradicting evidence',
      evidence,
    });

    stores.logger.debug(`Belief ${direction}d`, { beliefId, newConfidence });
    return Promise.resolve(ok(updated));
  } catch (error) {
    return Promise.resolve(
      err(
        new MemoryError(`Failed to ${direction} belief`, {
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      )
    );
  }
}

/**
 * Prune superseded beliefs older than the given date.
 */
export function pruneSupersededInternal(
  stores: ReflectDataStores & {
    readonly subjectIndex: Map<string, Set<string>>;
    readonly predicateIndex: Map<string, Set<string>>;
    readonly domainIndex: Map<string, Set<string>>;
  },
  olderThan: Date
): Promise<Result<number, MemoryError>> {
  try {
    let pruned = 0;
    const cutoff = olderThan.getTime();

    for (const [id, belief] of stores.beliefs.entries()) {
      if (belief.superseded && belief.updatedAt.getTime() < cutoff) {
        stores.beliefs.delete(id);
        // Remove from indices
        stores.subjectIndex.get(belief.subject)?.delete(belief.beliefId);
        stores.predicateIndex.get(belief.predicate)?.delete(belief.beliefId);
        if (belief.domain !== undefined) {
          stores.domainIndex.get(belief.domain)?.delete(belief.beliefId);
        }
        stores.updates.delete(id);
        pruned++;
      }
    }

    stores.logger.info('Pruned superseded beliefs', { pruned, olderThan: olderThan.toISOString() });
    return Promise.resolve(ok(pruned));
  } catch (error) {
    return Promise.resolve(
      err(
        new MemoryError('Failed to prune superseded beliefs', {
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      )
    );
  }
}
