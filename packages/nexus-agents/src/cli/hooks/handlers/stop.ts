/**
 * nexus-agents/cli/hooks/handlers - Stop Handler
 *
 * Handles Stop hook events by checking for incomplete tasks
 * and optionally generating session summaries.
 *
 * @module cli/hooks/handlers/stop
 * (Source: Issue #415 - Hook handler for stop with task checking)
 */

import type { StopInput, HookResult } from '../hook-types.js';
import { exitSuccess, blockStop } from '../hook-output.js';
import { SQLiteSessionStorage } from '../../session-storage.js';
import { TaskStatus, type StoredTask } from '../../session-storage-types.js';
import { createLogger } from '../../../core/logger.js';
import { getDbPathFromEnv, isFeatureDisabled, HookEnvVars } from './handler-utils.js';

const logger = createLogger({ component: 'StopHandler' });

/**
 * Configuration for stop handler.
 */
export interface StopHandlerConfig {
  /** Path to SQLite database for session storage */
  dbPath?: string | undefined;
  /** Check for incomplete tasks before stopping */
  checkTasks?: boolean | undefined;
  /** Generate session summary on stop */
  generateSummary?: boolean | undefined;
  /** Block stop if there are pending tasks */
  blockOnPendingTasks?: boolean | undefined;
  /** Maximum number of pending tasks to list in warning */
  maxPendingTasksToShow?: number | undefined;
}

/**
 * Handles Stop hook event.
 */
export function handleStop(input: StopInput, config?: StopHandlerConfig): Promise<HookResult> {
  // Prevent infinite loops
  if (input.stop_hook_active) {
    logger.debug('Stop hook already active, allowing stop');
    return Promise.resolve(exitSuccess());
  }

  // If no features enabled or sessions disabled, just allow stop
  if (!shouldProcessStop(config)) {
    return Promise.resolve(exitSuccess());
  }

  return processStopWithTasks(input, config);
}

/** Checks if stop processing is needed. */
function shouldProcessStop(config?: StopHandlerConfig): boolean {
  if (isFeatureDisabled(HookEnvVars.NEXUS_DISABLE_SESSIONS)) return false;
  return config?.checkTasks === true || config?.generateSummary === true;
}

/** Processes stop with task checking. */
async function processStopWithTasks(
  input: StopInput,
  config?: StopHandlerConfig
): Promise<HookResult> {
  const dbPath = config?.dbPath ?? getDbPathFromEnv();

  try {
    const storage = new SQLiteSessionStorage({ dbPath });
    const initResult = await storage.initialize();

    if (!initResult.ok) {
      logger.debug('Session storage unavailable', { error: initResult.error.message });
      return exitSuccess();
    }

    const result = await checkSessionAndTasks(storage, config);
    storage.close();

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.debug('Stop handler error', { error: message });
    return exitSuccess();
  }
}

/** Checks session and tasks, returns appropriate result. */
async function checkSessionAndTasks(
  storage: SQLiteSessionStorage,
  config?: StopHandlerConfig
): Promise<HookResult> {
  const sessionsResult = await storage.listSessions(1);
  if (!sessionsResult.ok) return exitSuccess();

  const firstSession = sessionsResult.value[0];
  if (firstSession === undefined) return exitSuccess();

  const sessionId = firstSession.id;

  // Check for incomplete tasks if enabled
  if (config?.checkTasks === true) {
    const blockResult = await checkPendingTasks(storage, sessionId, config);
    if (blockResult !== null) return blockResult;
  }

  // Generate summary if requested
  if (config?.generateSummary === true) {
    const summary = await generateSessionSummary(storage, sessionId);
    logger.info('Session summary generated', {
      sessionId: summary.sessionId,
      taskCount: summary.taskCount,
      completedCount: summary.completedCount,
      failedCount: summary.failedCount,
      pendingCount: summary.pendingCount,
    });
  }

  return exitSuccess();
}

/** Checks for pending tasks and optionally blocks. */
async function checkPendingTasks(
  storage: SQLiteSessionStorage,
  sessionId: string,
  config?: StopHandlerConfig
): Promise<HookResult | null> {
  const tasksResult = await storage.getTasks(sessionId);
  if (!tasksResult.ok) return null;

  const pendingTasks = tasksResult.value.filter(isPendingTask);
  if (pendingTasks.length === 0) return null;

  logger.info('Pending tasks at stop', { count: pendingTasks.length });

  if (config?.blockOnPendingTasks === true) {
    return createBlockResult(pendingTasks, config.maxPendingTasksToShow ?? 5);
  }

  return null;
}

/** Checks if a task is pending or running. */
function isPendingTask(task: StoredTask): boolean {
  return task.status === TaskStatus.PENDING || task.status === TaskStatus.RUNNING;
}

/** Creates a block result for pending tasks. */
function createBlockResult(pendingTasks: readonly StoredTask[], maxToShow: number): HookResult {
  const taskList = formatPendingTasks(pendingTasks, maxToShow);
  const count = String(pendingTasks.length);
  return blockStop(
    `There are ${count} incomplete task(s):\n${taskList}\n` +
      'Please complete or cancel these tasks before stopping.'
  );
}

/** Formats pending tasks for display. */
function formatPendingTasks(tasks: readonly StoredTask[], maxToShow: number): string {
  const displayed = tasks.slice(0, maxToShow);
  const lines = displayed.map((t) => `- [${t.status}] ${t.task}`);

  if (tasks.length > maxToShow) {
    lines.push(`... and ${String(tasks.length - maxToShow)} more`);
  }

  return lines.join('\n');
}

/** Generates a session summary. */
async function generateSessionSummary(
  storage: SQLiteSessionStorage,
  sessionId: string
): Promise<SessionSummaryResult> {
  const sessionResult = await storage.getSessionWithTasks(sessionId);

  if (!sessionResult.ok || sessionResult.value === null) {
    return createEmptySummary(sessionId);
  }

  return calculateSummary(sessionResult.value.tasks, sessionId);
}

/** Creates an empty summary. */
function createEmptySummary(sessionId: string): SessionSummaryResult {
  return {
    sessionId,
    taskCount: 0,
    completedCount: 0,
    failedCount: 0,
    pendingCount: 0,
    totalDurationMs: 0,
    totalTokens: 0,
    totalCostUsd: 0,
  };
}

/** Calculates summary from tasks. */
function calculateSummary(tasks: readonly StoredTask[], sessionId: string): SessionSummaryResult {
  return {
    sessionId,
    taskCount: tasks.length,
    completedCount: tasks.filter((t) => t.status === TaskStatus.COMPLETED).length,
    failedCount: tasks.filter((t) => t.status === TaskStatus.FAILED).length,
    pendingCount: tasks.filter(isPendingTask).length,
    totalDurationMs: tasks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0),
    totalTokens: tasks.reduce((sum, t) => sum + (t.tokensUsed ?? 0), 0),
    totalCostUsd: tasks.reduce((sum, t) => sum + (t.costUsd ?? 0), 0),
  };
}

/** Session summary result type. */
interface SessionSummaryResult {
  sessionId: string;
  taskCount: number;
  completedCount: number;
  failedCount: number;
  pendingCount: number;
  totalDurationMs: number;
  totalTokens: number;
  totalCostUsd: number;
}

export default handleStop;
