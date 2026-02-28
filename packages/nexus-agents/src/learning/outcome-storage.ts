/**
 * nexus-agents/learning - SQLite Outcome Storage
 *
 * Implements persistent storage for routing decisions and outcomes
 * using SQLite. Enables cross-session learning for LinUCB bandit.
 *
 * @module learning/outcome-storage
 * (Source: Issue #188 - Outcome recording for routing ML feedback)
 */

import type { Result } from '../core/result.js';
import { ok } from '../core/result.js';
import { ValidationError, toError } from '../core/errors.js';
import { formatZodError } from '../core/zod-helpers.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';
import type { CliName } from '../cli-adapters/types.js';
import {
  type IOutcomeStorage,
  type ISQLiteDatabase,
  type OutcomeStorageConfig,
  type StoredRoutingDecision,
  type StoredTaskOutcome,
  type StoredReward,
  type StoredModelStats,
  type RoutingDecisionRow,
  type TaskOutcomeRow,
  type ModelStatsRow,
  OutcomeStorageConfigSchema,
  OutcomeStorageError,
} from './outcome-storage-types.js';
import {
  createDecisionsTable,
  createOutcomesTable,
  createRewardsTable,
  createIndexes,
  rowToDecision,
  rowToOutcome,
  rowToStats,
  INSERT_DECISION_SQL,
  INSERT_OUTCOME_SQL,
  INSERT_REWARD_SQL,
  MODEL_STATS_SQL,
  wrapStorageError,
} from './outcome-storage-helpers.js';

/**
 * SQLite-based outcome storage implementation.
 */
export class SQLiteOutcomeStorage implements IOutcomeStorage {
  private readonly dbPath: string;
  private readonly logger: ILogger;
  private db: ISQLiteDatabase | null = null;
  private initialized = false;

  constructor(config: OutcomeStorageConfig) {
    const validation = OutcomeStorageConfigSchema.safeParse(config);
    if (!validation.success) {
      throw new ValidationError(
        `Invalid OutcomeStorageConfig: ${formatZodError(validation.error)}`,
        {
          context: { config, validationErrors: validation.error.issues },
        }
      );
    }

    this.dbPath = config.dbPath;
    this.logger = config.logger ?? createLogger({ component: 'OutcomeStorage' });
  }

  /** Initialize with an existing database instance (for testing). */
  initializeWithDatabase(database: ISQLiteDatabase): void {
    this.db = database;
    this.createTables();
    this.initialized = true;
    this.logger.info('SQLiteOutcomeStorage initialized', { dbPath: this.dbPath });
  }

  /** Initialize the storage backend. */
  async initialize(): Promise<Result<void, OutcomeStorageError>> {
    if (this.initialized) return ok(undefined);

    try {
      const betterSqlite3Module = await import('better-sqlite3').catch(() => null);
      if (betterSqlite3Module === null) {
        return wrapStorageError(
          new Error('better-sqlite3 not installed'),
          'better-sqlite3 not installed. Install: npm install better-sqlite3',
          { dbPath: this.dbPath }
        );
      }
      const Database = betterSqlite3Module.default;
      this.db = new (Database as new (path: string) => ISQLiteDatabase)(this.dbPath);
      this.createTables();
      this.initialized = true;
      this.logger.info('SQLiteOutcomeStorage initialized', { dbPath: this.dbPath });
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to initialize SQLiteOutcomeStorage', toError(error));
      return wrapStorageError(error, 'Failed to initialize outcome storage', {
        dbPath: this.dbPath,
      });
    }
  }

  private createTables(): void {
    const database = this.getDatabase();
    createDecisionsTable(database);
    createOutcomesTable(database);
    createRewardsTable(database);
    createIndexes(database);
    this.logger.debug('Database tables created');
  }

  private getDatabase(): ISQLiteDatabase {
    if (this.db === null) throw new OutcomeStorageError('Database not initialized');
    return this.db;
  }

  private ensureInitialized(): void {
    if (!this.initialized || this.db === null) {
      throw new OutcomeStorageError(
        'SQLiteOutcomeStorage not initialized. Call initialize() first.'
      );
    }
  }

