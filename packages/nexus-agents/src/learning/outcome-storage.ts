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
import { ok, err } from '../core/result.js';
import { ValidationError } from '../core/errors.js';
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
      const issues = validation.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new ValidationError(`Invalid OutcomeStorageConfig: ${issues}`, {
        context: { config, validationErrors: validation.error.issues },
      });
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
        return err(
          new OutcomeStorageError('better-sqlite3 is not installed. Run: pnpm add better-sqlite3', {
            context: { dbPath: this.dbPath },
          })
        );
      }

      const Database = betterSqlite3Module.default;
      this.db = new (Database as new (path: string) => ISQLiteDatabase)(this.dbPath);
      this.createTables();
      this.initialized = true;
      this.logger.info('SQLiteOutcomeStorage initialized', { dbPath: this.dbPath });
      return ok(undefined);
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to initialize SQLiteOutcomeStorage', causeError);
      return err(
        new OutcomeStorageError('Failed to initialize outcome storage', {
          cause: causeError,
          context: { dbPath: this.dbPath },
        })
      );
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
      const database = this.getDatabase();

      const stmt = database.prepare<RoutingDecisionRow>(`
        INSERT OR REPLACE INTO routing_decisions
        (id, trace_id, timestamp, router_type, selected_model, alternative_models,
         confidence, reason, task_profile, request_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

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
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to store routing decision', causeError);
      return Promise.resolve(
        err(
          new OutcomeStorageError('Failed to store routing decision', {
            cause: causeError,
            context: { decisionId: decision.id },
          })
        )
      );
    }
  }

  storeOutcome(outcome: StoredTaskOutcome): Promise<Result<void, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();

      const stmt = database.prepare<TaskOutcomeRow>(`
        INSERT OR REPLACE INTO task_outcomes
        (routing_decision_id, timestamp, outcome_class, success, quality_score,
         duration_ms, token_usage, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

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
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to store task outcome', causeError);
      return Promise.resolve(
        err(
          new OutcomeStorageError('Failed to store task outcome', {
            cause: causeError,
            context: { decisionId: outcome.routingDecisionId },
          })
        )
      );
    }
  }

  storeReward(reward: StoredReward): Promise<Result<void, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();

      const stmt = database.prepare(`
        INSERT OR REPLACE INTO computed_rewards
        (routing_decision_id, timestamp, reward, base_reward, quality_bonus,
         speed_bonus, efficiency_bonus, retry_penalty)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

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
      const causeError = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to store computed reward', causeError);
      return Promise.resolve(
        err(
          new OutcomeStorageError('Failed to store computed reward', {
            cause: causeError,
            context: { decisionId: reward.routingDecisionId },
          })
        )
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
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new OutcomeStorageError('Failed to get routing decision', { cause: causeError }))
      );
    }
  }

  getOutcome(
    routingDecisionId: string
  ): Promise<Result<StoredTaskOutcome | null, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const row = this.getDatabase()
        .prepare<TaskOutcomeRow>(`SELECT * FROM task_outcomes WHERE routing_decision_id = ?`)
        .get(routingDecisionId);
      return Promise.resolve(ok(row === undefined ? null : rowToOutcome(row)));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new OutcomeStorageError('Failed to get task outcome', { cause: causeError }))
      );
    }
  }

  getModelStats(): Promise<Result<StoredModelStats[], OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const rows = this.getDatabase()
        .prepare<ModelStatsRow>(
          `
        SELECT
          rd.selected_model as model,
          COUNT(DISTINCT rd.id) as total_decisions,
          COUNT(DISTINCT o.routing_decision_id) as total_outcomes,
          COALESCE(AVG(r.reward), 0) as avg_reward,
          COALESCE(AVG(o.quality_score), 0) as avg_quality_score,
          COALESCE(AVG(o.duration_ms), 0) as avg_latency_ms,
          COALESCE(AVG(CAST(o.success AS REAL)), 0) as success_rate
        FROM routing_decisions rd
        LEFT JOIN task_outcomes o ON rd.id = o.routing_decision_id
        LEFT JOIN computed_rewards r ON rd.id = r.routing_decision_id
        GROUP BY rd.selected_model
        ORDER BY total_decisions DESC
      `
        )
        .all();
      return Promise.resolve(ok(rows.map(rowToStats)));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new OutcomeStorageError('Failed to get model stats', { cause: causeError }))
      );
    }
  }

  getRecentDecisions(
    model: CliName,
    limit: number
  ): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const rows = this.getDatabase()
        .prepare<RoutingDecisionRow>(
          `SELECT * FROM routing_decisions WHERE selected_model = ? ORDER BY timestamp DESC LIMIT ?`
        )
        .all(model, limit);
      return Promise.resolve(ok(rows.map(rowToDecision)));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new OutcomeStorageError('Failed to get recent decisions', { cause: causeError }))
      );
    }
  }

  getDecisionsByRequestId(
    requestId: string
  ): Promise<Result<StoredRoutingDecision[], OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const rows = this.getDatabase()
        .prepare<RoutingDecisionRow>(
          `SELECT * FROM routing_decisions WHERE request_id = ? ORDER BY timestamp DESC`
        )
        .all(requestId);
      return Promise.resolve(ok(rows.map(rowToDecision)));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new OutcomeStorageError('Failed to get decisions by request ID', { cause: causeError }))
      );
    }
  }

  prune(olderThan: Date): Promise<Result<number, OutcomeStorageError>> {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const cutoff = olderThan.getTime();

      // Delete in order due to foreign key constraints
      const r1 = database
        .prepare(
          `DELETE FROM computed_rewards WHERE routing_decision_id IN
           (SELECT id FROM routing_decisions WHERE timestamp < ?)`
        )
        .run(cutoff);
      const r2 = database
        .prepare(
          `DELETE FROM task_outcomes WHERE routing_decision_id IN
           (SELECT id FROM routing_decisions WHERE timestamp < ?)`
        )
        .run(cutoff);
      const r3 = database.prepare(`DELETE FROM routing_decisions WHERE timestamp < ?`).run(cutoff);

      const total = r1.changes + r2.changes + r3.changes;
      this.logger.info('Pruned old records', { total, cutoff: olderThan.toISOString() });
      return Promise.resolve(ok(total));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new OutcomeStorageError('Failed to prune records', { cause: causeError }))
      );
    }
  }

  getCounts(): Promise<
    Result<{ decisions: number; outcomes: number; rewards: number }, OutcomeStorageError>
  > {
    try {
      this.ensureInitialized();
      const database = this.getDatabase();
      const decisions =
        database.prepare<{ count: number }>('SELECT COUNT(*) as count FROM routing_decisions').get()
          ?.count ?? 0;
      const outcomes =
        database.prepare<{ count: number }>('SELECT COUNT(*) as count FROM task_outcomes').get()
          ?.count ?? 0;
      const rewards =
        database.prepare<{ count: number }>('SELECT COUNT(*) as count FROM computed_rewards').get()
          ?.count ?? 0;
      return Promise.resolve(ok({ decisions, outcomes, rewards }));
    } catch (error) {
      const causeError = error instanceof Error ? error : new Error(String(error));
      return Promise.resolve(
        err(new OutcomeStorageError('Failed to get counts', { cause: causeError }))
      );
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
