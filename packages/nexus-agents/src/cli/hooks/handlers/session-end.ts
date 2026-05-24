/**
 * nexus-agents/cli/hooks/handlers - Session End Handler
 *
 * Handles SessionEnd hook events by finalizing session tracking
 * in SQLiteSessionStorage.
 *
 * @module cli/hooks/handlers/session-end
 * (Source: Issue #413 - Hook handlers for session lifecycle)
 */

import type { SessionEndInput, HookResult } from '../hook-types.js';
import { exitSuccess } from '../hook-output.js';
import { SQLiteSessionStorage } from '../../session-storage.js';
import { SessionStatus, type SessionWithTasks } from '../../session-storage-types.js';
import { createLogger, getErrorMessage } from '../../../core/index.js';
import { getDbPathFromEnv, isFeatureDisabled, HookEnvVars } from './handler-utils.js';

const logger = createLogger({ component: 'SessionEndHandler' });

/**
 * Configuration for session end handler.
 */
export interface SessionEndHandlerConfig {
  /** Path to SQLite database for session storage */
  dbPath?: string | undefined;
  /** Whether to export metrics on session end */
  exportMetrics?: boolean | undefined;
  /** Path to export metrics file */
  metricsExportPath?: string | undefined;
}

/**
 * Handles SessionEnd hook event.
 */
export function handleSessionEnd(
  input: SessionEndInput,
  config?: SessionEndHandlerConfig
): Promise<HookResult> {
  if (isFeatureDisabled(HookEnvVars.NEXUS_DISABLE_SESSIONS)) {
    return Promise.resolve(exitSuccess(`Session ${input.session_id} ended (tracking disabled)`));
  }

  return finalizeSession(input, config);
}

/** Finalizes a session in storage. */
async function finalizeSession(
  input: SessionEndInput,
  config?: SessionEndHandlerConfig
): Promise<HookResult> {
  const dbPath = config?.dbPath ?? getDbPathFromEnv();

  try {
    const storage = new SQLiteSessionStorage({ dbPath });
    const initResult = await storage.initialize();

    if (!initResult.ok) {
      logger.error('Failed to initialize session storage', initResult.error);
      return exitSuccess(`Session ${input.session_id} ended (storage unavailable)`);
    }

    await updateActiveSession(storage, input, config);
    storage.close();

    return exitSuccess(`Session ${input.session_id} ended (reason: ${input.reason})`);
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error('Session end handler error', new Error(message));
    return exitSuccess(`Session ${input.session_id} ended (error: ${message})`);
  }
}

/** Updates the most recent active session. */
async function updateActiveSession(
  storage: SQLiteSessionStorage,
  input: SessionEndInput,
  config?: SessionEndHandlerConfig
): Promise<void> {
  const sessionsResult = await storage.listSessions(10);
  if (!sessionsResult.ok) return;

  const activeSessions = sessionsResult.value.filter((s) => s.status === 'active');
  const latestSession = activeSessions[0];
  if (latestSession === undefined) return;

  const status = mapReasonToStatus(input.reason);

  await storage.updateSessionStatus(latestSession.id, status);
  logger.info('Session ended', {
    sessionId: input.session_id,
    storageId: latestSession.id,
    reason: input.reason,
    status,
  });

  if (config?.exportMetrics === true) {
    await exportSessionMetrics(storage, latestSession.id, config.metricsExportPath);
  }
}

/** Maps hook reason to session status. */
function mapReasonToStatus(reason: string): SessionStatus {
  switch (reason) {
    case 'clear':
    case 'logout':
    case 'prompt_input_exit':
      return SessionStatus.COMPLETED;
    default:
      return SessionStatus.COMPLETED;
  }
}

/** Exports session metrics to a file. */
async function exportSessionMetrics(
  storage: SQLiteSessionStorage,
  sessionId: string,
  exportPath?: string
): Promise<void> {
  try {
    const sessionResult = await storage.getSessionWithTasks(sessionId);
    if (!sessionResult.ok || sessionResult.value === null) {
      logger.warn('No session data to export', { sessionId });
      return;
    }

    const session = sessionResult.value;
    const metrics = buildMetricsObject(session, sessionId);

    if (exportPath !== undefined) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(exportPath, JSON.stringify(metrics, null, 2));
      logger.info('Metrics exported', { path: exportPath });
    } else {
      // Closes #2963 site 1: pre-fix `metrics.tasks[].task` is the raw
      // user-task prompt. A user pasting `"deploy with API_KEY=sk-…"`
      // would land their key in debug logs (many ops setups capture
      // debug in staging/dev). Redact to summary fields only.
      logger.debug('Session metrics', summarizeMetricsForDebug(metrics));
    }
  } catch (error) {
    logger.error('Failed to export metrics', new Error(getErrorMessage(error)));
  }
}

/**
 * Strips potentially sensitive fields from the metrics object for debug
 * logging (#2963 site 1). The full `metrics` is still written to the
 * operator-requested export file; this is just for the always-on log
 * stream.
 */
function summarizeMetricsForDebug(metrics: Record<string, unknown>): Record<string, unknown> {
  const tasks = Array.isArray(metrics['tasks']) ? metrics['tasks'] : [];
  return {
    sessionId: metrics['sessionId'],
    createdAt: metrics['createdAt'],
    updatedAt: metrics['updatedAt'],
    status: metrics['status'],
    taskCount: metrics['taskCount'],
    tasks: tasks.map((t: unknown) => {
      const obj = (t ?? {}) as Record<string, unknown>;
      return {
        id: obj['id'],
        status: obj['status'],
        durationMs: obj['durationMs'],
        tokensUsed: obj['tokensUsed'],
        // `task` field deliberately omitted — user prompts may contain secrets.
      };
    }),
  };
}

/** Builds the metrics export object. */
function buildMetricsObject(session: SessionWithTasks, sessionId: string): Record<string, unknown> {
  const tasks = session.tasks;
  return {
    sessionId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    status: session.status,
    taskCount: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      task: t.task,
      status: t.status,
      durationMs: t.durationMs,
      tokensUsed: t.tokensUsed,
      costUsd: t.costUsd,
    })),
    totals: {
      durationMs: tasks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0),
      tokensUsed: tasks.reduce((sum, t) => sum + (t.tokensUsed ?? 0), 0),
      costUsd: tasks.reduce((sum, t) => sum + (t.costUsd ?? 0), 0),
    },
  };
}

export default handleSessionEnd;
