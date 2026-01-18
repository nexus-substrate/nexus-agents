/**
 * Emergent Pattern Tracker
 *
 * Detects emergent patterns in agent orchestration:
 * - Compaction: Hub agents that receive disproportionate traffic
 * - Cyclicality: Recurring agent sequences for recursive refinement
 *
 * @module agents/orchestration/pattern-tracker
 * (Source: Issue #335, arXiv:2505.19591)
 */

import type {
  EmergentPatterns,
  HubAgentInfo,
  CycleInfo,
  PuppeteerStepResult,
} from './puppeteer-types.js';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration for pattern tracking.
 */
export interface PatternTrackerConfig {
  /** Threshold for hub detection (percentage of traffic) */
  readonly hubThreshold?: number;
  /** Minimum cycle length to detect */
  readonly minCycleLength?: number;
  /** Maximum cycle length to detect */
  readonly maxCycleLength?: number;
  /** Minimum occurrences for a cycle to be reported */
  readonly minCycleOccurrences?: number;
}

/** Default pattern tracker configuration. */
export const DEFAULT_PATTERN_TRACKER_CONFIG: Required<PatternTrackerConfig> = {
  hubThreshold: 0.3, // 30% of traffic = hub
  minCycleLength: 2,
  maxCycleLength: 4,
  minCycleOccurrences: 2,
};

// =============================================================================
// Pattern Tracker Interface
// =============================================================================

/**
 * Interface for pattern tracking.
 */
export interface IPatternTracker {
  /** Analyze trajectory and detect patterns. */
  analyze(trajectory: readonly PuppeteerStepResult[]): EmergentPatterns;

  /** Detect hub agents from trajectory. */
  detectHubs(trajectory: readonly PuppeteerStepResult[]): readonly HubAgentInfo[];

  /** Detect cyclic patterns from trajectory. */
  detectCycles(trajectory: readonly PuppeteerStepResult[]): readonly CycleInfo[];

  /** Calculate graph density. */
  calculateGraphDensity(trajectory: readonly PuppeteerStepResult[]): number;

  /** Calculate cyclicality score. */
  calculateCyclicalityScore(cycles: readonly CycleInfo[], totalSteps: number): number;
}

// =============================================================================
// Pattern Tracker Implementation
// =============================================================================

/**
 * Pattern tracker for detecting emergent orchestration behaviors.
 */
export class PatternTracker implements IPatternTracker {
  private readonly config: Required<PatternTrackerConfig>;

  constructor(config: PatternTrackerConfig = {}) {
    this.config = { ...DEFAULT_PATTERN_TRACKER_CONFIG, ...config };
  }

  /**
   * Analyze trajectory and detect all patterns.
   */
  analyze(trajectory: readonly PuppeteerStepResult[]): EmergentPatterns {
    if (trajectory.length === 0) {
      return this.emptyPatterns();
    }

    const hubAgents = this.detectHubs(trajectory);
    const cycles = this.detectCycles(trajectory);
    const graphDensity = this.calculateGraphDensity(trajectory);
    const cyclicalityScore = this.calculateCyclicalityScore(cycles, trajectory.length);

    return {
      hubAgents,
      cycles,
      graphDensity,
      cyclicalityScore,
    };
  }

  /**
   * Detect hub agents based on activation frequency.
   */
  detectHubs(trajectory: readonly PuppeteerStepResult[]): readonly HubAgentInfo[] {
    if (trajectory.length === 0) return [];

    // Count activations per agent
    const activations = new Map<string, number>();
    for (const step of trajectory) {
      const agentId = step.selectedAgent;
      activations.set(agentId, (activations.get(agentId) ?? 0) + 1);
    }

    // Calculate percentages and identify hubs
    const totalSteps = trajectory.length;
    const hubs: HubAgentInfo[] = [];

    for (const [agentId, count] of activations) {
      const percentage = count / totalSteps;
      if (percentage >= this.config.hubThreshold) {
        hubs.push({
          agentId,
          activationCount: count,
          percentage: Math.round(percentage * 100) / 100,
        });
      }
    }

    // Sort by activation count (descending)
    return hubs.sort((a, b) => b.activationCount - a.activationCount);
  }

  /**
   * Detect cyclic patterns in agent sequence.
   */
  detectCycles(trajectory: readonly PuppeteerStepResult[]): readonly CycleInfo[] {
    if (trajectory.length < this.config.minCycleLength) return [];

    // Extract agent sequence
    const sequence = trajectory.map((s) => s.selectedAgent);
    const cycles: CycleInfo[] = [];

    // Find all cycles of each length
    for (let len = this.config.minCycleLength; len <= this.config.maxCycleLength; len++) {
      const foundCycles = this.findCyclesOfLength(sequence, len);
      cycles.push(...foundCycles);
    }

    // Deduplicate and merge cycles (same agents in same order)
    const merged = this.mergeCycles(cycles);

    // Filter by minimum occurrences
    return merged.filter((c) => c.occurrences >= this.config.minCycleOccurrences);
  }

