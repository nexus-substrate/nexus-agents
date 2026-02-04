/**
 * nexus-agents/mcp - Tool Memory Integration
 *
 * Unified memory facade for MCP tools. Composes SessionMemory (episodic),
 * BeliefMemory (structured knowledge), and optionally AgenticMemory
 * (Zettelkasten-style) and AdaptiveMemory (priority-scored) when SQLite
 * is available. Graceful degradation when optional backends are absent.
 *
 * @module mcp/tools/tool-memory
 * (Source: Issue #690, #714 - Unified memory facade Phase 1+2)
 */

import * as fs from 'node:fs';
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
import { HindsightBeliefMemory } from '../../context/belief-memory.js';
import { BeliefConfidence, BeliefSourceType } from '../../context/belief-core-types.js';
import type { Belief } from '../../context/belief-core-types.js';
import { AgenticMemoryBackend } from '../../context/agentic-memory.js';
import { AdaptiveMemoryBackend } from '../../context/adaptive-memory.js';
import type { MemoryMetadata } from '../../context/memory-backend-types.js';

// Re-export types tools may need
export type { SessionLearning, CompletedTask, ResolvedError, Belief };

// ============================================================================
// Constants
// ============================================================================

/** Default memory directory under user home. */
const MEMORY_BASE = path.join(os.homedir(), '.nexus-agents', 'memory');
const DEFAULT_MEMORY_DIR = path.join(MEMORY_BASE, 'sessions');
const AGENTIC_DB_PATH = path.join(MEMORY_BASE, 'agentic.db');
const ADAPTIVE_DB_PATH = path.join(MEMORY_BASE, 'adaptive.db');
const MARKDOWN_DIR = path.join(MEMORY_BASE, 'markdown');

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
  private readonly beliefs: HindsightBeliefMemory;
  private readonly log: ILogger;
  private pastLearnings: readonly SessionLearning[] = [];
  private agentic: AgenticMemoryBackend | null = null;
  private adaptive: AdaptiveMemoryBackend | null = null;

  constructor(logger?: ILogger) {
    this.log = logger ?? createLogger({ component: 'ToolMemory' });

    this.memory = new SessionMemory({
      memoryDir: DEFAULT_MEMORY_DIR,
      logger: this.log,
    });
    this.beliefs = new HindsightBeliefMemory(undefined, this.log);

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

    // Phase 2: activate SQLite backends (best-effort, non-blocking)
    void this.initSqliteBackends();
  }

  /** Try to activate AgenticMemory and AdaptiveMemory (requires better-sqlite3). */
  private async initSqliteBackends(): Promise<void> {
    try {
      fs.mkdirSync(MARKDOWN_DIR, { recursive: true });
      const agenticBackend = new AgenticMemoryBackend({
        dbPath: AGENTIC_DB_PATH,
        markdownDir: MARKDOWN_DIR,
      });
      const agResult = await agenticBackend.initialize();
      if (agResult.ok) {
        this.agentic = agenticBackend;
        this.log.info('AgenticMemory activated (Phase 2)');
      } else {
        this.log.info('AgenticMemory unavailable', { reason: agResult.error.message });
      }
    } catch (error: unknown) {
      this.log.debug('AgenticMemory init failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      const adaptiveBackend = new AdaptiveMemoryBackend({
        dbPath: ADAPTIVE_DB_PATH,
        markdownDir: MARKDOWN_DIR,
      });
      const adResult = await adaptiveBackend.initialize();
      if (adResult.ok) {
        this.adaptive = adaptiveBackend;
        this.log.info('AdaptiveMemory activated (Phase 2)');
      } else {
        this.log.info('AdaptiveMemory unavailable', { reason: adResult.error.message });
      }
    } catch (error: unknown) {
      this.log.debug('AdaptiveMemory init failed', {
        error: error instanceof Error ? error.message : String(error),
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
   * High-confidence learnings are also stored as beliefs for structured retrieval.
   */
  recordLearning(learning: SessionLearning): void {
    if (!this.memory.isSessionActive()) return;

    const result = this.memory.recordLearning(learning);
    if (!result.ok) {
      this.log.debug('Failed to record learning', { error: result.error.message });
    }

    // Auto-create belief for high-confidence learnings (cross-backend sync)
    if (learning.confidence >= 0.8) {
      void this.retainBeliefFromLearning(learning);
    }
  }

  /**
   * Record a structured belief (subject-predicate-object triple).
   * Safe to call at any time; failures are logged but not thrown.
   */
  async recordBelief(
    subject: string,
    predicate: string,
    object: string,
    confidence: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<void> {
    try {
      await this.beliefs.retain({
        subject,
        predicate,
        object,
        confidence,
        sourceType: BeliefSourceType.OBSERVATION,
        sourceRef: 'mcp-tool-execution',
      });
    } catch (error) {
      this.log.debug('Failed to record belief', { subject, error });
    }
  }

  /**
   * Query beliefs relevant to a subject. Returns formatted string or undefined.
   */
  async getRelevantBeliefs(subject: string, limit = 5): Promise<string | undefined> {
    try {
      const result = await this.beliefs.recallBySubject(subject, limit);
      if (!result.ok || result.value.length === 0) return undefined;
      const active = result.value.filter((b) => !b.superseded);
      if (active.length === 0) return undefined;
      return active
        .map((b) => `- [${b.confidence}] ${b.subject} ${b.predicate} ${b.object}`)
        .join('\n');
    } catch {
      return undefined;
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

  /** Whether SQLite-backed memory backends are available (Phase 2). */
  isAdvancedMemoryAvailable(): boolean {
    return this.agentic !== null || this.adaptive !== null;
  }

  /** Store knowledge with auto-extracted attributes (AgenticMemory). Best-effort. */
  async recordKnowledge(key: string, value: unknown, metadata: MemoryMetadata): Promise<void> {
    if (this.agentic === null) return;
    try {
      const result = await this.agentic.storeWithAttributes(key, value, metadata);
      if (!result.ok) {
        this.log.debug('Failed to record knowledge', { key, error: result.error.message });
      }
    } catch (error: unknown) {
      this.log.debug('Knowledge recording failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Query knowledge with attribute-based search (AgenticMemory). Best-effort. */
  async queryKnowledge(query: string, limit = 5): Promise<string | undefined> {
    if (this.agentic === null) return undefined;
    try {
      const result = await this.agentic.searchAgentic(query, limit);
      if (!result.ok || result.value.length === 0) return undefined;
      return result.value.map((e) => `- [${e.attributes.keywords.join(',')}] ${e.key}`).join('\n');
    } catch {
      return undefined;
    }
  }

  /** End the current session and persist to disk. Closes SQLite backends. */
  endSession(): void {
    if (this.memory.isSessionActive()) {
      const result = this.memory.endSession('MCP session ended');
      if (result.ok) {
        this.log.info('Tool memory session saved', {
          learnings: result.value.learnings.length,
          tasks: result.value.tasksCompleted.length,
          errors: result.value.errorsResolved.length,
        });
      }
    }
    if (this.agentic !== null) {
      this.agentic.close();
      this.agentic = null;
    }
    if (this.adaptive !== null) {
      this.adaptive.close();
      this.adaptive = null;
    }
  }

  /** Convert a high-confidence learning into a structured belief. */
  private async retainBeliefFromLearning(learning: SessionLearning): Promise<void> {
    try {
      const confidence =
        learning.confidence >= 0.9 ? BeliefConfidence.HIGH : BeliefConfidence.MEDIUM;
      await this.beliefs.retain({
        subject: learning.context,
        predicate: 'learned-pattern',
        object: learning.pattern,
        confidence,
        sourceType: BeliefSourceType.OBSERVATION,
        sourceRef: `session-learning`,
      });
    } catch {
      // Best-effort: belief creation from learning is non-critical
    }
  }
}
