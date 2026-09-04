/* eslint-disable max-lines -- Cohesive memory facade composing 6 backends (governance: 400-600 lines OK if cohesive) */
/**
 * nexus-agents/mcp - Tool Memory Integration
 *
 * Unified memory facade for MCP tools. Composes SessionMemory (episodic),
 * BeliefMemory (structured knowledge), and optionally AgenticMemory
 * (Zettelkasten-style), AdaptiveMemory (priority-scored), TypedMemory
 * (MIRIX-style typed access), and MobiMem (post-deployment learning)
 * when SQLite is available. Graceful degradation when backends are absent.
 *
 * @module mcp/tools/tool-memory
 * (Source: Issue #690, #714, #746 - Unified memory facade)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { nexusDataPath } from '../../config/nexus-data-dir.js';
import type { ILogger } from '../../core/index.js';
import { getErrorMessage, createLogger, getTimeProvider } from '../../core/index.js';

import { SessionMemory } from '../../context/session-memory.js';
import type {
  SessionLearning,
  CompletedTask,
  ResolvedError,
} from '../../context/session-memory-types.js';
import { HindsightBeliefMemory } from '../../context/belief-memory.js';
import { BeliefConfidence, BeliefSourceType } from '../../context/belief-core-types.js';
import type { Belief } from '../../context/belief-core-types.js';
import { runBeliefCleanup } from '../../context/belief-cleanup.js';
import { AgenticMemoryBackend } from '../../context/agentic-memory.js';
import { AdaptiveMemoryBackend } from '../../context/adaptive-memory.js';
import type { MemoryMetadata, MemoryImportance } from '../../context/memory-backend-types.js';
import { saveBeliefSnapshot, loadBeliefSnapshot } from '../../context/belief-memory-persistence.js';
import { HybridMemoryBackend } from '../../context/memory-backend.js';
import { createTypedMemory } from '../../context/typed-memory.js';
import type {
  ITypedMemory,
  TypedMemoryEntry,
  TypedMemoryStats,
  TypedMemoryPruneResult,
  MemoryType,
} from '../../context/memory-types.js';
import type { AgentRole } from '../../core/types/agent.js';
import { getMemoryRegistry } from 'nexus-memory';
import {
  MobiMem,
  getSharedMobiMem,
  setSharedMobiMemDbPathResolver,
} from '../../context/mobimem.js';
import { StatsOnlyAdapter, ensureSharedMemoryRegistry } from './tool-memory-registry-adapters.js';
import type { MobiMemStats } from '../../context/mobimem-types.js';
import {
  MemoryPromoter,
  type PromotionStats,
  type MemoryPromotionConfig,
} from './memory-promotion.js';
import {
  MemoryDecayManager,
  type DecayRunStats,
  type DecayAggregateStats,
} from './memory-decay.js';
import type { UnifiedMemoryResult } from './tool-memory-types.js';
import {
  querySessionMemory as querySessionMemoryHelper,
  queryBeliefMemory as queryBeliefMemoryHelper,
  queryAgenticMemory as queryAgenticMemoryHelper,
  queryTypedMemory as queryTypedMemoryHelper,
  queryAdaptiveMemory as queryAdaptiveMemoryHelper,
} from './tool-memory-query.js';

// Re-export types tools may need
export type { SessionLearning, CompletedTask, ResolvedError, Belief };

// UnifiedMemoryResult extracted to tool-memory-types.ts to avoid circular imports (#1671)
export type { UnifiedMemoryResult } from './tool-memory-types.js';
export type {
  TypedMemoryEntry,
  TypedMemoryStats,
  TypedMemoryPruneResult,
  MemoryType,
} from '../../context/memory-types.js';
export type { AgentRole } from '../../core/types/agent.js';
export type { MobiMemStats } from '../../context/mobimem-types.js';
export type { PromotionStats, MemoryPromotionConfig } from './memory-promotion.js';

/**
 * Status of memory backend availability (#754).
 */
export interface MemoryBackendStatus {
  session: boolean;
  belief: boolean;
  agentic: boolean;
  adaptive: boolean;
  typed: boolean;
  mobimem: boolean;
  decay: boolean;
}
export type { DecayRunStats, DecayAggregateStats } from './memory-decay.js';

// ============================================================================
// Constants
// ============================================================================

/** Default memory directory under the resolved nexus data dir (#2302). */
const MEMORY_BASE = nexusDataPath('memory');
const DEFAULT_MEMORY_DIR = path.join(MEMORY_BASE, 'sessions');
const AGENTIC_DB_PATH = path.join(MEMORY_BASE, 'agentic.db');
const ADAPTIVE_DB_PATH = path.join(MEMORY_BASE, 'adaptive.db');
const TYPED_DB_PATH = path.join(MEMORY_BASE, 'typed.db');
const MOBIMEM_DB_PATH = path.join(MEMORY_BASE, 'mobimem.db');
const MARKDOWN_DIR = path.join(MEMORY_BASE, 'markdown');