  /**
   * Calculate graph density.
   * Density = (edges) / (possible edges) where edges are transitions.
   */
  calculateGraphDensity(trajectory: readonly PuppeteerStepResult[]): number {
    if (trajectory.length < 2) return 0;

    // Count unique agents
    const uniqueAgents = new Set(trajectory.map((s) => s.selectedAgent));
    const n = uniqueAgents.size;

    if (n < 2) return 0;

    // Count unique transitions
    const transitions = new Set<string>();
    for (let i = 1; i < trajectory.length; i++) {
      const fromStep = trajectory[i - 1];
      const toStep = trajectory[i];
      if (fromStep !== undefined && toStep !== undefined) {
        transitions.add(`${fromStep.selectedAgent}->${toStep.selectedAgent}`);
      }
    }

    // Maximum possible edges in a directed graph (including self-loops)
    const maxEdges = n * n;
    const density = transitions.size / maxEdges;

    return Math.round(density * 100) / 100;
  }

  /**
   * Calculate cyclicality score based on detected cycles.
   */
  calculateCyclicalityScore(cycles: readonly CycleInfo[], totalSteps: number): number {
    if (cycles.length === 0 || totalSteps === 0) return 0;

    // Calculate total steps covered by cycles
    let stepsInCycles = 0;
    for (const cycle of cycles) {
      stepsInCycles += cycle.agents.length * cycle.occurrences;
    }

    // Cyclicality score is proportion of steps in cyclic patterns
    // Capped at 1.0 (cycles can overlap)
    const score = Math.min(stepsInCycles / totalSteps, 1.0);

    return Math.round(score * 100) / 100;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private emptyPatterns(): EmergentPatterns {
    return {
      hubAgents: [],
      cycles: [],
      graphDensity: 0,
      cyclicalityScore: 0,
    };
  }

  private findCyclesOfLength(sequence: string[], length: number): CycleInfo[] {
    if (sequence.length < length * 2) return [];

    // Count occurrences of each n-gram
    const ngramCounts = new Map<string, number>();

    for (let i = 0; i <= sequence.length - length; i++) {
      const ngram = sequence.slice(i, i + length);
      const key = ngram.join('|');
      ngramCounts.set(key, (ngramCounts.get(key) ?? 0) + 1);
    }

    // Convert to CycleInfo for patterns that repeat
    const cycles: CycleInfo[] = [];
    for (const [key, count] of ngramCounts) {
      if (count >= 2) {
        cycles.push({
          agents: key.split('|'),
          occurrences: count,
        });
      }
    }

    return cycles;
  }

  private mergeCycles(cycles: CycleInfo[]): CycleInfo[] {
    // Group by normalized cycle key
    const grouped = new Map<string, CycleInfo>();

    for (const cycle of cycles) {
      const key = this.normalizeCycleKey(cycle.agents);
      const existing = grouped.get(key);

      if (existing) {
        // Keep the one with more occurrences
        if (cycle.occurrences > existing.occurrences) {
          grouped.set(key, cycle);
        }
      } else {
        grouped.set(key, cycle);
      }
    }

    // Sort by occurrences (descending)
    return [...grouped.values()].sort((a, b) => b.occurrences - a.occurrences);
  }

  private normalizeCycleKey(agents: readonly string[]): string {
    // Normalize by finding the lexicographically smallest rotation
    const rotations: string[] = [];
    const n = agents.length;

    for (let i = 0; i < n; i++) {
      const rotation = [...agents.slice(i), ...agents.slice(0, i)].join('|');
      rotations.push(rotation);
    }

    rotations.sort();
    const firstRotation = rotations[0];
    return firstRotation ?? agents.join('|');
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a pattern tracker instance.
 */
export function createPatternTracker(config?: PatternTrackerConfig): IPatternTracker {
  return new PatternTracker(config);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate compaction score from hub agents.
 */
export function calculateCompactionScore(hubAgents: readonly HubAgentInfo[]): number {
  if (hubAgents.length === 0) return 0;

  // Compaction score is the total percentage of traffic going to hubs
  const totalHubPercentage = hubAgents.reduce((sum, hub) => sum + hub.percentage, 0);

  // Normalize to 0-1 range
  return Math.min(totalHubPercentage, 1.0);
}

/**
 * Check if a trajectory exhibits strong compaction.
 */
export function hasStrongCompaction(hubAgents: readonly HubAgentInfo[]): boolean {
  // Strong compaction: one agent handles > 50% of traffic
  return hubAgents.some((hub) => hub.percentage > 0.5);
}

/**
 * Check if a trajectory exhibits strong cyclicality.
 */
export function hasStrongCyclicality(cyclicalityScore: number): boolean {
  // Strong cyclicality: > 40% of steps in cycles
  return cyclicalityScore > 0.4;
}
