/**
 * Strategy Distiller — Automatic routing rule extraction from outcomes.
 *
 * Monitors OutcomeStore data and distills recurring patterns into
 * routing rules. Three pattern detectors identify failure rates,
 * success rates, and latency spikes per (cli, category) group.
 *
 * Rules progress through a lifecycle: draft -> active -> promoted -> expired.
 * Tainted rules (from untrusted input) never promote.
 *
 * @module learning/strategy-distiller
 * (Source: Issue #999 - Automatic Strategy Distillation)
 */

import type { ILogger } from '../core/index.js';
import { createLogger, getTimeProvider } from '../core/index.js';
import type { CliName } from '../cli-adapters/types.js';
import type { TaskOutcome } from '../orchestration/outcomes/outcome-types.js';
import type { OutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import type { IRoutingMemory, ModelPerformance } from '../context/routing-memory.js';
import type {
  DistilledRule,
  DistillerConfig,
  DistillerStats,
  PatternType,
  RuleStatus,
  StrategyAction,
} from './strategy-distiller-types.js';
import { DEFAULT_DISTILLER_CONFIG } from './strategy-distiller-types.js';

// ============================================================================
// Helpers — pure functions
// ============================================================================

/** Sigmoid confidence: 1 / (1 + exp(-(n - center) / 5)) */
export function sigmoidConfidence(observations: number, center: number = 30): number {
  const raw = 1 / (1 + Math.exp(-(observations - center) / 5));
  return Math.max(0, Math.min(1, raw));
}

/** Build a fingerprint ID for a rule. */
function ruleFingerprint(patternType: PatternType, cli: CliName, category: string): string {
  return `${patternType}:${cli}:${category}`;
}

/** Group outcomes by (cli, category). */
interface OutcomeGroup {
  readonly cli: CliName;
  readonly category: string;
  readonly outcomes: readonly TaskOutcome[];
}

function groupOutcomes(outcomes: readonly TaskOutcome[]): OutcomeGroup[] {
  const map = new Map<string, TaskOutcome[]>();
  for (const o of outcomes) {
    const key = `${o.cli}:${o.category}`;
    const list = map.get(key);
    if (list !== undefined) {
      list.push(o);
    } else {
      map.set(key, [o]);
    }
  }
  const groups: OutcomeGroup[] = [];
  for (const [key, list] of map) {
    const [cli, category] = key.split(':') as [CliName, string];
    groups.push({ cli, category, outcomes: list });
  }
  return groups;
}

/** Compute p90 duration from a sorted array of durations. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

// ============================================================================
// Pattern Detectors — pure functions
// ============================================================================

interface DetectedPattern {
  readonly cli: CliName;
  readonly category: string;
  readonly patternType: PatternType;
  readonly action: StrategyAction;
  readonly metric: number;
  readonly observationCount: number;
}

/** Detect groups with failure rate above threshold. */
export function detectFailurePatterns(
  groups: readonly OutcomeGroup[],
  threshold: number
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  for (const g of groups) {
    const failCount = g.outcomes.filter((o) => !o.success).length;
    const failRate = failCount / g.outcomes.length;
    if (failRate >= threshold) {
      patterns.push({
        cli: g.cli,
        category: g.category,
        patternType: 'failure-rate',
        action: failRate >= 0.8 ? 'avoid' : 'penalize',
        metric: failRate,
        observationCount: g.outcomes.length,
      });
    }
  }
  return patterns;
}

/** Detect groups with success rate above threshold. */
export function detectSuccessPatterns(
  groups: readonly OutcomeGroup[],
  threshold: number
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  for (const g of groups) {
    const successCount = g.outcomes.filter((o) => o.success).length;
    const successRate = successCount / g.outcomes.length;
    if (successRate >= threshold) {
      patterns.push({
        cli: g.cli,
        category: g.category,
        patternType: 'success-rate',
        action: 'boost',
        metric: successRate,
        observationCount: g.outcomes.length,
      });
    }
  }
  return patterns;
}

/** Detect groups with latency spike (p90/median > threshold). */
export function detectLatencyPatterns(
  groups: readonly OutcomeGroup[],
  threshold: number
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  for (const g of groups) {
    const durations = g.outcomes.map((o) => o.durationMs).sort((a, b) => a - b);
    if (durations.length < 3) continue;

    const median = percentile(durations, 50);
    const p90 = percentile(durations, 90);
    if (median <= 0) continue;

    const ratio = p90 / median;
    if (ratio >= threshold) {
      patterns.push({
        cli: g.cli,
        category: g.category,
        patternType: 'latency-spike',
        action: 'penalize',
        metric: ratio,
        observationCount: g.outcomes.length,
      });
    }
  }
  return patterns;
}

// ============================================================================
// StrategyDistiller
// ============================================================================

/**
 * Distills outcome patterns into routing rules.
 *
 * Subscribe to OutcomeFeedbackCollector.onOutcomeProcessed() and call
 * onOutcome() for each processed outcome. Distillation triggers
 * automatically every `triggerThreshold` outcomes.
 */
export class StrategyDistiller {
  private readonly config: DistillerConfig;
  private readonly outcomeStore: OutcomeStore;
  private readonly logger: ILogger;
  private readonly rules = new Map<string, DistilledRule>();
  private outcomeCounter = 0;
  private lastDistillAt: number | undefined;

  constructor(outcomeStore: OutcomeStore, logger?: ILogger, config?: Partial<DistillerConfig>) {
    this.outcomeStore = outcomeStore;
    this.config = { ...DEFAULT_DISTILLER_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'StrategyDistiller' });
  }

  /** Called for each processed outcome. Triggers distillation at threshold. */
  onOutcome(): void {
    this.outcomeCounter++;
    if (this.outcomeCounter >= this.config.triggerThreshold) {
      this.distill();
      this.outcomeCounter = 0;
    }
  }

  /** Run distillation on current OutcomeStore data. */
  distill(): void {
    const now = getTimeProvider().now();
    const outcomes = this.outcomeStore.query();
    const groups = groupOutcomes(outcomes);

    // Expire old rules first
    this.expireRules(now);

    // Detect all patterns
    const failurePatterns = detectFailurePatterns(groups, this.config.failureRateThreshold);
    const successPatterns = detectSuccessPatterns(groups, this.config.successRateThreshold);
    const latencyPatterns = detectLatencyPatterns(groups, this.config.latencyRatioThreshold);

    const allPatterns = [...failurePatterns, ...successPatterns, ...latencyPatterns];

    for (const pattern of allPatterns) {
      this.upsertRule(pattern, now);
    }

    // Enforce max rules bound
    this.enforceMaxRules();

    this.lastDistillAt = now;
    this.logger.debug('Distillation complete', {
      rulesTotal: this.rules.size,
      patternsFound: allPatterns.length,
      outcomesAnalyzed: outcomes.length,
    });
  }

  /** Get rules filtered by status. */
  getRules(status?: RuleStatus): readonly DistilledRule[] {
    const all = [...this.rules.values()];
    if (status === undefined) return all;
    return all.filter((r) => r.status === status);
  }

  /** Get distiller statistics. */
  getStats(): DistillerStats {
    const countByStatus: Record<RuleStatus, number> = {
      draft: 0,
      active: 0,
      promoted: 0,
      expired: 0,
    };
    for (const rule of this.rules.values()) {
      countByStatus[rule.status]++;
    }
    return {
      ruleCountByStatus: countByStatus,
      totalRules: this.rules.size,
      lastDistillAt: this.lastDistillAt,
      outcomesSinceLastDistill: this.outcomeCounter,
    };
  }

  /**
   * Promote high-confidence rules to RoutingMemory.
   * Rules must be active, non-tainted, with sufficient observations and confidence.
   */
  promote(routingMemory: IRoutingMemory): number {
    let promoted = 0;
    for (const [id, rule] of this.rules) {
      if (rule.status !== 'active') continue;
      if (rule.tainted) continue;
      if (rule.observationCount < this.config.minObservationsForActive) continue;
      if (rule.confidence < this.config.promotionConfidence) continue;

      const performance = this.ruleToPerformance(rule);
      routingMemory.storePreference(rule.cli, rule.category, performance);

      this.rules.set(id, { ...rule, status: 'promoted', updatedAt: getTimeProvider().now() });
      promoted++;

      this.logger.info('Promoted distilled rule to RoutingMemory', {
        ruleId: id,
        cli: rule.cli,
        category: rule.category,
        confidence: rule.confidence,
      });
    }
    return promoted;
  }

  // ==========================================================================
  // Protected — for subclass hydration (Issue #1009)
  // ==========================================================================

  /** Load pre-existing rules (e.g., from disk). Used by PersistentStrategyDistiller. */
  protected loadRules(rules: readonly DistilledRule[]): void {
    for (const rule of rules) {
      this.rules.set(rule.id, rule);
    }
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private upsertRule(pattern: DetectedPattern, now: number): void {
    const id = ruleFingerprint(pattern.patternType, pattern.cli, pattern.category);
    const existing = this.rules.get(id);

    const confidence = sigmoidConfidence(pattern.observationCount);
    const status = this.computeStatus(pattern.observationCount, existing?.status);

    if (existing !== undefined) {
      this.rules.set(id, {
        ...existing,
        action: pattern.action,
        confidence,
        observationCount: pattern.observationCount,
        metric: pattern.metric,
        status,
        updatedAt: now,
      });
    } else {
      this.rules.set(id, {
        id,
        patternType: pattern.patternType,
        cli: pattern.cli,
        category: pattern.category,
        action: pattern.action,
        confidence,
        observationCount: pattern.observationCount,
        metric: pattern.metric,
        status,
        createdAt: now,
        updatedAt: now,
        tainted: false,
      });
    }
  }

  private computeStatus(observations: number, existing?: RuleStatus): RuleStatus {
    // Never downgrade promoted rules
    if (existing === 'promoted') return 'promoted';
    if (observations >= this.config.minObservationsForActive) return 'active';
    if (observations >= this.config.minObservationsForDraft) return 'draft';
    return 'draft';
  }

  private expireRules(now: number): void {
    for (const [id, rule] of this.rules) {
      if (rule.status === 'promoted') continue;
      if (now - rule.updatedAt > this.config.ruleExpiryMs) {
        this.rules.set(id, { ...rule, status: 'expired', updatedAt: now });
      }
    }
  }

  private enforceMaxRules(): void {
    if (this.rules.size <= this.config.maxRules) return;

    // Evict expired first, then lowest-confidence
    const sorted = [...this.rules.entries()].sort((a, b) => {
      // Expired rules sort first for eviction
      if (a[1].status === 'expired' && b[1].status !== 'expired') return -1;
      if (b[1].status === 'expired' && a[1].status !== 'expired') return 1;
      // Then by confidence ascending (lowest evicted first)
      return a[1].confidence - b[1].confidence;
    });

    const excess = this.rules.size - this.config.maxRules;
    for (let i = 0; i < excess; i++) {
      const entry = sorted[i];
      if (entry !== undefined) {
        this.rules.delete(entry[0]);
      }
    }
  }

  /** Convert rule metrics into ModelPerformance for RoutingMemory. */
  private ruleToPerformance(rule: DistilledRule): ModelPerformance {
    const successRate = rule.patternType === 'success-rate' ? rule.metric : 1 - rule.metric;
    return {
      avgQuality: rule.confidence,
      successRate: Math.max(0, Math.min(1, successRate)),
      avgLatencyMs: 0,
      avgTokens: 0,
      observations: rule.observationCount,
    };
  }
}

/** Factory function for creating StrategyDistiller. */
export function createStrategyDistiller(
  outcomeStore: OutcomeStore,
  logger?: ILogger,
  config?: Partial<DistillerConfig>
): StrategyDistiller {
  return new StrategyDistiller(outcomeStore, logger, config);
}

// ============================================================================
// Persistent factory registration (Issue #1009)
// ============================================================================

type DistillerFactory = (outcomeStore: OutcomeStore, logger: ILogger) => StrategyDistiller;
let persistentDistillerFactory: DistillerFactory | undefined;

/**
 * Register a factory for creating PersistentStrategyDistiller instances.
 * Called from strategy-distiller-persistence.ts at import time to break
 * the circular dependency with composite-router.
 */
export function registerPersistentDistillerFactory(factory: DistillerFactory): void {
  persistentDistillerFactory = factory;
}

/**
 * Create a persistent distiller if the factory is registered, else a plain one.
 * Used by CompositeRouter when NEXUS_PERSIST_LEARNING=true.
 */
export function createPersistentDistillerOrFallback(
  outcomeStore: OutcomeStore,
  logger: ILogger
): StrategyDistiller {
  if (persistentDistillerFactory !== undefined) {
    return persistentDistillerFactory(outcomeStore, logger);
  }
  return new StrategyDistiller(outcomeStore, logger);
}
