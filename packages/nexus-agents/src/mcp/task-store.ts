// @export-no-consumer-yet — see #4485
/**
 * Nexus-Agents Task Store — native in-memory task store with security controls.
 *
 * Provides:
 * - SubstrateTaskStore native implementation replacing deprecated experimental SDK tasks
 * - TTL enforcement (max 10 minutes per task)
 * - Capacity cap (max 50 tasks, FIFO eviction when exceeded)
 * - Session scoping and isolation (#7045)
 * - Singleton access via `getTaskStore()`
 * - Periodic cleanup of expired tasks
 *
 * @module mcp/task-store
 * (Source: Issue #1298 — Layer 2 MCP Tasks async execution; Epic #4485 — Modern MCP Protocol Evolution Batch 4)
 */

import { randomBytes } from 'node:crypto';
import type { CallToolResult } from './sdk-facade/index.js';
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
// Types & Interfaces
// ============================================================================

/**
 * Task execution lifecycle status.
 */
export type TaskStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';

/**
 * Native MCP Task representation.
 */
export interface Task {
  taskId: string;
  status: TaskStatus;
  ttl?: number | null | undefined;
  createdAt: string;
  lastUpdatedAt: string;
  pollInterval?: number | undefined;
  statusMessage?: string | undefined;
}

/**
 * Result returned upon task creation.
 */
export interface CreateTaskResult {
  task: Task;
  _meta?: Record<string, unknown> | undefined;
}

/**
 * Result returned when querying task status.
 */
export interface GetTaskResult extends Task {
  _meta?: Record<string, unknown> | undefined;
}

/**
 * Task creation parameters.
 */
export interface CreateTaskOptions {
  /**
   * Time in milliseconds to keep task results available after completion.
   * If null, the task has unlimited lifetime until manually cleaned up.
   */
  ttl?: number | null | undefined;
  /**
   * Time in milliseconds to wait between task status requests.
   */
  pollInterval?: number | undefined;
  /**
   * Additional context to pass to the task store.
   */
  context?: Record<string, unknown> | undefined;
}

/**
 * Interface for storing and retrieving task state and results.
 */
export interface TaskStore {
  createTask(
    taskParams: CreateTaskOptions,
    requestId?: unknown,
    request?: unknown,
    sessionId?: string
  ): Promise<Task>;
  getTask(taskId: string, sessionId?: string): Promise<Task | null>;
  storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: CallToolResult,
    sessionId?: string
  ): Promise<void>;
  getTaskResult(taskId: string, sessionId?: string): Promise<CallToolResult>;
  updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    statusMessage?: string,
    sessionId?: string
  ): Promise<void>;
  listTasks(
    cursor?: string,
    sessionId?: string
  ): Promise<{ tasks: Task[]; nextCursor?: string | undefined }>;
  getAllTasks(): readonly Task[];
  cleanup(): void;
}

/**
 * Checks if a task status represents a terminal state (completed, failed, or cancelled).
 */
