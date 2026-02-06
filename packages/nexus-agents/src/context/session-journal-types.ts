/**
 * nexus-agents/context - Session Journal Types
 *
 * Type definitions and Zod schemas for the session progress journal.
 * The journal is a lightweight flight recorder that appends JSONL entries
 * for key milestones. When a session dies, the next session reads the
 * journal to understand what was lost.
 *
 * (Source: Context Exhaustion Prevention - Issue #769 follow-up)
 *
 * @module context/session-journal-types
 */

import { z } from 'zod';

// ============================================================================
// Event Types
// ============================================================================

/** All recognized journal event types. */
export const JournalEventTypeSchema = z.enum([
  'session_start',
  'task_start',
  'task_complete',
  'user_question',
  'checkpoint',
  'context_warning',
  'session_end',
]);

/** Journal event type string union. */
export type JournalEventType = z.infer<typeof JournalEventTypeSchema>;

// ============================================================================
// Entry Schema
// ============================================================================

/**
 * Schema for a single journal entry (one JSONL line).
 */
export const JournalEntrySchema = z.object({
  timestamp: z.string().datetime(),
  event: JournalEventTypeSchema,
  sessionId: z.string().min(1),
  taskId: z.string().optional(),
  summary: z.string(),
  tokensUsed: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** A single journal entry persisted to disk. */
export type JournalEntry = z.infer<typeof JournalEntrySchema>;

// ============================================================================
// Summary
// ============================================================================

/** Summary of a session journal for recovery. */
export interface JournalSummary {
  /** Session identifier. */
  readonly sessionId: string;
  /** Total number of journal entries. */
  readonly totalEvents: number;
  /** User questions that were recorded but never followed by session_end. */
  readonly pendingQuestions: readonly string[];
  /** Number of task_complete events. */
  readonly completedTasks: number;
  /** Total tokens used across all entries that reported usage. */
  readonly totalTokensUsed: number;
  /** Whether the session ended normally (has session_end event). */
  readonly endedNormally: boolean;
}
