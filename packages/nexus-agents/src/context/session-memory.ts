/**
 * nexus-agents/context - Session Memory Manager
 *
 * Cross-session episodic memory persistence using YAML files.
 * Enables learning retention across sessions as specified in issue #130.
 *
 * @module context/session-memory
 * (Source: Issue #130, arXiv:2303.11366 - Reflexion)
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import type { ILogger } from '../core/logger.js';
import { createLogger } from '../core/logger.js';

// ============================================================================
// Types and Schemas
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
  /** Logger instance */
  readonly logger?: ILogger;
}

const DEFAULT_CONFIG = {
  maxEpisodesToLoad: 10,
  maxLearningsInContext: 20,
  minConfidenceThreshold: 0.5,
} as const;

// ============================================================================
// Session Memory Implementation
// ============================================================================

/**
 * Manages cross-session episodic memory persistence.
 * (Source: Issue #130, arXiv:2303.11366 - Reflexion)
 */
export class SessionMemory {
  private readonly memoryDir: string;
  private readonly maxEpisodesToLoad: number;
  private readonly maxLearningsInContext: number;
  private readonly minConfidenceThreshold: number;
  private readonly log: ILogger;
  private currentSession: SessionEpisode | null = null;
  private sessionStartTime: number | null = null;

  constructor(config: SessionMemoryConfig) {
    this.memoryDir = config.memoryDir;
    this.maxEpisodesToLoad = config.maxEpisodesToLoad ?? DEFAULT_CONFIG.maxEpisodesToLoad;
    this.maxLearningsInContext =
      config.maxLearningsInContext ?? DEFAULT_CONFIG.maxLearningsInContext;
    this.minConfidenceThreshold =
      config.minConfidenceThreshold ?? DEFAULT_CONFIG.minConfidenceThreshold;
    this.log = config.logger ?? createLogger({ component: 'SessionMemory' });
  }

  // --------------------------------------------------------------------------
  // Session Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start a new session and load relevant memories.
   */
  startSession(sessionId: string): Result<readonly SessionLearning[], SessionMemoryError> {
    if (this.currentSession !== null) {
      return err(
        new SessionMemoryError('Session already in progress', {
          existingSessionId: this.currentSession.sessionId,
        })
      );
    }

    this.ensureMemoryDir();
    this.sessionStartTime = Date.now();

    this.currentSession = {
      sessionId,
      date: new Date().toISOString().split('T')[0] as string,
      durationMs: 0,
      summary: '',
      learnings: [],
      tasksCompleted: [],
      errorsResolved: [],
    };

    this.log.info('Session started', { sessionId });

    // Load relevant learnings from past episodes
    const relevantLearnings = this.loadRelevantLearnings();
    return ok(relevantLearnings);
  }

  /**
   * End the current session and persist episode.
   */
  endSession(summary: string): Result<SessionEpisode, SessionMemoryError> {
    if (this.currentSession === null || this.sessionStartTime === null) {
      return err(new SessionMemoryError('No session in progress'));
    }

    const durationMs = Date.now() - this.sessionStartTime;
    const episode: SessionEpisode = {
      ...this.currentSession,
      durationMs,
      summary,
    };

    const persistResult = this.persistEpisode(episode);
    if (!persistResult.ok) return persistResult;

    this.log.info('Session ended', {
      sessionId: episode.sessionId,
      durationMs,
      learningsCount: episode.learnings.length,
      tasksCount: episode.tasksCompleted.length,
    });

    this.currentSession = null;
    this.sessionStartTime = null;

    return ok(episode);
  }

  /**
   * Check if a session is currently active.
   */
  isSessionActive(): boolean {
    return this.currentSession !== null;
  }

  /**
   * Get the current session ID.
   */
  getCurrentSessionId(): string | null {
    return this.currentSession?.sessionId ?? null;
  }

  // --------------------------------------------------------------------------
  // Recording Methods
  // --------------------------------------------------------------------------

  /**
   * Record a learning during the current session.
   */
  recordLearning(learning: SessionLearning): Result<void, SessionMemoryError> {
    if (this.currentSession === null) {
      return err(new SessionMemoryError('No session in progress'));
    }

    const validation = SessionLearningSchema.safeParse(learning);
    if (!validation.success) {
      return err(
        new SessionMemoryError('Invalid learning data', {
          errors: validation.error.issues,
        })
      );
    }

    this.currentSession = {
      ...this.currentSession,
      learnings: [...this.currentSession.learnings, learning],
    };

    this.log.debug('Learning recorded', { pattern: learning.pattern });
    return ok(undefined);
  }

  /**
   * Record a completed task during the current session.
   */
  recordTask(task: CompletedTask): Result<void, SessionMemoryError> {
    if (this.currentSession === null) {
      return err(new SessionMemoryError('No session in progress'));
    }

    const validation = CompletedTaskSchema.safeParse(task);
    if (!validation.success) {
      return err(
        new SessionMemoryError('Invalid task data', {
          errors: validation.error.issues,
        })
      );
    }

    this.currentSession = {
      ...this.currentSession,
      tasksCompleted: [...this.currentSession.tasksCompleted, task],
    };

    this.log.debug('Task recorded', { issue: task.issue });
    return ok(undefined);
  }

