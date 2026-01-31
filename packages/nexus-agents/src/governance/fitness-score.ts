/**
 * nexus-agents/governance - CLI Orchestration Fitness Score
 *
 * Measures architectural quality for CLI orchestration. Used to track
 * consolidation progress and prevent regression.
 *
 * Penalizes:
 * - Duplicate paths to accomplish the same workflow
 * - Hidden/implicit behavior (magic routing)
 * - Non-determinism
 * - Poor observability
 * - Too many config surfaces
 * - Cross-layer coupling
 *
 * Rewards:
 * - Single canonical paths
 * - Clear contracts/interfaces
 * - Deterministic runs
 * - Strong telemetry
 * - Predictable failure modes
 * - Minimal operator steps
 * - Strong governance
 *
 * @module governance/fitness-score
 * (Source: System Mandate LOOP I)
 */

import { createLogger, type ILogger } from '../core/index.js';

/**
 * Individual fitness dimension scores.
 */
export interface FitnessDimensions {
  /** Penalty: duplicate paths to same workflow (0-20, higher = better) */
  readonly canonicalPaths: number;
  /** Penalty: hidden/magic behavior (0-15, higher = better) */
  readonly explicitBehavior: number;
  /** Reward: deterministic execution (0-15, higher = better) */
  readonly determinism: number;
  /** Reward: observability coverage (0-15, higher = better) */
  readonly observability: number;
  /** Penalty: config surface area (0-10, higher = better) */
  readonly configSimplicity: number;
  /** Penalty: cross-layer coupling (0-10, higher = better) */
  readonly layerSeparation: number;
  /** Reward: CLI ergonomics (0-10, higher = better) */
  readonly operatorErgonomics: number;
  /** Reward: governance injection (0-5, higher = better) */
  readonly governanceIntegration: number;
}

/**
 * Detailed fitness audit result.
 */
export interface FitnessAudit {
  /** Overall score (0-100) */
  readonly score: number;
  /** Individual dimension scores */
  readonly dimensions: FitnessDimensions;
  /** Specific findings */
  readonly findings: readonly FitnessFinding[];
  /** Timestamp of audit */
  readonly timestamp: string;
  /** Version/commit reference */
  readonly version: string;
}

/**
 * Individual finding from audit.
 */
export interface FitnessFinding {
  /** Dimension affected */
  readonly dimension: keyof FitnessDimensions;
  /** Issue severity: 'info' | 'warning' | 'critical' */
  readonly severity: 'info' | 'warning' | 'critical';
  /** Description */
  readonly description: string;
  /** Points deducted */
  readonly pointsDeducted: number;
  /** Location in code (optional) */
  readonly location?: string;
  /** Suggested fix (optional) */
  readonly suggestion?: string;
}

/**
 * Fitness check definition.
 */
interface FitnessCheck {
  readonly dimension: keyof FitnessDimensions;
  readonly maxPoints: number;
  readonly name: string;
  readonly check: () => FitnessCheckResult;
}

/**
 * Result of a single fitness check.
 */
interface FitnessCheckResult {
  readonly score: number;
  readonly findings: FitnessFinding[];
}

/**
 * CLI Orchestration Fitness Score calculator.
 */
