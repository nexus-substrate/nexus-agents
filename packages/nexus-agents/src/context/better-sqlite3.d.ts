/**
 * Type declaration for better-sqlite3 module.
 *
 * This is a minimal declaration to satisfy TypeScript when the module
 * is dynamically imported. For full type support, install @types/better-sqlite3.
 *
 * Note: This file exists to allow the project to compile without requiring
 * better-sqlite3 as a mandatory dependency. The actual module is loaded
 * dynamically at runtime when initialize() is called.
 */
declare module 'better-sqlite3' {
  interface Database {
    exec(sql: string): void;
    prepare<T = unknown>(sql: string): Statement<T>;
    close(): void;
  }

  interface Statement<T = unknown> {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): T | undefined;
    all(...params: unknown[]): T[];
  }

  interface DatabaseConstructor {
    new (filename: string, options?: unknown): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
  export type { Database, Statement };
}