  /**
   * Record a resolved error during the current session.
   */
  recordError(error: ResolvedError): Result<void, SessionMemoryError> {
    if (this.currentSession === null) {
      return err(new SessionMemoryError('No session in progress'));
    }

    const validation = ResolvedErrorSchema.safeParse(error);
    if (!validation.success) {
      return err(
        new SessionMemoryError('Invalid error data', {
          errors: validation.error.issues,
        })
      );
    }

    this.currentSession = {
      ...this.currentSession,
      errorsResolved: [...this.currentSession.errorsResolved, error],
    };

    this.log.debug('Error resolution recorded', { error: error.error });
    return ok(undefined);
  }

  // --------------------------------------------------------------------------
  // Retrieval Methods
  // --------------------------------------------------------------------------

  /**
   * Load all episodes from the memory directory.
   */
  loadEpisodes(limit?: number): readonly SessionEpisode[] {
    this.ensureMemoryDir();
    const files = this.getEpisodeFiles();
    const effectiveLimit = limit ?? this.maxEpisodesToLoad;

    const episodes: SessionEpisode[] = [];
    for (const file of files.slice(0, effectiveLimit)) {
      const episode = this.loadEpisodeFile(file);
      if (episode !== null) {
        episodes.push(episode);
      }
    }

    return episodes;
  }

  /**
   * Load learnings relevant to the current context.
   */
  loadRelevantLearnings(): readonly SessionLearning[] {
    const episodes = this.loadEpisodes();
    const allLearnings: SessionLearning[] = [];

    for (const episode of episodes) {
      for (const learning of episode.learnings) {
        if (learning.confidence >= this.minConfidenceThreshold) {
          allLearnings.push(learning);
        }
      }
    }

    // Sort by confidence (highest first) and limit
    return allLearnings
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.maxLearningsInContext);
  }

  /**
   * Search for learnings matching a query.
   */
  searchLearnings(query: string): readonly SessionLearning[] {
    const episodes = this.loadEpisodes();
    const queryLower = query.toLowerCase();
    const matches: SessionLearning[] = [];

    for (const episode of episodes) {
      for (const learning of episode.learnings) {
        const text = `${learning.pattern} ${learning.context}`.toLowerCase();
        if (text.includes(queryLower)) {
          matches.push(learning);
        }
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get recent errors and their solutions.
   */
  getRecentErrorSolutions(limit = 10): readonly ResolvedError[] {
    const episodes = this.loadEpisodes();
    const errors: ResolvedError[] = [];

    for (const episode of episodes) {
      errors.push(...episode.errorsResolved);
    }

    return errors.slice(0, limit);
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private ensureMemoryDir(): void {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
      this.log.debug('Created memory directory', { path: this.memoryDir });
    }
  }

  private getEpisodeFiles(): readonly string[] {
    try {
      const files = fs
        .readdirSync(this.memoryDir)
        .filter((f) => f.startsWith('episode-') && f.endsWith('.json'))
        .sort()
        .reverse(); // Most recent first
      return files;
    } catch {
      return [];
    }
  }

  private loadEpisodeFile(filename: string): SessionEpisode | null {
    try {
      const filepath = path.join(this.memoryDir, filename);
      const content = fs.readFileSync(filepath, 'utf-8');
      const data = JSON.parse(content) as unknown;
      const validation = SessionEpisodeSchema.safeParse(data);
      if (validation.success) {
        // Cast required due to exactOptionalPropertyTypes - Zod validated the data
        return validation.data as SessionEpisode;
      }
      this.log.warn('Invalid episode file', { filename, errors: validation.error.issues });
      return null;
    } catch (error) {
      this.log.warn('Failed to load episode file', { filename, error });
      return null;
    }
  }

  private persistEpisode(episode: SessionEpisode): Result<void, SessionMemoryError> {
    try {
      this.ensureMemoryDir();
      // Use more of session ID to avoid collisions
      const sessionSuffix = episode.sessionId.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 16);
      const timestamp = Date.now().toString(36); // Base36 timestamp for uniqueness
      const filename = `episode-${episode.date}-${sessionSuffix}-${timestamp}.json`;
      const filepath = path.join(this.memoryDir, filename);
      const content = JSON.stringify(episode, null, 2);
      fs.writeFileSync(filepath, content, 'utf-8');
      this.log.debug('Episode persisted', { filename });
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err(new SessionMemoryError(`Failed to persist episode: ${message}`));
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a SessionMemory instance with default configuration.
 */
export function createSessionMemory(
  memoryDir: string,
  config?: Partial<Omit<SessionMemoryConfig, 'memoryDir'>>
): SessionMemory {
  return new SessionMemory({
    memoryDir,
    ...config,
  });
}
