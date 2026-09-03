/**
 * Database Type Definitions
 *
 * Unified interfaces for SQLite database operations.
 * Consolidates duplicate definitions from session-storage, learning, and memory modules.
 *
 * @module core/types/database-types
 */

// ============================================================================
// SQLite Statement Interface
// ============================================================================

/**
 * Minimal interface for a prepared SQLite statement.
 * Satisfied by `node:sqlite`'s StatementSync (#5388).
 */
export interface ISQLiteStatement<T = unknown> {
  /**
   * Execute the statement with the given parameters.
   * Returns information about changes made.
   */
  run(...params: unknown[]): ISQLiteRunResult;

  /**
   * Get a single row matching the statement.
   * Returns undefined if no match.
   */
  get(...params: unknown[]): T | undefined;

  /**
   * Get all rows matching the statement.
   */
  all(...params: unknown[]): T[];
}

/**
 * Result of running a SQLite statement.
 */
export interface ISQLiteRunResult {
  /** Number of rows changed */
  readonly changes: number;
  /** ID of the last inserted row (optional, depends on operation) */
  readonly lastInsertRowid?: number | bigint;
}

// ============================================================================
// SQLite Database Interface
// ============================================================================

/**
 * Minimal interface for a SQLite database handle.
 * Satisfied by `node:sqlite`'s DatabaseSync via `openSqliteDatabase` (#5388).
 * ~30 helper signatures and ~12 test doubles are written against this, which is
 * why swapping the engine underneath did not ripple outward.
 */
export interface ISQLiteDatabase {
  /**
   * Execute raw SQL statements (typically for DDL or multiple statements).
   */
  exec(sql: string): void;

  /**
   * Prepare a parameterized statement for execution.
   */
  prepare<T = unknown>(sql: string): ISQLiteStatement<T>;

  /**
   * Close the database connection.
   */
  close(): void;
}
