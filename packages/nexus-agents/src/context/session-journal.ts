/**
 * nexus-agents/context - Session Progress Journal
 *
 * Lightweight flight recorder that appends JSONL entries for key milestones.
 * When a session dies, the next session reads the journal to understand
 * what was lost and what questions went unanswered.
 *
 * Storage: ~/.nexus-agents/sessions/journal-{sessionId}.jsonl
 * Permissions: directory 0o700, files 0o600
 *
 * (Source: Context Exhaustion Prevention - Issue #769 follow-up)
 *
 * @module context/session-journal
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { nexusDataPath } from '../config/nexus-data-dir.js';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { createLogger } from '../core/logger.js';
import { getTimeProvider } from '../core/index.js';
import type { JournalEntry, JournalEventType, JournalSummary } from './session-journal-types.js';
import { JournalEntrySchema } from './session-journal-types.js';

const logger = createLogger({ component: 'session-journal' });

/** Subdirectory name under the resolved nexus data dir for sessions. */
const SESSIONS_SUBDIR = 'sessions';

/** File permissions: user read/write only. */
const FILE_MODE = 0o600;

/** Directory permissions: user read/write/execute only. */
const DIR_MODE = 0o700;

// ============================================================================
// Path Helpers
// ============================================================================

function getSessionsDir(customDir?: string): string {
  if (customDir !== undefined) return path.resolve(customDir);
  return nexusDataPath(SESSIONS_SUBDIR);
}

function getJournalPath(sessionId: string, customDir?: string): string {
  return path.join(getSessionsDir(customDir), `journal-${sessionId}.jsonl`);
}

function validateSessionId(sessionId: string): Result<string, Error> {
  if (sessionId.includes('..') || sessionId.includes('/') || sessionId.includes('\\')) {
    return err(new Error('Invalid session ID: contains path traversal characters'));
  }
  if (sessionId.length === 0 || sessionId.length > 128) {
    return err(new Error('Invalid session ID: must be 1-128 characters'));
  }
  return ok(sessionId);
}

function ensureSessionsDir(customDir?: string): Result<string, Error> {
  const dirPath = getSessionsDir(customDir);
  try {
    fs.mkdirSync(dirPath, { recursive: true, mode: DIR_MODE });
    return ok(dirPath);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to create sessions directory at ${dirPath}: ${error.message}`));
  }
}

// ============================================================================
// Core I/O
// ============================================================================

/**
 * Append a journal entry to disk.
 */
function appendEntry(
  sessionId: string,
  entry: JournalEntry,
  customDir?: string
): Result<void, Error> {
  const dirResult = ensureSessionsDir(customDir);
  if (!dirResult.ok) return err(dirResult.error);

  const filePath = getJournalPath(sessionId, customDir);
  const line = JSON.stringify(entry) + '\n';

  try {
    fs.appendFileSync(filePath, line, { mode: FILE_MODE });
    return ok(undefined);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to write journal entry: ${error.message}`));
  }
}

/**
 * Load all journal entries for a session from disk.
 * Skips malformed lines with a warning.
 */
export function loadJournal(sessionId: string, customDir?: string): Result<JournalEntry[], Error> {
  const idResult = validateSessionId(sessionId);
  if (!idResult.ok) return idResult;

  const filePath = getJournalPath(sessionId, customDir);

  if (!fs.existsSync(filePath)) {
    return ok([]);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const entries: JournalEntry[] = [];

    for (const line of lines) {
      try {
        const parsed: unknown = JSON.parse(line);
        const validated = JournalEntrySchema.safeParse(parsed);
        if (validated.success) {
          entries.push(validated.data);
        } else {
          logger.warn('Skipping malformed journal entry', {
            sessionId,
            error: validated.error.message,
          });
        }
      } catch {
        logger.warn('Skipping unparseable journal line', { sessionId });
      }
    }

    return ok(entries);
  } catch (cause: unknown) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    return err(new Error(`Failed to load journal: ${error.message}`));
  }
}

// ============================================================================
// Summary
// ============================================================================

/**
 * Compute a summary of journal entries for recovery.
 * Identifies pending user questions and completed tasks.
 */
export function summarizeJournal(entries: readonly JournalEntry[]): JournalSummary | null {
  if (entries.length === 0) return null;

  const first = entries[0];
  if (first === undefined) return null;

  const sessionId = first.sessionId;
  const endedNormally = entries.some((e) => e.event === 'session_end');

  const pendingQuestions: string[] = [];
  for (const entry of entries) {
    if (entry.event === 'user_question') {
      pendingQuestions.push(entry.summary);
    }
  }

  const completedTasks = entries.filter((e) => e.event === 'task_complete').length;
  const totalTokensUsed = entries.reduce((sum, e) => sum + (e.tokensUsed ?? 0), 0);

  return {
    sessionId,
    totalEvents: entries.length,
    pendingQuestions,
    completedTasks,
    totalTokensUsed,
    endedNormally,
  };
}

// ============================================================================
// Factory
// ============================================================================

/** The session journal API returned by the factory. */
export interface SessionJournal {
  /** Record a journal entry. */
  readonly record: (
    event: JournalEventType,
    summary: string,
    options?: {
      taskId?: string;
      tokensUsed?: number;
      metadata?: Record<string, unknown>;
    }
  ) => Result<void, Error>;
  /** Record a user question for pending-question tracking. */
  readonly recordQuestion: (question: string) => Result<void, Error>;
  /** Record a task milestone (start or complete). */
  readonly recordTaskMilestone: (
    taskId: string,
    event: 'task_start' | 'task_complete',
    summary: string,
    tokensUsed?: number
  ) => Result<void, Error>;
  /** The session ID for this journal. */
  readonly sessionId: string;
}

/**
 * Create a session journal instance for the given session.
 *
 * @param sessionId - Unique session identifier
 * @param customDir - Optional custom sessions directory
 * @returns Result with the journal API or an error
 */
export function createSessionJournal(
  sessionId: string,
  customDir?: string
): Result<SessionJournal, Error> {
  const idResult = validateSessionId(sessionId);
  if (!idResult.ok) return idResult;

  function makeEntry(
    event: JournalEventType,
    summary: string,
    options?: { taskId?: string; tokensUsed?: number; metadata?: Record<string, unknown> }
  ): JournalEntry {
    return {
      timestamp: new Date(getTimeProvider().now()).toISOString(),
      event,
      sessionId,
      summary,
      ...(options?.taskId !== undefined && { taskId: options.taskId }),
      ...(options?.tokensUsed !== undefined && { tokensUsed: options.tokensUsed }),
      ...(options?.metadata !== undefined && { metadata: options.metadata }),
    };
  }

  const journal: SessionJournal = {
    sessionId,

    record(event, summary, options) {
      const entry = makeEntry(event, summary, options);
      return appendEntry(sessionId, entry, customDir);
    },

    recordQuestion(question) {
      const entry = makeEntry('user_question', question);
      return appendEntry(sessionId, entry, customDir);
    },

    recordTaskMilestone(taskId, event, summary, tokensUsed) {
      const opts: { taskId: string; tokensUsed?: number } = { taskId };
      if (tokensUsed !== undefined) {
        opts.tokensUsed = tokensUsed;
      }
      const entry = makeEntry(event, summary, opts);
      return appendEntry(sessionId, entry, customDir);
    },
  };

  return ok(journal);
}