// ============================================================================
// Shared Instance (Singleton per process)
// ============================================================================

let sharedInstance: ToolMemoryManager | null = null;

/**
 * Phase 5 of #2766. Attach a tool-memory backend to the unified registry
 * so `memory_stats` and future telemetry consumers can discover it
 * without the per-backend type-knowledge that `tool-memory.ts` carries
 * today. Safe to call multiple times — the registry rejects duplicate
 * domains, and that's silently caught so re-init doesn't break.
 */
function attachToRegistry(
  domain: string,
  backend: {
    count(): unknown;
    search?(query: string, limit: number): Promise<readonly unknown[]>;
  }
): void {
  try {
    // #3995: inject the canonical nexusDataPath-resolved DB path before the
    // first registry touch, so production uses the resolver instead of
    // nexus-memory's dep-free fallback. No-op once a registry exists.
    ensureSharedMemoryRegistry();
    getMemoryRegistry().attach(domain, new StatsOnlyAdapter(domain, backend));
  } catch {
    // Domain already registered — re-init of tool-memory should be a no-op.
  }
}

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
 *
 * #5402: this dropped the reference and ended the session but left the
 * auto-decay interval running, so the manager it closes over stayed resident and
 * the event loop stayed held. A `shutdown` that leaves its subsystem running is
 * a false statement in the code — the next reader has to run it to find out.
 */
export function shutdownToolMemory(): void {
  if (sharedInstance !== null) {
    sharedInstance.shutdownDecay();
    sharedInstance.endSession();
    sharedInstance = null;
  }
}

/**
 * Reinitialize SQLite-based memory backends that failed during startup.
 * Useful after upgrading Node to enable full memory functionality.
 * @returns Status of each backend after reinitialization
 */
export async function reinitializeMemoryBackends(): Promise<MemoryBackendStatus> {
  return getToolMemory().reinitializeSqliteBackends();
}

// ============================================================================
// ToolMemoryManager
// ============================================================================

/**
 * Whether a best-effort store actually persisted (#4997).
 *
 * These helpers used to return `void` and log a failed `Result` at `debug`, so
 * `memory_write` had nothing to inspect and reported `success: true` for a
 * write the backend had rejected. A caller that cannot see the failure cannot
 * report it, and a tool that always says `success` is not reporting anything.
 */
