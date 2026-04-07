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
import * as os from 'node:os';
import * as path from 'node:path';
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
import { MobiMem } from '../../context/mobimem.js';
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
import {
  querySessionMemory as querySessionMemoryHelper,
  queryBeliefMemory as queryBeliefMemoryHelper,
  queryAgenticMemory as queryAgenticMemoryHelper,
  queryTypedMemory as queryTypedMemoryHelper,
  queryAdaptiveMemory as queryAdaptiveMemoryHelper,
} from './tool-memory-query.js';

// Re-export types tools may need
export type { SessionLearning, CompletedTask, ResolvedError, Belief };

/**
 * Result from unified cross-memory query (Phase 3 #746).
 * Includes source attribution and relevance scoring.
 */
export interface UnifiedMemoryResult {
  /** Source memory system */
  source: 'session' | 'belief' | 'agentic' | 'typed' | 'adaptive';
  /** Type of memory entry */
  type: string;
  /** Content summary (may be truncated) */
  content: string;
  /** Relevance score (0-1) based on keyword matching */
  relevance: number;
  /** When the entry was created */
  timestamp: Date;
  /** Additional metadata (e.g., confidence, keywords) */
  metadata?: Record<string, unknown>;
}
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

/** Default memory directory under user home. */
const MEMORY_BASE = path.join(os.homedir(), '.nexus-agents', 'memory');
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

/**
 * Reinitialize SQLite-based memory backends that failed during startup.
 * Useful after installing better-sqlite3 to enable full memory functionality.
 * @returns Status of each backend after reinitialization
 */
export async function reinitializeMemoryBackends(): Promise<MemoryBackendStatus> {
  return getToolMemory().reinitializeSqliteBackends();
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

  /** Initialize MobiMem (Phase 2 #746 - post-deployment learning). */
  private initMobiMem(): void {
    try {
      this.mobimem = new MobiMem({
        dbPath: MOBIMEM_DB_PATH,
        autoEviction: true,
      });
      this.log.info('MobiMem activated (Phase 2 #746)');
    } catch (error: unknown) {
      this.log.debug('MobiMem init failed', {
        error: getErrorMessage(error),
      });
    }
  }

  /** Initialize coordinated decay manager (Phase 5 #746). */
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
   * Skips already-initialized backends. Useful after installing better-sqlite3.
   * @returns Status of each backend after reinitialization attempt
   */
  async reinitializeSqliteBackends(): Promise<MemoryBackendStatus> {
    this.log.info('Reinitializing SQLite backends');
    // Wait for any in-flight initialization to complete first (#794)
    if (this.initPromise !== null) {
      await this.initPromise;
      this.initPromise = null;
    }
    if (this.agentic === null) await this.initAgenticMemory();
    if (this.adaptive === null) await this.initAdaptiveMemory();
    if (this.typed === null) await this.initTypedMemory();
    if (this.mobimem === null) this.initMobiMem();
    if (this.decayManager === null) this.initDecayManager();
    return this.getBackendStatus();
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
        error: getErrorMessage(error),
      });
    }
  }

  /** Store a value in AdaptiveMemory with importance scoring. Best-effort. */
  async storeAdaptive(key: string, value: unknown, importance: number): Promise<void> {
    if (this.adaptive === null) return;
    try {
      const level = importance >= 0.8 ? 'high' : importance >= 0.6 ? 'medium' : 'low';
      const result = await this.adaptive.store(key, value, {
        importance: level,
        tags: ['memory_write_tool'],
      });
      if (!result.ok) {
        this.log.debug('Failed to store adaptive memory', { key, error: result.error.message });
      }
    } catch (error: unknown) {
      this.log.debug('Adaptive memory store failed', {
        key,
        error: getErrorMessage(error),
      });
    }
  }

  /** Store a value in TypedMemory (via HybridMemoryBackend). Best-effort. */
  async storeTyped(key: string, value: unknown, importance: MemoryImportance): Promise<void> {
    if (this.typedBackend === null) return;
    try {
      const result = await this.typedBackend.store(`semantic ${key}`, value, {
        importance,
        tags: ['memory_write_tool', 'semantic'],
      });
      if (!result.ok) {
        this.log.debug('Failed to store typed memory', { key, error: result.error.message });
      }
    } catch (error: unknown) {
      this.log.debug('Typed memory store failed', {
        key,
        error: getErrorMessage(error),
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
  async queryAll(query: string, limit = 10): Promise<readonly UnifiedMemoryResult[]> {
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
      ...(await this.queryBeliefMemory(query, keywords, perSource)),
      ...(await this.queryAgenticMemory(query, keywords, perSource)),
      ...(await this.queryTypedMemory(query, keywords, Math.ceil(perSource / 2))),
      ...(await this.queryAdaptiveMemory(query, keywords, perSource)),
    ];
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
  }

  /**
   * Query a specific memory backend directly, bypassing cross-backend limit dilution.
   * When source is 'all', delegates to queryAll(). Otherwise dispatches to the
   * single-backend method so the full limit is applied to that backend only.
   */
  async queryBySource(
    source: 'session' | 'belief' | 'agentic' | 'typed' | 'adaptive' | 'all',
    query: string,
    limit = 10
  ): Promise<readonly UnifiedMemoryResult[]> {
    if (source === 'all') {
      return this.queryAll(query, limit);
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
        results = await this.queryBeliefMemory(query, keywords, limit);
        break;
      case 'agentic':
        results = await this.queryAgenticMemory(query, keywords, limit);
        break;
      case 'typed':
        results = await this.queryTypedMemory(query, keywords, limit);
        break;
      case 'adaptive':
        results = await this.queryAdaptiveMemory(query, keywords, limit);
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- cross-module type resolution
    return querySessionMemoryHelper(this.searchLearnings(query), keywords, limit);
  }

  private async queryBeliefMemory(
    query: string,
    keywords: readonly string[],
    limit: number
  ): Promise<UnifiedMemoryResult[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- cross-module type resolution
    return queryBeliefMemoryHelper(this.beliefs, query, keywords, limit, this.log);
  }

  private async queryAgenticMemory(
    query: string,
    keywords: readonly string[],
    limit: number
  ): Promise<UnifiedMemoryResult[]> {
    if (this.agentic === null) return [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- cross-module type resolution
    return queryAgenticMemoryHelper(this.agentic, query, keywords, limit, this.log);
  }

  private async queryTypedMemory(
    query: string,
    keywords: readonly string[],
    limitPerType: number
  ): Promise<UnifiedMemoryResult[]> {
    if (this.typed === null) return [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- cross-module type resolution
    return queryTypedMemoryHelper(this.typed, query, keywords, limitPerType, this.log);
  }

  private async queryAdaptiveMemory(
    query: string,
    keywords: readonly string[],
    limit: number
  ): Promise<UnifiedMemoryResult[]> {
    if (this.adaptive === null) return [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- cross-module type resolution
    return queryAdaptiveMemoryHelper(this.adaptive, query, keywords, limit, this.log);
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
