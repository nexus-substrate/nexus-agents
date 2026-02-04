/**
 * nexus-agents/context - Hindsight Belief Memory
 *
 * Implements the Hindsight Belief Memory layer for reasoning agents.
 * Core operations: retain, recall, and reflect.
 *
 * @module context/belief-memory
 * (Source: Issue #336, arXiv:2512.12818 - Hindsight Belief Memory)
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { getTimeProvider, formatZodError } from '../core/index.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import { MemoryError } from './memory-backend-types.js';
import type {
  Belief,
  BeliefMemoryConfig,
  BeliefMemoryStats,
  BeliefQuery,
  BeliefUpdate,
  Counterfactual,
  HindsightRecord,
  IHindsightBeliefMemory,
} from './belief-types.js';
import {
  BeliefMemoryConfigSchema,
  BeliefSchema,
  BeliefUpdateType as BeliefUpdateTypeEnum,
  DEFAULT_BELIEF_CONFIG,
} from './belief-types.js';
import { createUpdateRecord } from './belief-memory-helpers.js';
// Shared utilities per ADR-0013
import { generateId } from '../utils/id-utils.js';
import {
  recallInternal,
  queryInternal,
  recallBySubjectInternal,
  recallCurrentInternal,
  recallHistoryInternal,
  type RecallDataStores,
} from './belief-memory-recall.js';
import {
  createCounterfactualInternal,
  validateCounterfactualInternal,
  getCounterfactualsInternal,
  getUpdateHistoryInternal,
  getHindsightRecordsInternal,
  computeStatsInternal,
  type AuditDataStores,
} from './belief-memory-audit.js';
import {
  reviseBeliefInternal,
  applyHindsightInternal,
  adjustConfidenceInternal,
  pruneSupersededInternal,
  type ReflectDataStores,
} from './belief-memory-reflect.js';
import type { BeliefMemoryData, HydratedBeliefData } from './belief-memory-persistence.js';

/**
 * In-memory implementation of Hindsight Belief Memory.
 */
export class HindsightBeliefMemory implements IHindsightBeliefMemory {
  private readonly beliefs: Map<string, Belief> = new Map();
  private readonly updates: Map<string, BeliefUpdate[]> = new Map();
  private readonly counterfactuals: Map<string, Counterfactual> = new Map();
  private readonly hindsightRecords: Map<string, HindsightRecord[]> = new Map();
  private readonly subjectIndex: Map<string, Set<string>> = new Map();
  private readonly predicateIndex: Map<string, Set<string>> = new Map();
  private readonly domainIndex: Map<string, Set<string>> = new Map();
  private readonly config: Required<BeliefMemoryConfig>;
  private readonly logger: ILogger;

