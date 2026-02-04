/**
 * Session Memory Types and Schemas
 *
 * Type definitions for cross-session episodic memory persistence.
 *
 * @module context/session-memory-types
 * (Source: Issue #130, arXiv:2303.11366 - Reflexion)
 */

import { z } from 'zod';
import type { ILogger } from '../core/logger.js';

// ============================================================================
// Session Learning
// ============================================================================

/**
 * A learning captured during a session.
 */
export interface SessionLearning {
  /** The pattern or technique learned */
  readonly pattern: string;
  /** Context where this learning applies */
  readonly context: string;
  /** Confidence in this learning (0-1) */
  readonly confidence: number;
  /** Optional source (e.g., task, error, user feedback) */
  readonly source?: string;
}

export const SessionLearningSchema = z.object({
  pattern: z.string().min(1),
  context: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: z.string().optional(),
});

// ============================================================================
// Completed Task
// ============================================================================

/**
 * A task completed during a session.
 */
export interface CompletedTask {
  /** Issue or task identifier */
  readonly issue?: string | number;
  /** Approach used to complete the task */
  readonly approach: string;
  /** Challenges encountered */
  readonly challenges: readonly string[];
  /** Duration in milliseconds */
  readonly durationMs?: number;
}

export const CompletedTaskSchema = z.object({
  issue: z.union([z.string(), z.number()]).optional(),
  approach: z.string().min(1),
  challenges: z.array(z.string()),
  durationMs: z.number().positive().optional(),
});

// ============================================================================
// Resolved Error
// ============================================================================

/**
 * An error resolved during a session.
 */
export interface ResolvedError {
  /** Error message or type */
  readonly error: string;
  /** Solution applied */
  readonly solution: string;
  /** File pattern where this applies */
  readonly filePattern?: string;
}

export const ResolvedErrorSchema = z.object({
  error: z.string().min(1),
  solution: z.string().min(1),
  filePattern: z.string().optional(),
});

// ============================================================================
// Session Episode
// ============================================================================

/**
 * Complete session episode data.
 */
export interface SessionEpisode {
  /** Unique session identifier */
  readonly sessionId: string;
  /** Session date (ISO format) */
  readonly date: string;
  /** Session duration in milliseconds */
  readonly durationMs: number;
  /** Brief summary of the session */
  readonly summary: string;
  /** Learnings captured */
  readonly learnings: readonly SessionLearning[];
  /** Tasks completed */
  readonly tasksCompleted: readonly CompletedTask[];
  /** Errors resolved */
  readonly errorsResolved: readonly ResolvedError[];
}

export const SessionEpisodeSchema = z.object({
  sessionId: z.string().min(1),
  date: z.string().min(1),
  durationMs: z.number().min(0),
  summary: z.string(),
  learnings: z.array(SessionLearningSchema),
  tasksCompleted: z.array(CompletedTaskSchema),
  errorsResolved: z.array(ResolvedErrorSchema),
});

// ============================================================================
// Error Class
// ============================================================================

/**
 * Error for session memory operations.
 */
export class SessionMemoryError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SessionMemoryError';
  }
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for SessionMemory.
 */
export interface SessionMemoryConfig {
  /** Base directory for memory storage */
  readonly memoryDir: string;
  /** Maximum episodes to load on session start */
  readonly maxEpisodesToLoad?: number;
  /** Maximum learnings to include in context */
  readonly maxLearningsInContext?: number;
  /** Minimum confidence threshold for learnings */
  readonly minConfidenceThreshold?: number;
  /** Maximum learnings per session (FIFO eviction). */
  readonly maxLearningsPerSession?: number;
  /** Maximum tasks per session (FIFO eviction). */
  readonly maxTasksPerSession?: number;
  /** Maximum errors per session (FIFO eviction). */
  readonly maxErrorsPerSession?: number;
  /** Maximum episode files to retain on disk. Oldest are deleted. */
  readonly maxEpisodeFiles?: number;
  /** Logger instance */
  readonly logger?: ILogger;
}

export const DEFAULT_SESSION_MEMORY_CONFIG = {
  maxEpisodesToLoad: 10,
  maxLearningsInContext: 20,
  minConfidenceThreshold: 0.5,
  maxLearningsPerSession: 500,
  maxTasksPerSession: 200,
  maxErrorsPerSession: 200,
  maxEpisodeFiles: 50,
} as const;