export type MemoryStoreOutcome =
  { readonly persisted: true } | { readonly persisted: false; readonly reason: string };

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
  private typed: ITypedMemory | null = null;
  private typedBackend: HybridMemoryBackend | null = null;
  private mobimem: MobiMem | null = null;
  private decayManager: MemoryDecayManager | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(logger?: ILogger) {
    this.log = logger ?? createLogger({ component: 'ToolMemory' });

    this.memory = new SessionMemory({
      memoryDir: DEFAULT_MEMORY_DIR,
      logger: this.log,
    });
    this.beliefs = new HindsightBeliefMemory(undefined, this.log);
    this.loadBeliefSnapshotFromDisk();
    const beliefs = this.beliefs;
    attachToRegistry('belief', {
      count: async () => {
        // #4827: propagate failure rather than collapsing it to 0.
        const stats = await beliefs.getStats();
        if (!stats.ok) throw new Error(`belief getStats failed: ${String(stats.error)}`);
        return stats.value.totalBeliefs;
      },
      // Phase 1 of #2792 — text search delegates to recallBySubject.
      search: async (query, limit) => {
        const res = await beliefs.recallBySubject(query, limit);
        return res.ok ? res.value : [];
      },
    });
    // Phase 9 of #2766: drop belief rows polluted by the pre-#2755
    // arXiv feed-fallback bug. Marker-file gated so subsequent runs
    // no-op. Best-effort — never block startup on cleanup errors.
    void this.runBeliefCleanupOnce(beliefs);

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
    this.initPromise = this.initSqliteBackends();
  }

  /** Try to activate SQLite backends (best-effort, non-blocking). */
  private async initSqliteBackends(): Promise<void> {
    fs.mkdirSync(MARKDOWN_DIR, { recursive: true });
    await this.initAgenticMemory();
    await this.initAdaptiveMemory();
    await this.initTypedMemory();
    this.initMobiMem();
    this.initDecayManager();
  }

  /**
   * Phase 9 of #2766: idempotent one-shot cleanup of belief rows polluted
   * by the pre-#2755 arXiv feed-fallback bug. Marker-file gated. Best-effort
   * — failures don't block startup.
   */
  private async runBeliefCleanupOnce(beliefs: HindsightBeliefMemory): Promise<void> {
    try {
      const result = await runBeliefCleanup({
        loadBeliefs: async () => {
          const q = await beliefs.query({ includeSuperseded: true });
          return q.ok ? q.value : [];
        },
        deleteBelief: async (id: string) => {
          await beliefs.forget(id);
        },
      });
      if (!result.skipped && result.removed > 0) {
        this.log.info('Belief cleanup removed polluted rows', {
          scanned: result.scanned,
          removed: result.removed,
          samples: result.samples,
        });
      }
    } catch (error: unknown) {
      this.log.debug('Belief cleanup failed', { error: getErrorMessage(error) });
    }
  }

  /** Initialize AgenticMemory (Phase 2). */
  private async initAgenticMemory(): Promise<void> {
    try {
      const backend = new AgenticMemoryBackend({
        dbPath: AGENTIC_DB_PATH,
        markdownDir: MARKDOWN_DIR,
      });
      const result = await backend.initialize();
      if (result.ok) {
        this.agentic = backend;
        attachToRegistry('agentic', {
          count: async () => {
            // #4827: hand the Result through unchanged. `extractCount` turns a
            // failure into a throw so `memory_stats` can report it; collapsing
            // to 0 here made a broken backend look like an empty one.
            return backend.count();
          },
          // Phase 1 of #2792 — A-MEM text search returns attribute-rich entries.
          search: async (query, limit) => {
            const res = await backend.searchAgentic(query, limit);
            return res.ok ? res.value : [];
          },
        });
        this.log.info('AgenticMemory activated (Phase 2)');
      } else {
        this.log.info('AgenticMemory unavailable', { reason: result.error.message });
      }
    } catch (error: unknown) {
      this.log.debug('AgenticMemory init failed', {
        error: getErrorMessage(error),
      });
    }
  }

  /** Initialize AdaptiveMemory (Phase 2). */
  private async initAdaptiveMemory(): Promise<void> {
    try {
      const backend = new AdaptiveMemoryBackend({
        dbPath: ADAPTIVE_DB_PATH,
        markdownDir: MARKDOWN_DIR,
      });
      const result = await backend.initialize();
      if (result.ok) {
        this.adaptive = backend;
        attachToRegistry('adaptive', {
          count: async () => {
            // #4827: hand the Result through unchanged. `extractCount` turns a
            // failure into a throw so `memory_stats` can report it; collapsing
            // to 0 here made a broken backend look like an empty one.
            return backend.count();
          },
          // Phase 1 of #2792 — adaptive memory returns priority-scored entries.
          search: async (query, limit) => {
            const res = await backend.retrieveByPriority({ query, limit });
            return res.ok ? res.value : [];
          },
        });
        this.log.info('AdaptiveMemory activated (Phase 2)');
      } else {
        this.log.info('AdaptiveMemory unavailable', { reason: result.error.message });
      }
    } catch (error: unknown) {
      this.log.debug('AdaptiveMemory init failed', {
        error: getErrorMessage(error),
      });
    }
  }

  /** Initialize TypedMemory (Phase 1 #746 - MIRIX-style typed access). */
  private async initTypedMemory(): Promise<void> {
    try {
      const backend = new HybridMemoryBackend({
        dbPath: TYPED_DB_PATH,
        markdownDir: MARKDOWN_DIR,
        logger: this.log,
      });
      const result = await backend.initialize();
      if (result.ok) {
        this.typedBackend = backend;
        this.typed = createTypedMemory(backend);
        attachToRegistry('typed', {
          count: async () => {
            // #4827: hand the Result through unchanged. `extractCount` turns a
            // failure into a throw so `memory_stats` can report it; collapsing
            // to 0 here made a broken backend look like an empty one.
            return backend.count();
          },
          // Phase 1 of #2792 — typed search uses the underlying hybrid backend.
          search: async (query, limit) => {
            const res = await backend.search(query, limit);
            return res.ok ? res.value : [];
          },
        });
        this.log.info('TypedMemory activated (Phase 1 #746)');
      } else {
        this.log.info('TypedMemory unavailable', { reason: result.error.message });
      }
    } catch (error: unknown) {
      this.log.debug('TypedMemory init failed', {
        error: getErrorMessage(error),
      });
    }
  }

  /** Initialize MobiMem (Phase 2 #746 - post-deployment learning).
   *  #2719: routes through the process-wide singleton so this tool-memory
   *  instance, RoutingMemory, and any other caller share state. The
   *  shared singleton uses the same MOBIMEM_DB_PATH this tool used to
   *  pass directly. */
  private initMobiMem(): void {
    try {
      setSharedMobiMemDbPathResolver(() => MOBIMEM_DB_PATH);
      this.mobimem = getSharedMobiMem();
      const mobimem = this.mobimem;
      attachToRegistry('mobimem', {
        count: () => mobimem.profile.getEntryCount(),
        // Phase 1 of #2792 — MobiMem exposes patterns by task type. Text
        // query is interpreted as the task type (best-effort; consumers
        // can pre-normalize).
        search: (query, limit) => Promise.resolve(mobimem.experience.findPatterns(query, limit)),
      });
      this.log.info('MobiMem activated (Phase 2 #746)');
    } catch (error: unknown) {
      this.log.debug('MobiMem init failed', {
        error: getErrorMessage(error),
      });
    }
  }

  /** Initialize coordinated decay manager (Phase 5 #746). */
  /**
   * Stop the auto-decay interval this instance started (#5402).
   *
   * Separate from `endSession`, which ends the RECORDED session; this releases
   * the background timer. Idempotent — safe when decay never started.
   */
  shutdownDecay(): void {
    this.decayManager?.stopAutoDecay();
  }

  private initDecayManager(): void {
    try {
      this.decayManager = new MemoryDecayManager({}, this.log);
      this.decayManager.initialize({
        beliefs: this.beliefs,
        agentic: this.agentic,
        adaptive: this.adaptive,
        mobimem: this.mobimem,
      });
      // Start auto-decay for long-running sessions
      this.decayManager.startAutoDecay();
      // Run decay once at startup — the setInterval timer may never fire
      // in short-lived MCP sessions, so this ensures at least one run (#1673).
      void this.decayManager.runDecay().catch((error: unknown) => {
        this.log.debug('Startup decay run failed', {
          error: getErrorMessage(error),
        });
      });
      this.log.info('MemoryDecayManager activated (Phase 5 #746)');
    } catch (error: unknown) {
      this.log.debug('MemoryDecayManager init failed', {
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Re-initialize SQLite backends that failed during startup.
   * Skips already-initialized backends. Useful after upgrading Node.
   * @returns Status of each backend after reinitialization attempt
   */
  async reinitializeSqliteBackends(): Promise<MemoryBackendStatus> {
    this.log.info('Reinitializing SQLite backends');
    await this.awaitBackendInitialization();
    if (this.agentic === null) await this.initAgenticMemory();
    if (this.adaptive === null) await this.initAdaptiveMemory();
    if (this.typed === null) await this.initTypedMemory();
    if (this.mobimem === null) this.initMobiMem();
    if (this.decayManager === null) this.initDecayManager();
    return this.getBackendStatus();
  }

  /**
   * Wait for the non-blocking startup initialization to finish (#794, #5438).
   *
   * `initSqliteBackends()` is fired and not awaited at session start, so for a
   * short window after startup every `is*Available()` returns `false` for a
   * backend that is merely still opening. A reader cannot tell that apart from
   * a backend that failed or one that is genuinely absent — reproduced live as
   * two identical `memory_stats` calls 55 seconds apart returning five `false`
   * and then five `true`, with the agentic backend holding 519 entries all
   * along.
   *
   * `reinitializeSqliteBackends` has awaited this since #794. Any path that
   * READS backend availability has to as well, or the boolean reports a state
   * it has not yet measured.
   */
  async awaitBackendInitialization(): Promise<void> {
    if (this.initPromise !== null) {
      await this.initPromise;
      this.initPromise = null;
    }
  }

  /** Get current backend availability status. */
  getBackendStatus(): MemoryBackendStatus {
    return {
      session: true,
      belief: true,
      agentic: this.agentic !== null,
      adaptive: this.adaptive !== null,
      typed: this.typed !== null,
      mobimem: this.mobimem !== null,
      decay: this.decayManager !== null,
    };
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
  ): Promise<MemoryStoreOutcome> {
    try {
      const result = await this.beliefs.retain({
        subject,
        predicate,
        object,
        confidence,
        sourceType: BeliefSourceType.OBSERVATION,
        sourceRef: 'mcp-tool-execution',
      });
      // `retain` converts its own throws into `err`, so the catch below is
      // nearly unreachable and this branch is where a real failure shows up.
      // It was discarded entirely before #4997.
      if (!result.ok) {
        this.log.debug('Failed to record belief', { subject, error: result.error.message });
        return { persisted: false, reason: result.error.message };
      }
      return { persisted: true };
    } catch (error) {
      const reason = getErrorMessage(error);
      this.log.debug('Failed to record belief', { subject, error: reason });
      return { persisted: false, reason };
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
    } catch (e: unknown) {
      this.log.debug('Belief recall failed', { error: String(e) });
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
   * Live session counts for `memory_stats` (#5269).
   *
   * These were reported as a hardcoded `0` beside `session: true`, so a caller
   * read "session memory is healthy and holds 0 tasks, 0 errors" — the backend
   * assertion corroborating the fabricated zeros. The episode has held both all
   * along; nothing exposed them before `endSession`.
   */
  getSessionCounts(): { tasksCount: number; errorsCount: number } {
    return {
      tasksCount: this.memory.getCurrentSessionTasks().length,
      errorsCount: this.memory.getCurrentSessionErrors().length,
    };
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

  /** Whether AgenticMemory backend is available. */
  isAgenticMemoryAvailable(): boolean {
    return this.agentic !== null;
  }

  /** Whether AdaptiveMemory backend is available. */
  isAdaptiveMemoryAvailable(): boolean {
    return this.adaptive !== null;
  }

  /** Store knowledge with auto-extracted attributes (AgenticMemory). */
  async recordKnowledge(
    key: string,
    value: unknown,
    metadata: MemoryMetadata
  ): Promise<MemoryStoreOutcome> {
    if (this.agentic === null) return { persisted: false, reason: 'agentic backend unavailable' };
    try {
      const result = await this.agentic.storeWithAttributes(key, value, metadata);
      if (!result.ok) {
        this.log.debug('Failed to record knowledge', { key, error: result.error.message });
        return { persisted: false, reason: result.error.message };
      }
      return { persisted: true };
    } catch (error: unknown) {
      const reason = getErrorMessage(error);
      this.log.debug('Knowledge recording failed', { key, error: reason });
      return { persisted: false, reason };
    }
  }

  /** Store a value in AdaptiveMemory with importance scoring. */
  async storeAdaptive(
    key: string,
    value: unknown,
    importance: number
  ): Promise<MemoryStoreOutcome> {
    if (this.adaptive === null) return { persisted: false, reason: 'adaptive backend unavailable' };
    try {
      const level = importance >= 0.8 ? 'high' : importance >= 0.6 ? 'medium' : 'low';
      const result = await this.adaptive.store(key, value, {
        importance: level,
        tags: ['memory_write_tool'],
      });
      if (!result.ok) {
        this.log.debug('Failed to store adaptive memory', { key, error: result.error.message });
        return { persisted: false, reason: result.error.message };
      }
      return { persisted: true };
    } catch (error: unknown) {
      const reason = getErrorMessage(error);
      this.log.debug('Adaptive memory store failed', { key, error: reason });
      return { persisted: false, reason };
    }
  }

  /** Store a value in TypedMemory (via HybridMemoryBackend). */
  async storeTyped(
    key: string,
    value: unknown,
    importance: MemoryImportance
  ): Promise<MemoryStoreOutcome> {
    if (this.typedBackend === null)
      return { persisted: false, reason: 'typed backend unavailable' };
    try {
      const result = await this.typedBackend.store(`semantic ${key}`, value, {
        importance,
        tags: ['memory_write_tool', 'semantic'],
      });
      if (!result.ok) {
        this.log.debug('Failed to store typed memory', { key, error: result.error.message });
        return { persisted: false, reason: result.error.message };
      }
      return { persisted: true };
    } catch (error: unknown) {
      const reason = getErrorMessage(error);
      this.log.debug('Typed memory store failed', { key, error: reason });
      return { persisted: false, reason };
    }
  }

  /** Query knowledge with attribute-based search (AgenticMemory). Best-effort. */
  async queryKnowledge(query: string, limit = 5): Promise<string | undefined> {
    if (this.agentic === null) return undefined;
    try {
      const result = await this.agentic.searchAgentic(query, limit);
      if (!result.ok || result.value.length === 0) return undefined;
      return result.value.map((e) => `- [${e.attributes.keywords.join(',')}] ${e.key}`).join('\n');
    } catch (e: unknown) {
      this.log.debug('Agentic knowledge query failed', { error: String(e) });
      return undefined;
    }
  }

  // ==========================================================================
  // TypedMemory (Phase 1 #746 - MIRIX-style typed memory access)
  // ==========================================================================

  /** Whether TypedMemory is available (requires SQLite). */
  isTypedMemoryAvailable(): boolean {
    return this.typed !== null;
  }

  /**
   * Query memories by type (core, episodic, semantic, procedural, resource, vault, belief).
   * Returns formatted results or undefined if TypedMemory unavailable.
   */
  async queryByMemoryType(
    type: MemoryType,
    query: string,
    limit = 10
  ): Promise<readonly TypedMemoryEntry[] | undefined> {
    if (this.typed === null) return undefined;
    try {
      const result = await this.typed.queryByType(type, query, limit);
      if (!result.ok) {
        this.log.debug('TypedMemory query failed', { type, error: result.error.message });
        return undefined;
      }
      return result.value;
    } catch (e: unknown) {
      this.log.debug('TypedMemory queryByType failed', { type, error: String(e) });
      return undefined;
    }
  }

  /**
   * Filter memories by relevance to an agent role.
   * Uses MIRIX role-memory type mappings (e.g., tech_lead gets core, episodic, vault, belief).
   * Returns filtered entries or undefined if TypedMemory unavailable.
   */
  async filterMemoriesForRole(
    role: AgentRole,
    limit = 50
  ): Promise<readonly TypedMemoryEntry[] | undefined> {
    if (this.typed === null) return undefined;
    try {
      const result = await this.typed.filterByRelevance(role, limit);
      if (!result.ok) {
        this.log.debug('TypedMemory filter failed', { role, error: result.error.message });
        return undefined;
      }
      return result.value;
    } catch (e: unknown) {
      this.log.debug('TypedMemory filterByRelevance failed', { role, error: String(e) });
      return undefined;
    }
  }

  /**
   * Get statistics across all typed memory categories.
   * Returns stats object with counts per type or undefined if unavailable.
   */
  async getTypedMemoryStats(): Promise<TypedMemoryStats | undefined> {
    if (this.typed === null) return undefined;
    try {
      const result = await this.typed.getStats();
      if (!result.ok) return undefined;
      return result.value;
    } catch (e: unknown) {
      this.log.debug('TypedMemory getStats failed', { error: String(e) });
      return undefined;
    }
  }

  /**
   * Prune expired entries from TypedMemory.
   * Returns prune result with counts per type or undefined if unavailable.
   */
  async pruneTypedMemory(): Promise<TypedMemoryPruneResult | undefined> {
    if (this.typed === null) return undefined;
    try {
      const result = await this.typed.pruneExpired();
      if (!result.ok) return undefined;
      return result.value;
    } catch (e: unknown) {
      this.log.debug('TypedMemory pruneExpired failed', { error: String(e) });
      return undefined;
    }
  }

  // ==========================================================================
  // MobiMem (Phase 2 #746 - Post-deployment learning)
  // ==========================================================================

  /** Whether MobiMem is available for post-deployment learning. */
  isMobiMemAvailable(): boolean {
    return this.mobimem !== null;
  }

  /**
   * Get the MobiMem instance for direct access to profile, experience, and action cache.
   * Returns null if MobiMem is unavailable.
   */
  getMobiMem(): MobiMem | null {
    return this.mobimem;
  }

  /**
   * Get MobiMem statistics across all three modules.
   * Returns stats object or undefined if unavailable.
   */
  getMobiMemStats(): MobiMemStats | undefined {
    if (this.mobimem === null) return undefined;
    return this.mobimem.getStats();
  }

  /** Returns the count of beliefs in the belief memory backend. */
  getBeliefCount(): number {
    const data = this.beliefs.exportData();
    return data.beliefs.size;
  }

  /**
   * Get the shared {@link HindsightBeliefMemory} singleton.
   *
   * Public accessor used by {@link getContextForTask} (Phase 2 of #2792)
   * so cross-cutting consumers can perform typed reads without
   * reconstructing a backend or routing through MCP tools.
   */
  getBeliefMemory(): HindsightBeliefMemory {
    return this.beliefs;
  }

  /**
   * Get the shared {@link AgenticMemoryBackend} singleton, or `null` if
   * SQLite init failed and the backend is unavailable. Public accessor
   * used by {@link getContextForTask} (Phase 2 of #2792).
   */
  getAgenticMemoryBackend(): AgenticMemoryBackend | null {
    return this.agentic;
  }

  /**
   * Get the shared {@link AdaptiveMemoryBackend} singleton, or `null` if
   * SQLite init failed and the backend is unavailable. Public accessor
   * used by {@link getContextForTask} (Phase 2 of #2792).
   */
  getAdaptiveMemoryBackend(): AdaptiveMemoryBackend | null {
    return this.adaptive;
  }

  /**
   * Run MobiMem maintenance (eviction and cleanup).
   * Safe to call even if MobiMem is unavailable.
   */
  runMobiMemMaintenance(): void {
    if (this.mobimem === null) return;
    this.mobimem.runMaintenance();
  }

  // ==========================================================================
  // Cross-Memory Query (Phase 3 #746 - Unified search across all backends)
  // ==========================================================================

  /**
   * Unified search across all active memory systems.
   * Returns results from SessionMemory, BeliefMemory, AgenticMemory, and TypedMemory
   * with source attribution and relevance scoring.
   */
  async queryAll(
    query: string,
    limit = 10,
    errored?: (source: string) => void
  ): Promise<readonly UnifiedMemoryResult[]> {
    // Wait for SQLite backends to finish initializing before querying (#794 pattern)
    if (this.initPromise !== null) {
      await this.initPromise;
      this.initPromise = null;
    }
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2);
    const sourceCount = 4 + (this.adaptive !== null ? 1 : 0);
    const perSource = Math.ceil(limit / sourceCount);
    const results = [
      ...this.querySessionMemory(query, keywords, perSource),
      ...(await this.queryBeliefMemory(query, keywords, perSource, () => errored?.('belief'))),
      ...(await this.queryAgenticMemory(query, keywords, perSource, () => errored?.('agentic'))),
      ...(await this.queryTypedMemory(query, keywords, Math.ceil(perSource / 2), () =>
        errored?.('typed')
      )),
      ...(await this.queryAdaptiveMemory(query, keywords, perSource, () => errored?.('adaptive'))),
    ];
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  /**
   * `queryBySource`, plus the names of the backends that threw while answering (#4999).
   *
   * Each per-backend helper swallows its error and contributes `[]`, so a store
   * that failed is invisible in the merged result set — indistinguishable from
   * one that simply matched nothing. Callers that report coverage need the
   * difference, and only this variant can tell them. Single-source queries get
   * the same treatment as `'all'` — a corrupt store must not read as an empty
   * one whichever way it was asked.
   */
  async queryWithStatus(
    source: 'session' | 'belief' | 'agentic' | 'typed' | 'adaptive' | 'all',
    query: string,
    limit = 10
  ): Promise<{ results: readonly UnifiedMemoryResult[]; errored: readonly string[] }> {
    const failures = new Set<string>();
    const results = await this.queryBySource(source, query, limit, (name) => failures.add(name));
    return { results, errored: [...failures] };
  }

  /**
   * Query a specific memory backend directly, bypassing cross-backend limit dilution.
   * When source is 'all', delegates to queryAll(). Otherwise dispatches to the
   * single-backend method so the full limit is applied to that backend only.
   */
  async queryBySource(
    source: 'session' | 'belief' | 'agentic' | 'typed' | 'adaptive' | 'all',
    query: string,
    limit = 10,
    errored?: (source: string) => void
  ): Promise<readonly UnifiedMemoryResult[]> {
    if (source === 'all') {
      return this.queryAll(query, limit, errored);
    }
    // Wait for SQLite backends to finish initializing
    if (this.initPromise !== null) {
      await this.initPromise;
      this.initPromise = null;
    }
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2);
    let results: UnifiedMemoryResult[];
    switch (source) {
      case 'session':
        results = this.querySessionMemory(query, keywords, limit);
        break;
      case 'belief':
        results = await this.queryBeliefMemory(query, keywords, limit, () => errored?.('belief'));
        break;
      case 'agentic':
        results = await this.queryAgenticMemory(query, keywords, limit, () => errored?.('agentic'));
        break;
      case 'typed':
        results = await this.queryTypedMemory(query, keywords, limit, () => errored?.('typed'));
        break;
      case 'adaptive':
        results = await this.queryAdaptiveMemory(query, keywords, limit, () =>
          errored?.('adaptive')
        );
        break;
    }
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  /** Query SessionMemory for learnings. */
  // Per-backend query helpers delegated to tool-memory-query.ts (#1671).

  private querySessionMemory(
    query: string,
    keywords: readonly string[],
    limit: number
  ): UnifiedMemoryResult[] {
    return querySessionMemoryHelper(this.searchLearnings(query), keywords, limit);
  }

  private async queryBeliefMemory(
    query: string,
    keywords: readonly string[],
    limit: number,
    onFailure?: () => void
  ): Promise<UnifiedMemoryResult[]> {
    return queryBeliefMemoryHelper(this.beliefs, query, keywords, limit, {
      log: this.log,
      onFailure,
    });
  }

  private async queryAgenticMemory(
    query: string,
    keywords: readonly string[],
    limit: number,
    onFailure?: () => void
  ): Promise<UnifiedMemoryResult[]> {
    if (this.agentic === null) return [];

    return queryAgenticMemoryHelper(this.agentic, query, keywords, limit, {
      log: this.log,
      onFailure,
    });
  }

  private async queryTypedMemory(
    query: string,
    keywords: readonly string[],
    limitPerType: number,
    onFailure?: () => void
  ): Promise<UnifiedMemoryResult[]> {
    if (this.typed === null) return [];

    return queryTypedMemoryHelper(this.typed, query, keywords, limitPerType, {
      log: this.log,
      onFailure,
    });
  }

  private async queryAdaptiveMemory(
    query: string,
    keywords: readonly string[],
    limit: number,
    onFailure?: () => void
  ): Promise<UnifiedMemoryResult[]> {
    if (this.adaptive === null) return [];

    return queryAdaptiveMemoryHelper(this.adaptive, query, keywords, limit, {
      log: this.log,
      onFailure,
    });
  }

  // ==========================================================================
  // Memory Promotion Pipeline (Phase 4 #746)
  // ==========================================================================

  /**
   * Run the memory promotion pipeline.
   * Promotes high-confidence learnings to beliefs, and stable beliefs to AgenticMemory.
   * Returns statistics about the promotion run.
   */
  async runPromotionPipeline(config?: Partial<MemoryPromotionConfig>): Promise<PromotionStats> {
    const promoter = new MemoryPromoter(this.beliefs, this.agentic, config, this.log);

    // Get current learnings and beliefs for promotion evaluation
    const learnings = this.pastLearnings;
    const beliefData = this.beliefs.exportData();
    const beliefs = Array.from(beliefData.beliefs.values());

    const stats = await promoter.runPromotionPipeline(learnings, beliefs);

    this.log.info('Promotion pipeline completed', {
      learningsPromoted: stats.learningsPromotedToBelief,
      beliefsPromoted: stats.beliefsPromotedToAgentic,
    });

    return stats;
  }

  // ==========================================================================
  // Coordinated Decay (Phase 5 #746)
  // ==========================================================================

  /** Whether coordinated decay is available. */
  isDecayManagerAvailable(): boolean {
    return this.decayManager !== null;
  }

  /**
   * Run coordinated decay across all memory systems.
   * Implements FADE (Forgetting with Adaptive Decay) principles.
   * Returns statistics about the decay run.
   */
  async runDecay(): Promise<DecayRunStats | undefined> {
    if (this.decayManager === null) return undefined;
    return this.decayManager.runDecay();
  }

  /**
   * Get aggregate statistics across all decay runs.
   */
  getDecayStats(): DecayAggregateStats | undefined {
    if (this.decayManager === null) return undefined;
    return this.decayManager.getAggregateStats();
  }

  /**
   * Get the last N decay run results.
   */
  getRecentDecayRuns(limit = 10): readonly DecayRunStats[] {
    if (this.decayManager === null) return [];
    return this.decayManager.getRecentRuns(limit);
  }

  /**
   * Register a cross-reference between memory systems.
   * Used to prevent orphaned references during decay.
   */
  registerCrossReference(
    sourceMemory: 'session' | 'belief' | 'agentic' | 'adaptive' | 'mobimem',
    sourceKey: string,
    targetMemory: 'session' | 'belief' | 'agentic' | 'adaptive' | 'mobimem',
    targetKey: string
  ): void {
    if (this.decayManager === null) return;
    this.decayManager.registerCrossReference(sourceMemory, sourceKey, targetMemory, targetKey);
  }

  /** End the current session and persist to disk. Closes SQLite backends. */
  endSession(): void {
    // Persist belief memory to disk (Phase 3, Issue #714)
    this.saveBeliefSnapshotToDisk();

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
    // TypedMemory uses HybridMemoryBackend which needs explicit close
    if (this.typedBackend !== null) {
      this.typedBackend.close();
      this.typedBackend = null;
    }
    this.typed = null;
    // MobiMem has its own close method
    if (this.mobimem !== null) {
      this.mobimem.close();
      this.mobimem = null;
    }
    // Shutdown decay manager (Phase 5 #746)
    if (this.decayManager !== null) {
      this.decayManager.shutdown();
      this.decayManager = null;
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
    } catch (e: unknown) {
      this.log.debug('Belief creation from learning failed', { error: String(e) });
    }
  }

  /** Load belief snapshot from disk on startup (Phase 3, Issue #714). */
  private loadBeliefSnapshotFromDisk(): void {
    try {
      const result = loadBeliefSnapshot(this.log);
      if (!result.ok) {
        this.log.warn('Failed to load belief snapshot', { error: result.error.message });
        return;
      }
      if (result.value === null) return;
      this.beliefs.hydrate(result.value);
    } catch (error: unknown) {
      this.log.debug('Belief snapshot load failed', {
        error: getErrorMessage(error),
      });
    }
  }

  /** Save belief snapshot to disk on shutdown (Phase 3, Issue #714). */
  private saveBeliefSnapshotToDisk(): void {
    try {
      const data = this.beliefs.exportData();
      if (data.beliefs.size === 0) {
        this.log.debug('No beliefs to persist, skipping snapshot');
        return;
      }
      const result = saveBeliefSnapshot(data, this.log);
      if (!result.ok) {
        this.log.warn('Failed to save belief snapshot', { error: result.error.message });
      }
    } catch (error: unknown) {
      this.log.debug('Belief snapshot save failed', {
        error: getErrorMessage(error),
      });
    }
  }
}