export function isTerminal(status: TaskStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

interface StoredTaskRecord {
  task: Task;
  request?: unknown;
  requestId?: unknown;
  sessionId?: string | undefined;
  result?: CallToolResult | undefined;
}

// ============================================================================
// Native SubstrateTaskStore Implementation
// ============================================================================

/**
 * Native in-memory task store implementing MCP Tasks with session scoping,
 * TTL enforcement, and terminal state management.
 */
export class SubstrateTaskStore implements TaskStore {
  private readonly tasks = new Map<string, StoredTaskRecord>();
  private readonly cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Generates a 32-character hexadecimal unique task ID.
   */
  generateTaskId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Returns the stored task unless it belongs to a different session than the caller's.
   */
  private lookup(taskId: string, sessionId?: string): StoredTaskRecord | undefined {
    const stored = this.tasks.get(taskId);
    if (
      stored !== undefined &&
      sessionId !== undefined &&
      stored.sessionId !== undefined &&
      stored.sessionId !== sessionId
    ) {
      return undefined;
    }
    return stored;
  }

  /**
   * Schedules or resets a task expiration timer.
   */
  private resetCleanupTimer(taskId: string, ttl: number): void {
    const existingTimer = this.cleanupTimers.get(taskId);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      this.tasks.delete(taskId);
      this.cleanupTimers.delete(taskId);
    }, ttl);
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
    this.cleanupTimers.set(taskId, timer);
  }

  createTask(
    taskParams: CreateTaskOptions,
    requestId?: unknown,
    request?: unknown,
    sessionId?: string
  ): Promise<Task> {
    const taskId = this.generateTaskId();
    if (this.tasks.has(taskId)) {
      return Promise.reject(new Error(`Task with ID ${taskId} already exists`));
    }

    const actualTtl =
      taskParams.ttl !== undefined ? clampTaskTtl(taskParams.ttl) : DEFAULT_TASK_TTL_MS;
    const createdAt = new Date().toISOString();
    const task: Task = {
      taskId,
      status: 'working',
      ttl: actualTtl,
      createdAt,
      lastUpdatedAt: createdAt,
      pollInterval: taskParams.pollInterval ?? 1000,
    };

    this.tasks.set(taskId, {
      task,
      request,
      requestId,
      sessionId,
    });

    if (actualTtl > 0) {
      this.resetCleanupTimer(taskId, actualTtl);
    }

    return Promise.resolve(task);
  }

  getTask(taskId: string, sessionId?: string): Promise<Task | null> {
    const stored = this.lookup(taskId, sessionId);
    return Promise.resolve(stored !== undefined ? { ...stored.task } : null);
  }

  storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: CallToolResult,
    sessionId?: string
  ): Promise<void> {
    const stored = this.lookup(taskId, sessionId);
    if (stored === undefined) {
      return Promise.reject(new Error(`Task with ID ${taskId} not found`));
    }

    if (isTerminal(stored.task.status)) {
      return Promise.reject(
        new Error(
          `Cannot store result for task ${taskId} in terminal status '${stored.task.status}'. Task results can only be stored once.`
        )
      );
    }

    stored.result = result;
    stored.task.status = status;
    stored.task.lastUpdatedAt = new Date().toISOString();

    const taskTtl = stored.task.ttl;
    if (typeof taskTtl === 'number' && taskTtl > 0) {
      this.resetCleanupTimer(taskId, taskTtl);
    }

    return Promise.resolve();
  }

  getTaskResult(taskId: string, sessionId?: string): Promise<CallToolResult> {
    const stored = this.lookup(taskId, sessionId);
    if (stored === undefined) {
      return Promise.reject(new Error(`Task with ID ${taskId} not found`));
    }
    if (stored.result === undefined) {
      return Promise.reject(new Error(`Task ${taskId} has no result stored`));
    }
    return Promise.resolve(stored.result);
  }

  updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    statusMessage?: string,
    sessionId?: string
  ): Promise<void> {
    const stored = this.lookup(taskId, sessionId);
    if (stored === undefined) {
      return Promise.reject(new Error(`Task with ID ${taskId} not found`));
    }

    if (isTerminal(stored.task.status)) {
      return Promise.reject(
        new Error(
          `Cannot update task ${taskId} from terminal status '${stored.task.status}' to '${status}'. Terminal states (completed, failed, cancelled) cannot transition to other states.`
        )
      );
    }

    stored.task.status = status;
    if (statusMessage !== undefined) {
      stored.task.statusMessage = statusMessage;
    }
    stored.task.lastUpdatedAt = new Date().toISOString();

    const taskTtl = stored.task.ttl;
    if (isTerminal(status) && typeof taskTtl === 'number' && taskTtl > 0) {
      this.resetCleanupTimer(taskId, taskTtl);
    }

    return Promise.resolve();
  }

  listTasks(
    cursor?: string,
    sessionId?: string
  ): Promise<{ tasks: Task[]; nextCursor?: string | undefined }> {
    const PAGE_SIZE = 10;
    const allTaskIds = Array.from(this.tasks.keys()).filter(
      (id) => this.lookup(id, sessionId) !== undefined
    );
    let startIndex = 0;
    if (cursor !== undefined) {
      const cursorIndex = allTaskIds.indexOf(cursor);
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      } else {
        return Promise.reject(new Error(`Invalid cursor: ${cursor}`));
      }
    }
    const pageTaskIds = allTaskIds.slice(startIndex, startIndex + PAGE_SIZE);
    const tasks: Task[] = [];
    for (const id of pageTaskIds) {
      const s = this.tasks.get(id);
      if (s !== undefined) {
        tasks.push({ ...s.task });
      }
    }
    const nextCursor =
      startIndex + PAGE_SIZE < allTaskIds.length ? pageTaskIds[pageTaskIds.length - 1] : undefined;
    return Promise.resolve({ tasks, nextCursor });
  }

  getAllTasks(): readonly Task[] {
    return Array.from(this.tasks.values()).map((stored) => ({ ...stored.task }));
  }

  cleanup(): void {
    for (const timer of this.cleanupTimers.values()) {
      clearTimeout(timer);
    }
    this.cleanupTimers.clear();
    this.tasks.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

const logger = createLogger({ component: 'task-store' });

let singletonStore: SubstrateTaskStore | undefined;
let cleanupTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Returns the singleton SubstrateTaskStore, creating it on first call.
 */
export function getTaskStore(): SubstrateTaskStore {
  if (singletonStore === undefined) {
    singletonStore = new SubstrateTaskStore();
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
    if (!isTerminal(task.status)) {
      singletonStore
        .updateTaskStatus(task.taskId, 'cancelled', 'Evicted: capacity exceeded')
        .catch((err: unknown) => {
          logger.debug('Failed to evict task', {
            taskId: task.taskId,
            error: String(err),
          });
        });
    }
  }

  logger.info('Evicted excess tasks', { evicted: evictCount, total: sorted.length });
}

/**
 * Shuts down the task store and cleanup timer.
 * Call during server shutdown. Safe to call multiple times.
 * @internal
 */
function shutdownTaskStore(): void {
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