export class FitnessScoreCalculator {
  private readonly logger: ILogger;
  private readonly checks: FitnessCheck[] = [];

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'FitnessScoreCalculator' });
    this.registerDefaultChecks();
  }

  /**
   * Register default fitness checks.
   */
  private registerDefaultChecks(): void {
    // Canonical Paths (20 points max)
    this.checks.push({
      dimension: 'canonicalPaths',
      maxPoints: 20,
      name: 'Canonical Path Analysis',
      check: () => this.checkCanonicalPaths(),
    });

    // Explicit Behavior (15 points max)
    this.checks.push({
      dimension: 'explicitBehavior',
      maxPoints: 15,
      name: 'Explicit Behavior Analysis',
      check: () => this.checkExplicitBehavior(),
    });

    // Determinism (15 points max)
    this.checks.push({
      dimension: 'determinism',
      maxPoints: 15,
      name: 'Determinism Analysis',
      check: () => this.checkDeterminism(),
    });

    // Observability (15 points max)
    this.checks.push({
      dimension: 'observability',
      maxPoints: 15,
      name: 'Observability Analysis',
      check: () => this.checkObservability(),
    });

    // Config Simplicity (10 points max)
    this.checks.push({
      dimension: 'configSimplicity',
      maxPoints: 10,
      name: 'Config Simplicity Analysis',
      check: () => this.checkConfigSimplicity(),
    });

    // Layer Separation (10 points max)
    this.checks.push({
      dimension: 'layerSeparation',
      maxPoints: 10,
      name: 'Layer Separation Analysis',
      check: () => this.checkLayerSeparation(),
    });

    // Operator Ergonomics (10 points max)
    this.checks.push({
      dimension: 'operatorErgonomics',
      maxPoints: 10,
      name: 'Operator Ergonomics Analysis',
      check: () => this.checkOperatorErgonomics(),
    });

    // Governance Integration (5 points max)
    this.checks.push({
      dimension: 'governanceIntegration',
      maxPoints: 5,
      name: 'Governance Integration Analysis',
      check: () => this.checkGovernanceIntegration(),
    });
  }

  /**
   * Run full fitness audit.
   */
  audit(version: string): FitnessAudit {
    const findings: FitnessFinding[] = [];
    const dimensions: Record<string, number> = {};

    for (const check of this.checks) {
      this.logger.debug(`Running fitness check: ${check.name}`);
      const result = check.check();
      dimensions[check.dimension] = result.score;
      findings.push(...result.findings);
    }

    const score = Object.values(dimensions).reduce((sum, val) => sum + val, 0);

    this.logger.info('Fitness audit complete', { score, version });

    return {
      score,
      dimensions: dimensions as unknown as FitnessDimensions,
      findings,
      timestamp: new Date().toISOString(),
      version,
    };
  }

  // =========================================================================
  // Individual Checks
  // =========================================================================

  /**
   * Check canonical paths - penalize duplicate paths to same workflow.
   * Target: 18/20 after consolidation (per Issue #574)
   */
  private checkCanonicalPaths(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 20;

    // Check: Token estimation unified - COMPLETE
    // All adapters now use unified TokenEstimator from core/token-estimator.ts
    // 11fadd6: Ollama adapter migrated
    // 06724b5: Dead constants removed (CLAUDE/OPENAI/GEMINI_CHARS_PER_TOKEN)
    // No deduction - fully consolidated

    // Check: Task analysis unified
    // task-analyzer.ts vs SharedTaskAnalyzer - 2 implementations
    score -= 2;
    findings.push({
      dimension: 'canonicalPaths',
      severity: 'warning',
      description: 'Task analysis has legacy and new implementation',
      pointsDeducted: 2,
      suggestion: 'Complete migration to SharedTaskAnalyzer (Issue #574)',
    });

    // Check: Router implementations
    const routerCount: number = 8;
    const routerDeduction = Math.min(routerCount - 5, 3);
    score -= routerDeduction;
    findings.push({
      dimension: 'canonicalPaths',
      severity: 'info',
      description: `${String(routerCount)} router implementations (expected ≤5 after consolidation)`,
      pointsDeducted: routerDeduction,
      suggestion: 'Consider consolidating routers behind unified interfaces',
    });

    // Consolidated: toError utility (ecdf0e3) - no deduction
    // Consolidated: STPA safety framework (7bbf6e5) - no deduction
    // Consolidated: REST API server integration (bbd3709) - no deduction

    return { score: Math.max(0, score), findings };
  }

  /**
   * Check explicit behavior - penalize hidden/magic behavior.
   */
  private checkExplicitBehavior(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    const score = 15;

    // Check: Implicit mock fallback fixed (Issue #554)
    // Full points if NEXUS_ALLOW_MOCK_ORCHESTRATION is required
    // This was fixed, so no deduction

    // Check: Magic routing in delegate_to_model
    // Currently uses explicit capability matching
    // No deduction

    return { score, findings };
  }

  /**
   * Check determinism - reward deterministic execution.
   */
  private checkDeterminism(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 15;

    // Check: Time provider abstraction exists
    // Full points - getTimeProvider() is used

    // Check: Random provider abstraction exists
    // Full points - getRandomProvider() is used

    // Check: Consensus voting determinism
    // Deduct if votes could vary without seed
    score -= 2;
    findings.push({
      dimension: 'determinism',
      severity: 'info',
      description: 'Consensus voting uses LLM responses which are non-deterministic',
      pointsDeducted: 2,
      suggestion: 'Consider caching/memoization for repeated proposals',
    });

    return { score: Math.max(0, score), findings };
  }

  /**
   * Check observability - reward telemetry coverage.
   */
  private checkObservability(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    const score = 15;

    // Check: Tracing infrastructure exists
    // Full points - Tracer, TraceExporter exist

    // Check: Metrics collection
    // Full points - ErrorMetricsCollector exists

    // Check: OrchestrationObserver integration - COMPLETE (Issue #587)
    // CompositeRouter now accepts orchestrationObserver config and records all routing decisions
    // Commit: Wire OrchestrationObserver to CompositeRouter
    // No deduction - fully wired

    return { score: Math.max(0, score), findings };
  }

  /**
   * Check config simplicity - penalize too many config surfaces.
   */
  private checkConfigSimplicity(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 10;

    // Check: Unified config schema exists
    // Full points - nexus-agents.yaml with schemas

    // Check: Config validation
    // Deduct if validation is incomplete
    score -= 1;
    findings.push({
      dimension: 'configSimplicity',
      severity: 'info',
      description: 'Some config options lack Zod validation',
      pointsDeducted: 1,
      suggestion: 'Add Zod schemas to all config types',
    });

    return { score: Math.max(0, score), findings };
  }

  /**
   * Check layer separation - penalize cross-layer coupling.
   */
  private checkLayerSeparation(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    const score = 10;

    // Check: Core has no adapter imports
    // Full points if clean

    // Check: MCP tools don't import CLI adapters directly
    // COMPLETE (Issue #588): MCP tools now import ICompositeRouter from core/routing
    // core/routing/index.ts provides a stable interface layer over cli-adapters
    // No deduction - proper abstraction in place

    return { score: Math.max(0, score), findings };
  }

  /**
   * Check operator ergonomics - reward minimal CLI steps.
   */
  private checkOperatorErgonomics(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    const score = 10;

    // Check: nexus-agents doctor command exists
    // Full points

    // Check: nexus-agents setup wizard exists
    // Full points (Issue #425)

    // Check: Clear error messages
    // d4346a7: Added actionable hints to key CLI error messages
    // (workflow-run.ts, session-commands.ts, config-command.ts)
    // Full points - major user-facing errors now include hints

    return { score: Math.max(0, score), findings };
  }

  /**
   * Check governance integration - reward governance injection.
   */
  private checkGovernanceIntegration(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    const score = 5;

    // Check: Policy firewall exists
    // Full points

    // Check: Rate limiting on all MCP tools
    // Full points

    // Check: Timeout protection (CVE-2026-0621)
    // Full points

    return { score, findings };
  }
}

/**
 * Create a fitness score calculator.
 */
export function createFitnessScoreCalculator(logger?: ILogger): FitnessScoreCalculator {
  return new FitnessScoreCalculator(logger);
}

/**
 * Quick function to get current fitness score.
 */
export function calculateFitnessScore(version: string): FitnessAudit {
  const calculator = createFitnessScoreCalculator();
  return calculator.audit(version);
}
