/**
 * Nexus-Agents Task Store — wraps SDK InMemoryTaskStore with security controls.
 *
 * Provides:
 * - TTL enforcement (max 10 minutes per task)
 * - Capacity cap (max 50 tasks, FIFO eviction when exceeded)
 * - Singleton access via `getTaskStore()`
 * - Periodic cleanup of expired tasks
 *
 * @module mcp/task-store
 * (Source: Issue #1298 — Layer 2 MCP Tasks async execution)
 */

import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { TaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';
import { createLogger } from '../core/index.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum TTL for any task (10 minutes). */
export const MAX_TASK_TTL_MS = 600_000;

/** Default TTL applied when none specified (5 minutes). */
export const DEFAULT_TASK_TTL_MS = 300_000;

/** Maximum number of tasks before FIFO eviction. */
export const MAX_TASK_CAPACITY = 50;

/** Interval for periodic cleanup of expired tasks (60 seconds). */
const CLEANUP_INTERVAL_MS = 60_000;

// ============================================================================
// Singleton
// ============================================================================

const logger = createLogger({ component: 'task-store' });

let singletonStore: InMemoryTaskStore | undefined;
let cleanupTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Returns the singleton InMemoryTaskStore, creating it on first call.
 *
 * The SDK's InMemoryTaskStore handles TTL cleanup internally.
 * We enforce our MAX_TASK_TTL_MS via `clampTaskTtl()` at task creation
 * (done by the ToolTaskHandler, not the store itself).
 */
export function getTaskStore(): TaskStore {
  if (singletonStore === undefined) {
    singletonStore = new InMemoryTaskStore();
    logger.info('Task store created', { maxCapacity: MAX_TASK_CAPACITY });

    // Periodic cleanup: evict oldest tasks if capacity exceeded
    cleanupTimer = setInterval(() => {
      evictExcessTasks();
    }, CLEANUP_INTERVAL_MS);

    // Prevent cleanup timer from keeping Node alive
    if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
      cleanupTimer.unref();
    }
  }
  return singletonStore;
}

/**
 * Clamps a requested TTL to the maximum allowed value.
 * Returns DEFAULT_TASK_TTL_MS if no TTL is specified or null.
 */
export function clampTaskTtl(requestedTtl?: number | null): number {
  if (requestedTtl === undefined || requestedTtl === null) {
    return DEFAULT_TASK_TTL_MS;
  }
  if (requestedTtl > MAX_TASK_TTL_MS) {
    logger.warn('Task TTL clamped to maximum', {
      requested: requestedTtl,
      max: MAX_TASK_TTL_MS,
    });
    return MAX_TASK_TTL_MS;
  }
  return requestedTtl;
}

/**
 * Evicts oldest tasks when capacity is exceeded (FIFO).
 * Best-effort — logs warnings but does not throw.
 */
function evictExcessTasks(): void {
  if (singletonStore === undefined) return;

  const allTasks = singletonStore.getAllTasks();
  if (allTasks.length <= MAX_TASK_CAPACITY) return;

  // Sort by creation time ascending (oldest first)
  const sorted = [...allTasks].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const evictCount = sorted.length - MAX_TASK_CAPACITY;
  for (let i = 0; i < evictCount; i++) {
    const task = sorted[i];
    if (task === undefined) continue;
    singletonStore
      .updateTaskStatus(task.taskId, 'cancelled', 'Evicted: capacity exceeded')
      .catch((err: unknown) => {
        logger.debug('Failed to evict task', {
          taskId: task.taskId,
          error: String(err),
        });
      });
  }

  logger.info('Evicted excess tasks', { evicted: evictCount, total: sorted.length });
}

/**
 * Shuts down the task store and cleanup timer.
 * Call during server shutdown. Safe to call multiple times.
 * @internal
 */
export function shutdownTaskStore(): void {
  if (cleanupTimer !== undefined) {
    clearInterval(cleanupTimer);
    cleanupTimer = undefined;
  }
  if (singletonStore !== undefined) {
    singletonStore.cleanup();
    singletonStore = undefined;
    logger.info('Task store shut down');
  }
}

/** Resets the singleton for testing. @internal */
export function resetTaskStore(): void {
  shutdownTaskStore();
}
