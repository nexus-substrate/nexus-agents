/**
 * nexus-agents/mcp - Tool Memory Integration
 *
 * Shared session memory for MCP tools. Enables learning persistence
 * across tool calls within a session. Tools record task outcomes,
 * learnings, and error resolutions which persist to disk.
 *
 * @module mcp/tools/tool-memory
 * (Source: Issue #690 - Wire memory system into MCP tool execution pipeline)
 */

import * as os from 'node:os';
import * as path from 'node:path';
import type { ILogger } from '../../core/index.js';
import { createLogger, getTimeProvider } from '../../core/index.js';
import { SessionMemory } from '../../context/session-memory.js';
import type {
  SessionLearning,
  CompletedTask,
  ResolvedError,
} from '../../context/session-memory-types.js';

// Re-export types tools may need
export type { SessionLearning, CompletedTask, ResolvedError };

// ============================================================================
// Constants
// ============================================================================

/** Default memory directory under user home. */
const DEFAULT_MEMORY_DIR = path.join(os.homedir(), '.nexus-agents', 'memory', 'sessions');

// ============================================================================
// Shared Instance (Singleton per process)
// ============================================================================

let sharedInstance: ToolMemoryManager | null = null;

/**
 * Get or create the shared ToolMemoryManager singleton.
 * Automatically starts a session on first access.
 */
export function getToolMemory(logger?: ILogger): ToolMemoryManager {
  sharedInstance ??= new ToolMemoryManager(logger);
  return sharedInstance;
}

/**
 * Shut down the shared memory instance. Call during server cleanup.
 */
export function shutdownToolMemory(): void {
  if (sharedInstance !== null) {
    sharedInstance.endSession();
    sharedInstance = null;
  }
}

// ============================================================================
// ToolMemoryManager
// ============================================================================

/**
 * Manages session memory for MCP tool execution.
 * Auto-initializes a session and provides safe recording methods
 * that silently degrade if memory is unavailable.
 */
export class ToolMemoryManager {
  private readonly memory: SessionMemory;
  private readonly log: ILogger;
  private pastLearnings: readonly SessionLearning[] = [];

  constructor(logger?: ILogger) {
    this.log = logger ?? createLogger({ component: 'ToolMemory' });

    this.memory = new SessionMemory({
      memoryDir: DEFAULT_MEMORY_DIR,
      logger: this.log,
    });

    // Auto-start session
    const sessionId = `mcp-${String(getTimeProvider().now())}`;
    const result = this.memory.startSession(sessionId);
    if (result.ok) {
      this.pastLearnings = result.value;
      this.log.info('Tool memory session started', {
        sessionId,
        pastLearnings: this.pastLearnings.length,
      });
    } else {
      this.log.warn('Tool memory session start failed', {
        error: result.error.message,
      });
    }
  }

  /**
   * Get learnings from previous sessions.
   */
  getPastLearnings(): readonly SessionLearning[] {
    return this.pastLearnings;
  }

  /**
   * Record a completed task. Safe to call even if session inactive.
   */
  recordTask(task: CompletedTask): void {
    if (!this.memory.isSessionActive()) return;

    const result = this.memory.recordTask(task);
    if (!result.ok) {
      this.log.debug('Failed to record task', { error: result.error.message });
    }
  }

  /**
   * Record a learning. Safe to call even if session inactive.
   */
  recordLearning(learning: SessionLearning): void {
    if (!this.memory.isSessionActive()) return;

    const result = this.memory.recordLearning(learning);
    if (!result.ok) {
      this.log.debug('Failed to record learning', { error: result.error.message });
    }
  }

  /**
   * Record a resolved error. Safe to call even if session inactive.
   */
  recordError(error: ResolvedError): void {
    if (!this.memory.isSessionActive()) return;

    const result = this.memory.recordError(error);
    if (!result.ok) {
      this.log.debug('Failed to record error', { error: result.error.message });
    }
  }

  /**
   * Search past learnings for relevant patterns.
   */
  searchLearnings(query: string): readonly SessionLearning[] {
    return this.memory.searchLearnings(query);
  }

  /**
   * Get recent error solutions.
   */
  getRecentErrorSolutions(limit?: number): readonly ResolvedError[] {
    return this.memory.getRecentErrorSolutions(limit);
  }

  /**
   * Retrieve past learnings relevant to a task description.
   * Searches by keywords, falls back to highest-confidence learnings.
   * Returns formatted string or undefined if none found.
   */
  getRelevantLearnings(taskDescription: string, maxResults = 5): string | undefined {
    const past = this.pastLearnings;
    if (past.length === 0) return undefined;

    const keywords = taskDescription.split(/\s+/).slice(0, 5).join(' ');
    const searched = this.searchLearnings(keywords).slice(0, maxResults);
    const learnings =
      searched.length > 0
        ? searched
        : [...past].sort((a, b) => b.confidence - a.confidence).slice(0, 3);

    if (learnings.length === 0) return undefined;
    return learnings
      .map((l) => `- [${String(l.confidence)}] ${l.pattern} (${l.context})`)
      .join('\n');
  }

  /**
   * Retrieve past error solutions relevant to a given role or context.
   * Returns formatted string or undefined if none found.
   */
  getRelevantErrorHints(role: string, maxResults = 3): string | undefined {
    const errors = this.getRecentErrorSolutions(10);
    if (errors.length === 0) return undefined;

    const relevant = errors.filter(
      (e) => e.filePattern?.includes('execute-expert') === true || e.error.includes(role)
    );
    if (relevant.length === 0) return undefined;

    return relevant
      .slice(0, maxResults)
      .map((e) => `- Error: ${e.error.slice(0, 80)} → ${e.solution.slice(0, 80)}`)
      .join('\n');
  }

  /**
   * End the current session and persist to disk.
   */
  endSession(): void {
    if (!this.memory.isSessionActive()) return;

    const result = this.memory.endSession('MCP session ended');
    if (result.ok) {
      this.log.info('Tool memory session saved', {
        learnings: result.value.learnings.length,
        tasks: result.value.tasksCompleted.length,
        errors: result.value.errorsResolved.length,
      });
    }
  }
}
