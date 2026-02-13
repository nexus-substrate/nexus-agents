/**
 * Concurrent expert admission control with semaphore pool.
 *
 * Limits the number of concurrent expert executions to prevent
 * adapter saturation when multiple experts run in parallel.
 *
 * @module agents/expert-pool
 * (Source: Issue #1029 — Concurrent expert admission control)
 */

// ============================================================================
// Types
// ============================================================================

/** Permit returned by acquire() — must be released after use. */
export interface ExpertPermit {
  readonly id: number;
  readonly acquiredAt: number;
}

/** Pool status snapshot. */
export interface ExpertPoolStatus {
  readonly active: number;
  readonly queued: number;
  readonly capacity: number;
}

/** Configuration for the expert pool. */
export interface ExpertPoolConfig {
  /** Maximum concurrent experts (default: 6). */
  readonly capacity: number;
  /** Timeout for queued acquire requests in ms (default: 300_000). */
  readonly acquireTimeoutMs: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CAPACITY = 6;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 300_000;
const MIN_CAPACITY = 1;
const MAX_CAPACITY = 20;

/** Environment variable for capacity override. */
const ENV_KEY = 'NEXUS_MAX_CONCURRENT_EXPERTS';

// ============================================================================
// ExpertPool
// ============================================================================

interface QueueEntry {
  resolve: (permit: ExpertPermit) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Semaphore-based pool for concurrent expert executions.
 *
 * - `acquire()` returns a permit immediately if capacity allows, else queues
 * - `release()` returns permit and dequeues next waiter
 * - `getStatus()` returns current active/queued/capacity
 */
export class ExpertPool {
  private readonly capacity: number;
  private readonly acquireTimeoutMs: number;
  private active = 0;
  private nextId = 1;
  private readonly queue: QueueEntry[] = [];

  constructor(config?: Partial<ExpertPoolConfig>) {
    const rawCapacity = config?.capacity ?? resolveCapacityFromEnv();
    this.capacity = Math.min(Math.max(rawCapacity, MIN_CAPACITY), MAX_CAPACITY);
    this.acquireTimeoutMs = config?.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  }

  /** Acquire a permit. Resolves immediately if capacity, else queues. */
  async acquire(): Promise<ExpertPermit> {
    if (this.active < this.capacity) {
      return this.issuePermit();
    }

    return new Promise<ExpertPermit>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((e) => e.resolve === resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        reject(
          new Error(
            `Expert pool full (${String(this.capacity)} capacity), ` +
              `queued for ${String(this.acquireTimeoutMs)}ms — timed out`
          )
        );
      }, this.acquireTimeoutMs);

      this.queue.push({ resolve, reject, timer });
    });
  }

  /** Release a permit back to the pool. */
  release(_permit: ExpertPermit): void {
    if (this.active <= 0) return;
    this.active--;

    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next !== undefined) {
        clearTimeout(next.timer);
        next.resolve(this.issuePermit());
      }
    }
  }

  /** Get current pool status. */
  getStatus(): ExpertPoolStatus {
    return {
      active: this.active,
      queued: this.queue.length,
      capacity: this.capacity,
    };
  }

  private issuePermit(): ExpertPermit {
    this.active++;
    return { id: this.nextId++, acquiredAt: Date.now() };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalPool: ExpertPool | undefined;

/** Get or create the global expert pool singleton. */
export function getExpertPool(): ExpertPool {
  globalPool ??= new ExpertPool();
  return globalPool;
}

/** Reset global pool (for testing). */
export function resetExpertPool(): void {
  globalPool = undefined;
}

// ============================================================================
// Helpers
// ============================================================================

function resolveCapacityFromEnv(): number {
  const envVal = process.env[ENV_KEY];
  if (envVal !== undefined) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_CAPACITY;
}
