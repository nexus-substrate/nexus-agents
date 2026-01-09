/**
 * nexus-agents/agents - SICA Version Manager
 *
 * Manages agent versions and performance metrics for SICA.
 *
 * @module agents/self-improving/sica-version-manager
 * (Source: arXiv:2504.15228, Issue #151)
 */

import { randomUUID } from 'node:crypto';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type {
  VersionId,
  AgentVersion,
  AgentConfiguration,
  VersionMetrics,
  ExecutionMetrics,
  SicaEvent,
  SicaEventType,
  SicaConfig,
} from './sica-types.js';
import { DEFAULT_SICA_CONFIG } from './sica-types.js';

/**
 * Internal version store entry.
 */
interface VersionEntry {
  version: AgentVersion;
  metrics: VersionMetrics;
  executionHistory: ExecutionMetrics[];
}

/**
 * Manages agent versions and tracks performance.
 */
export class SicaVersionManager {
  private readonly config: SicaConfig;
  private readonly logger: ILogger;
  private readonly versions: Map<VersionId, VersionEntry>;
  private readonly events: SicaEvent[];
  private activeVersionId: VersionId | null;

  constructor(config: Partial<SicaConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_SICA_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'SicaVersionManager' });
    this.versions = new Map();
    this.events = [];
    this.activeVersionId = null;
  }

  /**
   * Creates the initial version of the agent.
   */
  createInitialVersion(configuration: AgentConfiguration): AgentVersion {
    const version = this.createVersion(configuration, null, 'Initial version');
    this.activeVersionId = version.id;
    this.emitEvent('version_activated', version.id, { reason: 'initial' });
    return version;
  }

  /**
   * Creates a new version derived from an existing one.
   */
  createDerivedVersion(
    parentId: VersionId,
    configuration: AgentConfiguration,
    rationale: string
  ): AgentVersion | null {
    const parent = this.versions.get(parentId);
    if (parent === undefined) {
      this.logger.warn('Parent version not found', { parentId });
      return null;
    }

    const activeCount = this.getActiveVersionCount();
    if (activeCount >= this.config.maxActiveVersions) {
      this.deprecateWorstPerforming();
    }

    return this.createVersion(configuration, parentId, rationale);
  }

  /**
   * Records execution metrics for a version.
   */
  recordExecution(versionId: VersionId, metrics: ExecutionMetrics): void {
    const entry = this.versions.get(versionId);
    if (entry === undefined) {
      this.logger.warn('Version not found for recording', { versionId });
      return;
    }

    entry.executionHistory.push(metrics);
    this.updateMetrics(entry);

    this.emitEvent('execution_completed', versionId, {
      success: metrics.success,
      durationMs: metrics.durationMs,
    });
  }

  /**
   * Gets the currently active version.
   */
  getActiveVersion(): AgentVersion | null {
    if (this.activeVersionId === null) return null;
    return this.versions.get(this.activeVersionId)?.version ?? null;
  }

  /**
   * Gets a version by ID.
   */
  getVersion(versionId: VersionId): AgentVersion | null {
    return this.versions.get(versionId)?.version ?? null;
  }

  /**
   * Gets metrics for a version.
   */
  getMetrics(versionId: VersionId): VersionMetrics | null {
    return this.versions.get(versionId)?.metrics ?? null;
  }

  /**
   * Gets all active versions.
   */
  getActiveVersions(): readonly AgentVersion[] {
    return Array.from(this.versions.values())
      .filter((e) => e.version.status === 'active')
      .map((e) => e.version);
  }

  /**
   * Selects the best performing version as active.
   */
  selectBestVersion(): AgentVersion | null {
    const candidates = Array.from(this.versions.values()).filter(
      (e) => e.version.status === 'active' && e.metrics.executionCount >= 3
    );

    if (candidates.length === 0) return this.getActiveVersion();

    const best = candidates.reduce((a, b) => {
      const scoreA = this.calculateScore(a.metrics);
      const scoreB = this.calculateScore(b.metrics);
      return scoreA >= scoreB ? a : b;
    });

    if (best.version.id !== this.activeVersionId) {
      this.activeVersionId = best.version.id;
      this.emitEvent('best_version_selected', best.version.id, {
        score: this.calculateScore(best.metrics),
      });
    }

    return best.version;
  }

  /**
   * Checks if improvement should be triggered.
   */
  shouldTriggerImprovement(versionId: VersionId): boolean {
    const entry = this.versions.get(versionId);
    if (entry === undefined) return false;

    const { metrics } = entry;
    if (metrics.executionCount < this.config.minExecutionsForImprovement) {
      return false;
    }

    return metrics.successRate < this.config.improvementThreshold;
  }

  /**
   * Deprecates a version.
   */
  deprecateVersion(versionId: VersionId, reason: string): void {
    const entry = this.versions.get(versionId);
    if (entry === undefined) return;

    const updated: AgentVersion = { ...entry.version, status: 'deprecated' };
    entry.version = updated;

    this.emitEvent('version_deprecated', versionId, { reason });

    if (this.activeVersionId === versionId) {
      this.selectBestVersion();
    }
  }

  /**
   * Gets all observability events.
   */
  getEvents(): readonly SicaEvent[] {
    return this.events;
  }

  /**
   * Gets recent events of a specific type.
   */
  getEventsByType(type: SicaEventType, limit = 10): readonly SicaEvent[] {
    return this.events.filter((e) => e.type === type).slice(-limit);
  }

  /**
   * Gets the configuration.
   */
  getConfig(): SicaConfig {
    return this.config;
  }

  /** Creates a new version entry. */
  private createVersion(
    configuration: AgentConfiguration,
    parentId: VersionId | null,
    rationale: string
  ): AgentVersion {
    const versionNumber = this.getNextVersionNumber(parentId);
    const version: AgentVersion = {
      id: randomUUID(),
      version: versionNumber,
      parentVersion: parentId,
      configuration,
      createdAt: new Date(),
      status: 'active',
      improvementRationale: rationale,
    };

    const metrics: VersionMetrics = {
      versionId: version.id,
      executionCount: 0,
      successCount: 0,
      successRate: 0,
      avgDurationMs: 0,
      avgTokensUsed: 0,
      lastUpdatedAt: new Date(),
    };

    this.versions.set(version.id, { version, metrics, executionHistory: [] });
    this.emitEvent('version_created', version.id, { parentId, version: versionNumber });

    this.logger.info('Version created', {
      versionId: version.id,
      version: versionNumber,
      parentId,
    });

    return version;
  }

  /** Updates metrics from execution history. */
  private updateMetrics(entry: VersionEntry): void {
    const history = entry.executionHistory;
    const count = history.length;
    const successes = history.filter((e) => e.success).length;

    const avgDuration = history.reduce((s, e) => s + e.durationMs, 0) / count;
    const avgTokens = history.reduce((s, e) => s + e.tokensUsed, 0) / count;

    const qualityScores = history.filter((e) => e.qualityScore !== undefined);
    const avgQuality =
      qualityScores.length > 0
        ? qualityScores.reduce((s, e) => s + (e.qualityScore ?? 0), 0) / qualityScores.length
        : undefined;

    entry.metrics = {
      versionId: entry.version.id,
      executionCount: count,
      successCount: successes,
      successRate: count > 0 ? successes / count : 0,
      avgDurationMs: avgDuration,
      avgTokensUsed: avgTokens,
      ...(avgQuality !== undefined && { avgQualityScore: avgQuality }),
      lastUpdatedAt: new Date(),
    };
  }

  /** Calculates a composite score for a version. */
  private calculateScore(metrics: VersionMetrics): number {
    const successWeight = 0.5;
    const qualityWeight = 0.3;
    const speedWeight = 0.2;

    let score = metrics.successRate * successWeight;

    if (metrics.avgQualityScore !== undefined) {
      score += metrics.avgQualityScore * qualityWeight;
    } else {
      score += metrics.successRate * qualityWeight;
    }

    const speedScore = Math.max(0, 1 - metrics.avgDurationMs / 30000);
    score += speedScore * speedWeight;

    return score;
  }

  /** Gets the next version number. */
  private getNextVersionNumber(parentId: VersionId | null): string {
    if (parentId === null) return '1.0.0';

    const parent = this.versions.get(parentId);
    if (parent === undefined) return '1.0.0';

    const parts = parent.version.version.split('.').map((p) => parseInt(p, 10));
    const [major = 1, minor = 0, patch = 0] = parts;
    return `${String(major)}.${String(minor)}.${String(patch + 1)}`;
  }

  /** Gets the count of active versions. */
  private getActiveVersionCount(): number {
    return Array.from(this.versions.values()).filter((e) => e.version.status === 'active').length;
  }

  /** Deprecates the worst performing version. */
  private deprecateWorstPerforming(): void {
    const active = Array.from(this.versions.values()).filter(
      (e) => e.version.status === 'active' && e.version.id !== this.activeVersionId
    );

    if (active.length === 0) return;

    const worst = active.reduce((a, b) => {
      const scoreA = this.calculateScore(a.metrics);
      const scoreB = this.calculateScore(b.metrics);
      return scoreA <= scoreB ? a : b;
    });

    this.deprecateVersion(worst.version.id, 'Replaced by better performing version');
  }

  /** Emits an observability event. */
  private emitEvent(
    type: SicaEventType,
    versionId: VersionId | undefined,
    details: Record<string, unknown>
  ): void {
    if (!this.config.enableObservability) return;

    const event: SicaEvent = {
      type,
      timestamp: new Date(),
      ...(versionId !== undefined && { versionId }),
      details,
    };

    this.events.push(event);

    this.logger.debug('SICA event', { type, versionId, ...details });
  }
}

/**
 * Creates a version manager.
 */
export function createVersionManager(
  config?: Partial<SicaConfig>,
  logger?: ILogger
): SicaVersionManager {
  return new SicaVersionManager(config, logger);
}
