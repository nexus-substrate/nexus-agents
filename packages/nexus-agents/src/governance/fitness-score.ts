/**
 * CLI Orchestration Fitness Score — real filesystem analysis.
 * Penalizes duplicate paths, hidden behavior, non-determinism, poor
 * observability, config sprawl, cross-layer coupling. Rewards canonical
 * paths, determinism, telemetry, CLI ergonomics, governance.
 * @module governance/fitness-score
 */

/* eslint-disable max-lines -- cohesive fitness calculator (governance allows 400-600) */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger, type ILogger } from '../core/index.js';

/** Find package root by walking up from current dir to find package.json with our name */
function findPkgRoot(): string {
  let dir = import.meta.dirname;
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const content = readFileSync(pkgPath, 'utf-8');
      if (content.includes('"nexus-agents"')) return dir;
    }
    dir = join(dir, '..');
  }
  return join(import.meta.dirname, '../..');
}

const PKG_ROOT = findPkgRoot();
const SRC_ROOT = join(PKG_ROOT, 'src');
const REPO_ROOT = join(PKG_ROOT, '../..');
const DOCS_ROOT = join(REPO_ROOT, 'docs');

const DETERMINISM_EXCLUDES: RegExp[] = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /random-provider\.ts$/,
  /time-provider\.ts$/,
];

// =========================================================================
// Filesystem utility methods (inlined from scripts/fitness-utils.ts)
// =========================================================================

function countFiles(dir: string, pattern: RegExp): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && !entry.startsWith('.')) {
      count += countFiles(fullPath, pattern);
    } else if (pattern.test(entry)) {
      count++;
    }
  }
  return count;
}

function fileContains(filePath: string, pattern: RegExp): boolean {
  if (!existsSync(filePath)) return false;
  return pattern.test(readFileSync(filePath, 'utf-8'));
}

function isExcluded(entry: string, excludePatterns?: RegExp[]): boolean {
  return excludePatterns?.some((p) => p.test(entry)) ?? false;
}

function countMatchesInFile(fullPath: string, contentPattern: RegExp): number {
  const matches = readFileSync(fullPath, 'utf-8').match(contentPattern);
  return matches?.length ?? 0;
}

function countPatternInDir(
  dir: string,
  filePattern: RegExp,
  contentPattern: RegExp,
  excludePatterns?: RegExp[]
): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      count += countPatternInDir(fullPath, filePattern, contentPattern, excludePatterns);
    } else if (filePattern.test(entry) && !isExcluded(entry, excludePatterns)) {
      count += countMatchesInFile(fullPath, contentPattern);
    }
  }
  return count;
}

// =========================================================================
// Public types
// =========================================================================

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