  storeDecision(decision: StoredRoutingDecision): Promise<Result<void, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const stmt = this.getDatabase().prepare<RoutingDecisionRow>(INSERT_DECISION_SQL);
      stmt.run(
        decision.id,
        decision.traceId,
        new Date(decision.timestamp).getTime(),
        decision.routerType,
        decision.selectedModel,
        JSON.stringify(decision.alternativeModels),
        decision.confidence,
        decision.reason,
        JSON.stringify(decision.taskProfile),
        decision.requestId ?? null
      );
      this.logger.debug('Stored routing decision', {
        id: decision.id,
        model: decision.selectedModel,
      });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      this.logger.error('Failed to store routing decision', toError(error));
      return Promise.resolve(
        wrapStorageError(error, 'Failed to store routing decision', { decisionId: decision.id })
      );
    }
  }

  storeOutcome(outcome: StoredTaskOutcome): Promise<Result<void, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const stmt = this.getDatabase().prepare<TaskOutcomeRow>(INSERT_OUTCOME_SQL);
      stmt.run(
        outcome.routingDecisionId,
        new Date(outcome.timestamp).getTime(),
        outcome.outcomeClass,
        outcome.success ? 1 : 0,
        outcome.qualityScore,
        outcome.durationMs,
        outcome.tokenUsage,
        outcome.errorMessage ?? null
      );
      this.logger.debug('Stored task outcome', {
        decisionId: outcome.routingDecisionId,
        success: outcome.success,
      });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      this.logger.error('Failed to store task outcome', toError(error));
      return Promise.resolve(
        wrapStorageError(error, 'Failed to store task outcome', {
          decisionId: outcome.routingDecisionId,
        })
      );
    }
  }

  storeReward(reward: StoredReward): Promise<Result<void, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const stmt = this.getDatabase().prepare(INSERT_REWARD_SQL);
      stmt.run(
        reward.routingDecisionId,
        new Date(reward.timestamp).getTime(),
        reward.reward,
        reward.baseReward,
        reward.qualityBonus,
        reward.speedBonus,
        reward.efficiencyBonus,
        reward.retryPenalty
      );
      this.logger.debug('Stored computed reward', {
        decisionId: reward.routingDecisionId,
        reward: reward.reward,
      });
      return Promise.resolve(ok(undefined));
    } catch (error) {
      this.logger.error('Failed to store computed reward', toError(error));
      return Promise.resolve(
        wrapStorageError(error, 'Failed to store computed reward', {
          decisionId: reward.routingDecisionId,
        })
      );
    }
  }

  getDecision(id: string): Promise<Result<StoredRoutingDecision | null, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const row = this.getDatabase()
        .prepare<RoutingDecisionRow>(`SELECT * FROM routing_decisions WHERE id = ?`)
        .get(id);
      return Promise.resolve(ok(row === undefined ? null : rowToDecision(row)));
    } catch (error) {
      return Promise.resolve(wrapStorageError(error, 'Failed to get routing decision'));
    }
  }

  getOutcome(decisionId: string): Promise<Result<StoredTaskOutcome | null, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const row = this.getDatabase()
        .prepare<TaskOutcomeRow>(`SELECT * FROM task_outcomes WHERE routing_decision_id = ?`)
        .get(decisionId);
      return Promise.resolve(ok(row === undefined ? null : rowToOutcome(row)));
    } catch (error) {
      return Promise.resolve(wrapStorageError(error, 'Failed to get task outcome'));
    }
  }

  getModelStats(): Promise<Result<StoredModelStats[], OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const rows = this.getDatabase().prepare<ModelStatsRow>(MODEL_STATS_SQL).all();
      return Promise.resolve(ok(rows.map(rowToStats)));
    } catch (error) {
      return Promise.resolve(wrapStorageError(error, 'Failed to get model stats'));
    }
  }

  getRecentDecisions(
    model: CliName,
    limit: number
  ): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const sql = `SELECT * FROM routing_decisions WHERE selected_model = ? ORDER BY timestamp DESC LIMIT ?`;
      const rows = this.getDatabase().prepare<RoutingDecisionRow>(sql).all(model, limit);
      return Promise.resolve(ok(rows.map(rowToDecision)));
    } catch (error) {
      return Promise.resolve(wrapStorageError(error, 'Failed to get recent decisions'));
    }
  }

  getDecisionsByRequestId(
    requestId: string
  ): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const sql = `SELECT * FROM routing_decisions WHERE request_id = ? ORDER BY timestamp DESC`;
      const rows = this.getDatabase().prepare<RoutingDecisionRow>(sql).all(requestId);
      return Promise.resolve(ok(rows.map(rowToDecision)));
    } catch (error) {
      return Promise.resolve(wrapStorageError(error, 'Failed to get decisions by request ID'));
    }
  }

  prune(olderThan: Date): Promise<Result<number, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const db = this.getDatabase();
      const cutoff = olderThan.getTime();
      const subquery = `(SELECT id FROM routing_decisions WHERE timestamp < ?)`;
      // Delete in order due to foreign key constraints
      const r1 = db
        .prepare(`DELETE FROM computed_rewards WHERE routing_decision_id IN ${subquery}`)
        .run(cutoff);
      const r2 = db
        .prepare(`DELETE FROM task_outcomes WHERE routing_decision_id IN ${subquery}`)
        .run(cutoff);
      const r3 = db.prepare(`DELETE FROM routing_decisions WHERE timestamp < ?`).run(cutoff);
      const total = r1.changes + r2.changes + r3.changes;
      this.logger.info('Pruned old records', { total, cutoff: olderThan.toISOString() });
      return Promise.resolve(ok(total));
    } catch (error) {
      return Promise.resolve(wrapStorageError(error, 'Failed to prune records'));
    }
  }

  getCounts(): Promise<
    Result<{ decisions: number; outcomes: number; rewards: number }, OutcomeStorageError>
  > {
    try {
      this.ensureInitialized();
      const db = this.getDatabase();
      const getCount = (table: string): number =>
        db.prepare<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`).get()?.count ?? 0;
      return Promise.resolve(
        ok({
          decisions: getCount('routing_decisions'),
          outcomes: getCount('task_outcomes'),
          rewards: getCount('computed_rewards'),
        })
      );
    } catch (error) {
      return Promise.resolve(wrapStorageError(error, 'Failed to get counts'));
    }
  }

  /** Close the database connection. */
  close(): void {
    if (this.db !== null) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      this.logger.info('SQLiteOutcomeStorage closed');
    }
  }
}

/** Create an SQLite outcome storage instance. */
export function createOutcomeStorage(config: OutcomeStorageConfig): SQLiteOutcomeStorage {
  return new SQLiteOutcomeStorage(config);
}