  constructor(config?: BeliefMemoryConfig, logger?: ILogger) {
    const validation = BeliefMemoryConfigSchema.safeParse(config ?? {});
    if (!validation.success) {
      throw new MemoryError(`Invalid BeliefMemoryConfig: ${formatZodError(validation.error)}`);
    }
    this.config = { ...DEFAULT_BELIEF_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'HindsightBeliefMemory' });
    this.logger.info('HindsightBeliefMemory initialized', { config: this.config });
  }

  private get auditStores(): AuditDataStores {
    return {
      beliefs: this.beliefs,
      updates: this.updates,
      counterfactuals: this.counterfactuals,
      hindsightRecords: this.hindsightRecords,
      logger: this.logger,
    };
  }

  private get reflectStores(): ReflectDataStores {
    return {
      beliefs: this.beliefs,
      updates: this.updates,
      hindsightRecords: this.hindsightRecords,
      logger: this.logger,
      recordUpdate: (opts) => {
        this.recordUpdate(opts);
      },
    };
  }

  private get recallStores(): RecallDataStores {
    return {
      beliefs: this.beliefs,
      subjectIndex: this.subjectIndex,
      predicateIndex: this.predicateIndex,
      domainIndex: this.domainIndex,
    };
  }

  // =========================================================================
  // Retain Operations
  // =========================================================================

  retain(
    belief: Omit<Belief, 'beliefId' | 'version' | 'createdAt' | 'updatedAt' | 'superseded'>
  ): Promise<Result<Belief, MemoryError>> {
    return this.retainInternal(belief);
  }

  private retainInternal(
    belief: Omit<Belief, 'beliefId' | 'version' | 'createdAt' | 'updatedAt' | 'superseded'>
  ): Promise<Result<Belief, MemoryError>> {
    try {
      const validation = BeliefSchema.omit({
        beliefId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        superseded: true,
      }).safeParse(belief);
      if (!validation.success) {
        return Promise.resolve(
          err(
            new MemoryError('Invalid belief data', { context: { errors: validation.error.issues } })
          )
        );
      }
      const now = new Date(getTimeProvider().now());
      const newBelief: Belief = {
        ...belief,
        beliefId: generateId('belief'),
        version: 1,
        createdAt: now,
        updatedAt: now,
        superseded: false,
      };
      this.beliefs.set(newBelief.beliefId, newBelief);
      this.indexBelief(newBelief);
      this.recordUpdate({
        beliefId: newBelief.beliefId,
        updateType: BeliefUpdateTypeEnum.RETAIN,
        previousState: {},
        newState: Object.fromEntries(Object.entries(newBelief)),
        reason: 'Initial belief creation',
      });
      this.logger.debug('Belief retained', {
        beliefId: newBelief.beliefId,
        subject: newBelief.subject,
      });
      return Promise.resolve(ok(newBelief));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new MemoryError('Failed to retain belief', { cause: causeError }))
      );
    }
  }

  async retainBatch(
    beliefs: readonly Omit<
      Belief,
      'beliefId' | 'version' | 'createdAt' | 'updatedAt' | 'superseded'
    >[]
  ): Promise<Result<readonly Belief[], MemoryError>> {
    const results: Belief[] = [];
    for (const belief of beliefs) {
      const result = await this.retainInternal(belief);
      if (!result.ok) return result;
      results.push(result.value);
    }
    return ok(results);
  }

  // =========================================================================
  // Recall Operations (delegated to belief-memory-recall.ts)
  // =========================================================================

  recall(beliefId: string): Promise<Result<Belief | null, MemoryError>> {
    return recallInternal(this.recallStores, beliefId);
  }

  query(query: BeliefQuery): Promise<Result<readonly Belief[], MemoryError>> {
    return queryInternal(this.recallStores, query);
  }

  recallBySubject(
    subject: string,
    limit?: number
  ): Promise<Result<readonly Belief[], MemoryError>> {
    return recallBySubjectInternal(this.recallStores, subject, limit);
  }

  recallCurrent(subject: string, predicate: string): Promise<Result<Belief | null, MemoryError>> {
    return recallCurrentInternal(this.recallStores, subject, predicate);
  }

  recallHistory(
    subject: string,
    predicate: string,
    limit?: number
  ): Promise<Result<readonly Belief[], MemoryError>> {
    return recallHistoryInternal(this.recallStores, subject, predicate, limit);
  }

  // =========================================================================
  // Reflect Operations (delegated to belief-memory-reflect.ts)
  // =========================================================================

  revise(
    beliefId: string,
    updates: Partial<Pick<Belief, 'object' | 'confidence' | 'metadata'>>,
    reason: string
  ): Promise<Result<Belief, MemoryError>> {
    return reviseBeliefInternal(this.reflectStores, { beliefId, updates, reason });
  }

  async supersede(
    beliefId: string,
    newBelief: Omit<Belief, 'beliefId' | 'version' | 'createdAt' | 'updatedAt' | 'superseded'>,
    reason: string
  ): Promise<Result<Belief, MemoryError>> {
    try {
      const existing = this.beliefs.get(beliefId);
      if (existing === undefined)
        return err(new MemoryError('Belief not found', { context: { beliefId } }));
      const retainResult = await this.retainInternal(newBelief);
      if (!retainResult.ok) return retainResult;
      const now = new Date(getTimeProvider().now());
      const superseded: Belief = {
        ...existing,
        superseded: true,
        supersededBy: retainResult.value.beliefId,
        updatedAt: now,
      };
      this.beliefs.set(beliefId, superseded);
      this.recordUpdate({
        beliefId,
        updateType: BeliefUpdateTypeEnum.SUPERSEDE,
        previousState: { superseded: false },
        newState: { superseded: true, supersededBy: retainResult.value.beliefId },
        reason,
      });
      this.logger.debug('Belief superseded', {
        oldBeliefId: beliefId,
        newBeliefId: retainResult.value.beliefId,
      });
      return ok(retainResult.value);
    } catch (error) {
      return err(
        new MemoryError('Failed to supersede belief', {
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      );
    }
  }

  applyHindsight(record: HindsightRecord): Promise<Result<readonly Belief[], MemoryError>> {
    return applyHindsightInternal(this.reflectStores, record);
  }

  reinforce(beliefId: string, evidence: string): Promise<Result<Belief, MemoryError>> {
    return adjustConfidenceInternal(this.reflectStores, beliefId, evidence, 'reinforce');
  }

  weaken(beliefId: string, evidence: string): Promise<Result<Belief, MemoryError>> {
    return adjustConfidenceInternal(this.reflectStores, beliefId, evidence, 'weaken');
  }

  // =========================================================================
  // Counterfactual, Audit, and Stats (delegated to belief-memory-audit.ts)
  // =========================================================================

  createCounterfactual(
    hypothesis: string,
    taskContext?: string
  ): Promise<Result<Counterfactual, MemoryError>> {
    return createCounterfactualInternal(this.auditStores, hypothesis, taskContext);
  }

  validateCounterfactual(
    counterfactualId: string,
    actualOutcomes: readonly string[]
  ): Promise<Result<Counterfactual, MemoryError>> {
    return validateCounterfactualInternal(this.auditStores, counterfactualId, actualOutcomes);
  }

  getCounterfactuals(taskContext: string): Promise<Result<readonly Counterfactual[], MemoryError>> {
    return getCounterfactualsInternal(this.auditStores, taskContext);
  }

  getUpdateHistory(beliefId: string): Promise<Result<readonly BeliefUpdate[], MemoryError>> {
    return getUpdateHistoryInternal(this.auditStores, beliefId);
  }

  getHindsightRecords(taskId: string): Promise<Result<readonly HindsightRecord[], MemoryError>> {
    return getHindsightRecordsInternal(this.auditStores, taskId);
  }

  getStats(): Promise<Result<BeliefMemoryStats, MemoryError>> {
    try {
      return Promise.resolve(ok(computeStatsInternal(this.auditStores)));
    } catch (e) {
      return Promise.resolve(
        err(
          new MemoryError('Failed to get stats', {
            cause: e instanceof Error ? e : new Error(String(e)),
          })
        )
      );
    }
  }

  pruneSuperseded(olderThan: Date): Promise<Result<number, MemoryError>> {
    return pruneSupersededInternal(
      {
        ...this.reflectStores,
        subjectIndex: this.subjectIndex,
        predicateIndex: this.predicateIndex,
        domainIndex: this.domainIndex,
      },
      olderThan
    );
  }

  // =========================================================================
  // Persistence (Issue #714 Phase 3)
  // =========================================================================

  /** Export all internal data for disk serialization. */
  exportData(): BeliefMemoryData {
    return {
      beliefs: this.beliefs,
      updates: this.updates,
      counterfactuals: this.counterfactuals,
      hindsightRecords: this.hindsightRecords,
    };
  }

  /** Hydrate from a previously loaded snapshot. Rebuilds indexes. */
  hydrate(data: HydratedBeliefData): void {
    this.beliefs.clear();
    this.updates.clear();
    this.counterfactuals.clear();
    this.hindsightRecords.clear();
    this.subjectIndex.clear();
    this.predicateIndex.clear();
    this.domainIndex.clear();

    for (const [id, belief] of data.beliefs) {
      this.beliefs.set(id, belief);
      this.indexBelief(belief);
    }
    for (const [id, records] of data.updates) {
      this.updates.set(id, records);
    }
    for (const [id, cf] of data.counterfactuals) {
      this.counterfactuals.set(id, cf);
    }
    for (const [id, records] of data.hindsightRecords) {
      this.hindsightRecords.set(id, records);
    }
    this.logger.info('BeliefMemory hydrated from snapshot', {
      beliefs: this.beliefs.size,
      updates: this.updates.size,
      counterfactuals: this.counterfactuals.size,
      hindsightRecords: this.hindsightRecords.size,
    });
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private indexBelief(belief: Belief): void {
    const subjectSet = this.subjectIndex.get(belief.subject) ?? new Set();
    subjectSet.add(belief.beliefId);
    this.subjectIndex.set(belief.subject, subjectSet);
    const predicateSet = this.predicateIndex.get(belief.predicate) ?? new Set();
    predicateSet.add(belief.beliefId);
    this.predicateIndex.set(belief.predicate, predicateSet);
    if (belief.domain !== undefined) {
      const domainSet = this.domainIndex.get(belief.domain) ?? new Set();
      domainSet.add(belief.beliefId);
      this.domainIndex.set(belief.domain, domainSet);
    }
  }

  private recordUpdate(opts: {
    beliefId: string;
    updateType: BeliefUpdate['updateType'];
    previousState: Record<string, unknown>;
    newState: Record<string, unknown>;
    reason: string;
    evidence?: string;
  }): void {
    const history = this.updates.get(opts.beliefId) ?? [];
    history.push(createUpdateRecord(opts));
    this.updates.set(opts.beliefId, history);
  }
}

// Re-export types and schemas
export type {
  Belief,
  BeliefConfidence,
  BeliefMemoryConfig,
  BeliefMemoryStats,
  BeliefQuery,
  BeliefSourceType,
  BeliefUpdate,
  BeliefUpdateType,
  Counterfactual,
  HindsightRecord,
  IHindsightBeliefMemory,
} from './belief-types.js';
export {
  BeliefConfidence as BeliefConfidenceEnum,
  BeliefMemoryConfigSchema,
  BeliefQuerySchema,
  BeliefSchema,
  BeliefSourceType as BeliefSourceTypeEnum,
  BeliefUpdateType as BeliefUpdateTypeEnum,
  DEFAULT_BELIEF_CONFIG,
} from './belief-types.js';