/** Clamp score to [0, max]. */
function clamp(score: number, max: number): number {
  return Math.max(0, Math.min(max, score));
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

  /** Register default fitness checks. */
  private registerDefaultChecks(): void {
    const reg = (
      dimension: keyof FitnessDimensions,
      maxPoints: number,
      name: string,
      check: () => FitnessCheckResult
    ): void => {
      this.checks.push({ dimension, maxPoints, name, check });
    };
    reg('canonicalPaths', 20, 'Canonical Paths', () => this.checkCanonicalPaths());
    reg('explicitBehavior', 15, 'Explicit Behavior', () => this.checkExplicitBehavior());
    reg('determinism', 15, 'Determinism', () => this.checkDeterminism());
    reg('observability', 15, 'Observability', () => this.checkObservability());
    reg('configSimplicity', 10, 'Config Simplicity', () => this.checkConfigSimplicity());
    reg('layerSeparation', 10, 'Layer Separation', () => this.checkLayerSeparation());
    reg('operatorErgonomics', 10, 'Operator Ergonomics', () => this.checkOperatorErgonomics());
    reg('governanceIntegration', 5, 'Governance Integration', () =>
      this.checkGovernanceIntegration()
    );
  }

  /** Run full fitness audit. */
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
  // Individual Checks — real filesystem analysis
  // =========================================================================

  /** Check canonical paths: penalize duplicate router implementations. */
  private checkCanonicalPaths(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 20;

    const routerCount = countFiles(join(SRC_ROOT, 'cli-adapters'), /router\.ts$/);
    if (routerCount > 5) {
      const excess = routerCount - 5;
      const deduction = Math.min(5, excess);
      score -= deduction;
      findings.push(
        this.finding(
          'canonicalPaths',
          'warning',
          `${String(routerCount)} router implementations found (target: <=5)`,
          deduction,
          'Consolidate duplicate routers into CompositeRouter'
        )
      );
    }

    if (existsSync(join(SRC_ROOT, 'cli-adapters/composite-router.ts'))) {
      score += 2;
    } else {
      score -= 3;
      findings.push(
        this.finding(
          'canonicalPaths',
          'critical',
          'CompositeRouter missing — no unified routing entry point',
          3
        )
      );
    }

    score = this.checkOrchestratorInterface(score, findings);

    return { score: clamp(score, 20), findings };
  }

  /** Sub-check for IOrchestrator interface and adapter wiring. */
  private checkOrchestratorInterface(score: number, findings: FitnessFinding[]): number {
    const orchPath = join(SRC_ROOT, 'core/types/orchestrator.ts');
    if (existsSync(orchPath) && fileContains(orchPath, /interface IOrchestrator/)) {
      score += 3;
    } else {
      score -= 2;
      findings.push(
        this.finding('canonicalPaths', 'warning', 'No IOrchestrator interface in core/types', 2)
      );
    }

    const adapterPath = join(SRC_ROOT, 'orchestration/orchestrator-adapters.ts');
    if (existsSync(adapterPath) && fileContains(adapterPath, /TechLeadAdapter|PuppeteerAdapter/)) {
      score += 2;
    }

    return score;
  }

  /**
   * Check explicit behavior: penalize hidden/magic behavior.
   * TODO: This dimension lacks strong filesystem signals. Currently checks
   * for NEXUS_ALLOW_MOCK_ORCHESTRATION guard and magic routing patterns.
   * Future: add AST-based detection of implicit fallbacks.
   */
  private checkExplicitBehavior(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 15;

    // Check: mock orchestration requires explicit env var opt-in
    const mockGuardCount = countPatternInDir(
      SRC_ROOT,
      /\.ts$/,
      /NEXUS_ALLOW_MOCK_ORCHESTRATION/g,
      DETERMINISM_EXCLUDES
    );
    if (mockGuardCount === 0) {
      score -= 3;
      findings.push(
        this.finding(
          'explicitBehavior',
          'warning',
          'No NEXUS_ALLOW_MOCK_ORCHESTRATION guard found — mock fallback may be implicit',
          3,
          'Require explicit env var for mock orchestration'
        )
      );
    }

    // Check: magic routing patterns (delegate without explicit capability match)
    const magicRouting = countPatternInDir(
      SRC_ROOT,
      /\.ts$/,
      /fallback.*=.*true|implicitRoute/g,
      DETERMINISM_EXCLUDES
    );
    if (magicRouting > 5) {
      const deduction = Math.min(3, Math.floor(magicRouting / 3));
      score -= deduction;
      findings.push(
        this.finding(
          'explicitBehavior',
          'info',
          `${String(magicRouting)} implicit fallback/routing patterns detected`,
          deduction
        )
      );
    }

    return { score: clamp(score, 15), findings };
  }

  /** Check determinism: penalize unseeded random and raw Date.now(). */
  private checkDeterminism(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 15;

    score = this.checkRandomDeterminism(score, findings);
    score = this.checkTimeDeterminism(score, findings);

    return { score: clamp(score, 15), findings };
  }

  /** Sub-check for Math.random() and injectable random provider. */
  private checkRandomDeterminism(score: number, findings: FitnessFinding[]): number {
    const randomCount = countPatternInDir(
      SRC_ROOT,
      /\.ts$/,
      /Math\.random\(\)/g,
      DETERMINISM_EXCLUDES
    );
    if (randomCount > 10) {
      const deduction = Math.min(5, Math.floor(randomCount / 5));
      score -= deduction;
      findings.push(
        this.finding(
          'determinism',
          'warning',
          `${String(randomCount)} unseeded Math.random() calls in production code`,
          deduction,
          'Use getRandomProvider() for injectable randomness'
        )
      );
    } else if (randomCount === 0) {
      score += 2;
    }

    if (existsSync(join(SRC_ROOT, 'core/random-provider.ts'))) {
      score += 1;
    }
    const randomUsage = countPatternInDir(
      SRC_ROOT,
      /\.ts$/,
      /getRandomProvider\(\)/g,
      DETERMINISM_EXCLUDES
    );
    if (randomUsage > 5) {
      score += 1;
    }

    return score;
  }

  /** Sub-check for Date.now() and injectable time provider. */
  private checkTimeDeterminism(score: number, findings: FitnessFinding[]): number {
    const dateNowCount = countPatternInDir(
      SRC_ROOT,
      /\.ts$/,
      /Date\.now\(\)/g,
      DETERMINISM_EXCLUDES
    );
    if (dateNowCount > 50) {
      score -= 2;
      findings.push(
        this.finding(
          'determinism',
          'info',
          `${String(dateNowCount)} Date.now() calls in production code`,
          2,
          'Use getTimeProvider() for injectable time'
        )
      );
    }

    if (existsSync(join(SRC_ROOT, 'core/time-provider.ts'))) {
      score += 1;
    }
    const timeUsage = countPatternInDir(
      SRC_ROOT,
      /\.ts$/,
      /getTimeProvider\(\)/g,
      DETERMINISM_EXCLUDES
    );
    if (timeUsage > 10) {
      score += 1;
    }

    return score;
  }

  /** Check observability: reward tracing, logging, and audit coverage. */
  private checkObservability(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 15;

    if (existsSync(join(SRC_ROOT, 'observability/swarm-observer.ts'))) {
      score += 3;
    } else {
      score -= 3;
      findings.push(
        this.finding(
          'observability',
          'warning',
          'No SwarmObserver found',
          3,
          'Add observability/swarm-observer.ts'
        )
      );
    }

    if (existsSync(join(SRC_ROOT, 'core/trace.ts'))) {
      score += 2;
    }

    const loggerCount = countPatternInDir(SRC_ROOT, /\.ts$/, /createLogger\(/g);
    if (loggerCount > 50) {
      score += 2;
    } else {
      findings.push(
        this.finding(
          'observability',
          'info',
          `Only ${String(loggerCount)} createLogger() calls (target: >50)`,
          0
        )
      );
    }

    if (existsSync(join(SRC_ROOT, 'audit'))) {
      score += 2;
    }

    return { score: clamp(score, 15), findings };
  }

  /** Check config simplicity: penalize excessive schema sprawl. */
  private checkConfigSimplicity(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 10;

    const schemaCount = countFiles(join(SRC_ROOT, 'config'), /schema.*\.ts$/);
    if (schemaCount > 10) {
      score -= 2;
      findings.push(
        this.finding(
          'configSimplicity',
          'info',
          `${String(schemaCount)} config schemas (target: <=10)`,
          2,
          'Consolidate related schemas'
        )
      );
    } else {
      score += 1;
    }

    if (existsSync(join(SRC_ROOT, 'config/config-loader.ts'))) {
      score += 2;
    }
    if (existsSync(join(SRC_ROOT, 'config/config-manager.ts'))) {
      score += 1;
    }

    return { score: clamp(score, 10), findings };
  }

  /** Check layer separation: penalize cross-layer imports. */
  private checkLayerSeparation(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 10;

    const adapterAgentImports = countPatternInDir(
      join(SRC_ROOT, 'adapters'),
      /\.ts$/,
      /from ['"]\.\.\/agents\//g
    );
    if (adapterAgentImports > 0) {
      const deduction = Math.min(5, adapterAgentImports);
      score -= deduction;
      findings.push(
        this.finding(
          'layerSeparation',
          'warning',
          `${String(adapterAgentImports)} adapter->agent import violations`,
          deduction,
          'Adapters should not import from agents layer'
        )
      );
    } else {
      score += 2;
    }

    const coreMcpImports = countPatternInDir(
      join(SRC_ROOT, 'core'),
      /\.ts$/,
      /from ['"]\.\.\/mcp\//g
    );
    if (coreMcpImports > 0) {
      const deduction = Math.min(3, coreMcpImports);
      score -= deduction;
      findings.push(
        this.finding(
          'layerSeparation',
          'critical',
          `${String(coreMcpImports)} core->MCP import violations`,
          deduction,
          'Core must not depend on MCP layer'
        )
      );
    } else {
      score += 1;
    }

    return { score: clamp(score, 10), findings };
  }

  /** Check operator ergonomics: reward rich CLI commands. */
  private checkOperatorErgonomics(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 10;

    const commandCount = countFiles(join(SRC_ROOT, 'cli'), /\.ts$/);
    if (commandCount >= 20) {
      score += 3;
    } else {
      findings.push(
        this.finding(
          'operatorErgonomics',
          'info',
          `${String(commandCount)} CLI commands (target: >=20)`,
          0
        )
      );
    }

    score = this.checkCliCommands(score, findings);

    return { score: clamp(score, 10), findings };
  }

  /** Sub-check for essential CLI commands (doctor, setup, demo, config). */
  private checkCliCommands(score: number, findings: FitnessFinding[]): number {
    const commands: Array<[string, string, number]> = [
      ['cli/doctor.ts', 'Doctor command', 2],
      ['cli/setup-command.ts', 'Setup wizard', 2],
      ['cli/demo-command.ts', 'Demo command', 1],
      ['cli/config-command.ts', 'Config command', 1],
    ];

    for (const [path, name, bonus] of commands) {
      if (existsSync(join(SRC_ROOT, path))) {
        score += bonus;
      } else {
        findings.push(this.finding('operatorErgonomics', 'info', `Missing ${name} (${path})`, 0));
      }
    }

    return score;
  }

  /** Check governance integration: policy firewall, rate limiter, docs. */
  private checkGovernanceIntegration(): FitnessCheckResult {
    const findings: FitnessFinding[] = [];
    let score = 5;

    score = this.checkGovernanceDocs(score, findings);
    score = this.checkGovernanceInfra(score, findings);

    return { score: clamp(score, 5), findings };
  }

  /** Sub-check for governance documentation artifacts. */
  private checkGovernanceDocs(score: number, findings: FitnessFinding[]): number {
    if (!existsSync(join(REPO_ROOT, 'CLAUDE.md'))) {
      score -= 3;
      findings.push(
        this.finding('governanceIntegration', 'critical', 'No CLAUDE.md governance document', 3)
      );
    } else {
      score += 1;
    }

    if (existsSync(join(DOCS_ROOT, 'architecture/wiring-graph.json'))) {
      score += 1;
    }

    if (existsSync(join(DOCS_ROOT, 'adr'))) {
      score += 1;
    } else {
      findings.push(this.finding('governanceIntegration', 'info', 'No ADR directory', 0));
    }

    return score;
  }

  /** Sub-check for governance runtime infrastructure. */
  private checkGovernanceInfra(score: number, findings: FitnessFinding[]): number {
    const hasPolicyFirewall =
      countPatternInDir(join(SRC_ROOT, 'security'), /\.ts$/, /PolicyGate|policyFirewall/g) > 0;
    if (hasPolicyFirewall) {
      score += 1;
    } else {
      findings.push(
        this.finding(
          'governanceIntegration',
          'warning',
          'No policy firewall detected in security layer',
          0
        )
      );
    }

    const hasRateLimiter = countPatternInDir(SRC_ROOT, /\.ts$/, /RateLimiter|rateLimiter/g) > 0;
    if (hasRateLimiter) {
      score += 1;
    }

    return score;
  }

  /** Helper to create a FitnessFinding with defaults. */
  private finding(
    dimension: keyof FitnessDimensions,
    severity: FitnessFinding['severity'],
    description: string,
    pointsDeducted: number,
    suggestion?: string
  ): FitnessFinding {
    const base: FitnessFinding = { dimension, severity, description, pointsDeducted };
    if (suggestion !== undefined) {
      return { ...base, suggestion };
    }
    return base;
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
