#!/usr/bin/env npx tsx

/**
 * CLI Orchestration Fitness Score
 *
 * Measures system fitness for CLI agent usage and orchestration.
 * Per System Mandate Loop I - Architectural Fitness Function.
 *
 * Penalizes:
 * - Duplicate paths to accomplish same workflow
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
 * @module scripts/fitness-score
 * (Source: System Mandate Loop I)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(import.meta.url.replace('file://', '')), '..');
const SRC_ROOT = join(ROOT, 'packages/nexus-agents/src');
const DOCS_ROOT = join(ROOT, 'docs');

interface FitnessComponent {
  readonly name: string;
  readonly score: number;
  readonly maxScore: number;
  readonly details: string[];
  readonly penalties: string[];
  readonly rewards: string[];
}

interface FitnessResult {
  readonly total: number;
  readonly maxTotal: number;
  readonly percentage: number;
  readonly components: FitnessComponent[];
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly assessmentDate: string;
}

/**
 * Count files matching a pattern in a directory.
 */
function countFiles(dir: string, pattern: RegExp): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  const entries = readdirSync(dir);
  for (const entry of entries) {
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

/**
 * Check if a file contains a pattern.
 */
function fileContains(filePath: string, pattern: RegExp): boolean {
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf-8');
  return pattern.test(content);
}

/**
 * Count pattern occurrences in directory.
 */
function isExcluded(entry: string, excludePatterns: RegExp[] | undefined): boolean {
  return excludePatterns?.some((p) => p.test(entry)) ?? false;
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
      const matches = readFileSync(fullPath, 'utf-8').match(contentPattern);
      count += matches?.length ?? 0;
    }
  }
  return count;
}

/**
 * Assess canonical path clarity.
 */
function assessCanonicalPaths(): FitnessComponent {
  const penalties: string[] = [];
  const rewards: string[] = [];
  let score = 20;

  // Check for multiple router implementations
  const routerCount = countFiles(join(SRC_ROOT, 'cli-adapters'), /router\.ts$/);
  if (routerCount > 5) {
    penalties.push(
      `${String(routerCount)} router implementations (target: 1 canonical + strategies)`
    );
    score -= Math.min(5, routerCount - 5);
  } else {
    rewards.push('Router count within target');
  }

  // Check for CompositeRouter as canonical
  if (existsSync(join(SRC_ROOT, 'cli-adapters/composite-router.ts'))) {
    rewards.push('CompositeRouter exists as orchestrator');
    score += 2;
  }

  // Check for multiple orchestrators
  const hasMultipleOrchestrators =
    existsSync(join(SRC_ROOT, 'agents/tech-lead.ts')) &&
    existsSync(join(SRC_ROOT, 'agents/orchestration/puppeteer-orchestrator.ts')) &&
    existsSync(join(SRC_ROOT, 'workflows/workflow-engine.ts'));

  if (hasMultipleOrchestrators) {
    penalties.push('3 separate orchestration systems without unified interface');
    score -= 5;
  }

  // Check for IOrchestrator interface (defined in orchestrator.ts, exported from index.ts)
  const hasOrchestratorInterface =
    existsSync(join(SRC_ROOT, 'core/types/orchestrator.ts')) &&
    fileContains(join(SRC_ROOT, 'core/types/orchestrator.ts'), /interface IOrchestrator/);
  if (hasOrchestratorInterface) {
    rewards.push('IOrchestrator interface defined');
    score += 3;
  } else {
    penalties.push('No IOrchestrator interface');
    score -= 2;
  }

  return {
    name: 'Canonical Paths',
    score: Math.max(0, Math.min(20, score)),
    maxScore: 20,
    details: [
      `Routers: ${String(routerCount)}`,
      `Unified interface: ${String(hasOrchestratorInterface)}`,
    ],
    penalties,
    rewards,
  };
}

/**
 * Assess determinism.
 */
const DETERMINISM_EXCLUDES = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /random-provider\.ts$/,
  /time-provider\.ts$/,
];

function assessDeterminism(): FitnessComponent {
  const penalties: string[] = [],
    rewards: string[] = [];
  let score = 15;
  const randomCount = countPatternInDir(
    SRC_ROOT,
    /\.ts$/,
    /Math\.random\(\)/g,
    DETERMINISM_EXCLUDES
  );
  const dateNowCount = countPatternInDir(SRC_ROOT, /\.ts$/, /Date\.now\(\)/g, DETERMINISM_EXCLUDES);
  const timeUsage = countPatternInDir(
    SRC_ROOT,
    /\.ts$/,
    /getTimeProvider\(\)/g,
    DETERMINISM_EXCLUDES
  );
  const randomUsage = countPatternInDir(
    SRC_ROOT,
    /\.ts$/,
    /getRandomProvider\(\)/g,
    DETERMINISM_EXCLUDES
  );

  if (randomCount > 10) {
    penalties.push(`${String(randomCount)} unseeded Math.random() calls`);
    score -= Math.min(5, Math.floor(randomCount / 5));
  } else if (randomCount === 0) {
    rewards.push('No unseeded random calls');
    score += 2;
  }

  if (existsSync(join(SRC_ROOT, 'core/random-provider.ts'))) {
    rewards.push('Injectable random provider exists');
    score += 1;
  }
  if (randomUsage > 5) {
    rewards.push(`${String(randomUsage)} uses of injectable random provider`);
    score += 1;
  }

  if (dateNowCount > 50) {
    penalties.push(`${String(dateNowCount)} Date.now() calls (consider injection)`);
    score -= 2;
  } else if (dateNowCount < 10) {
    rewards.push('Minimal direct Date.now() usage');
  }

  if (existsSync(join(SRC_ROOT, 'core/time-provider.ts'))) {
    rewards.push('Injectable time provider exists');
    score += 1;
  }
  if (timeUsage > 10) {
    rewards.push(`${String(timeUsage)} uses of injectable time provider`);
    score += 1;
  }

  return {
    name: 'Determinism',
    score: Math.max(0, Math.min(15, score)),
    maxScore: 15,
    details: [
      `Random: ${String(randomCount)}`,
      `Date.now: ${String(dateNowCount)}`,
      `Time provider: ${String(timeUsage)}`,
      `Random provider: ${String(randomUsage)}`,
    ],
    penalties,
    rewards,
  };
}

/**
 * Assess observability.
 */
function assessObservability(): FitnessComponent {
  const penalties: string[] = [];
  const rewards: string[] = [];
  let score = 15;

  // Check for SwarmObserver
  if (existsSync(join(SRC_ROOT, 'observability/swarm-observer.ts'))) {
    rewards.push('SwarmObserver exists');
    score += 3;
  } else {
    penalties.push('No SwarmObserver');
    score -= 3;
  }

  // Check for trace exporter
  if (existsSync(join(SRC_ROOT, 'core/trace.ts'))) {
    rewards.push('Trace exporter exists');
    score += 2;
  }

  // Check for structured logging
  const loggerCount = countPatternInDir(SRC_ROOT, /\.ts$/, /createLogger\(/g);
  if (loggerCount > 50) {
    rewards.push(`Strong logging adoption (${String(loggerCount)} uses)`);
    score += 2;
  }

  // Check for audit logging
  if (existsSync(join(SRC_ROOT, 'audit'))) {
    rewards.push('Audit logging module exists');
    score += 2;
  }

  return {
    name: 'Observability',
    score: Math.max(0, Math.min(15, score)),
    maxScore: 15,
    details: [`Logger uses: ${String(loggerCount)}`],
    penalties,
    rewards,
  };
}

/**
 * Assess CLI ergonomics.
 */
function assessCliErgonomics(): FitnessComponent {
  const penalties: string[] = [];
  const rewards: string[] = [];
  let score = 15;

  // Check for CLI commands
  const commandCount = countFiles(join(SRC_ROOT, 'cli'), /\.ts$/);
  if (commandCount >= 20) {
    rewards.push(`Rich CLI with ${String(commandCount)} commands`);
    score += 3;
  }

  // Check for doctor command
  if (existsSync(join(SRC_ROOT, 'cli/doctor.ts'))) {
    rewards.push('Doctor command for health checks');
    score += 2;
  }

  // Check for setup wizard
  if (existsSync(join(SRC_ROOT, 'cli/setup-command.ts'))) {
    rewards.push('Setup wizard exists');
    score += 2;
  }

  // Check for help/demo
  if (existsSync(join(SRC_ROOT, 'cli/demo-command.ts'))) {
    rewards.push('Demo command for onboarding');
    score += 1;
  }

  // Check for config command
  if (existsSync(join(SRC_ROOT, 'cli/config-command.ts'))) {
    rewards.push('Config management command');
    score += 1;
  }

  return {
    name: 'CLI Ergonomics',
    score: Math.max(0, Math.min(15, score)),
    maxScore: 15,
    details: [`CLI commands: ${String(commandCount)}`],
    penalties,
    rewards,
  };
}

/**
 * Assess governance.
 */
function assessGovernance(): FitnessComponent {
  const penalties: string[] = [];
  const rewards: string[] = [];
  let score = 15;

  // Check for CLAUDE.md
  if (existsSync(join(ROOT, 'CLAUDE.md'))) {
    rewards.push('CLAUDE.md governance document exists');
    score += 3;
  } else {
    penalties.push('No CLAUDE.md');
    score -= 5;
  }

  // Check for wiring-graph.json
  if (existsSync(join(DOCS_ROOT, 'architecture/wiring-graph.json'))) {
    rewards.push('Wiring graph documented');
    score += 2;
  } else {
    penalties.push('No wiring-graph.json');
    score -= 2;
  }

  // Check for completeness score
  if (existsSync(join(DOCS_ROOT, 'metrics/completeness-score.json'))) {
    rewards.push('Completeness score tracked');
    score += 2;
  }

  // Check for redundancy analysis
  if (existsSync(join(DOCS_ROOT, 'architecture/redundancy-analysis.md'))) {
    rewards.push('Redundancy analysis documented');
    score += 2;
  }

  // Check for ADR directory
  if (existsSync(join(DOCS_ROOT, 'adr'))) {
    rewards.push('ADR decision records exist');
    score += 1;
  } else {
    penalties.push('No ADR directory');
    score -= 1;
  }

  return {
    name: 'Governance',
    score: Math.max(0, Math.min(15, score)),
    maxScore: 15,
    details: [],
    penalties,
    rewards,
  };
}

/**
 * Assess cross-layer coupling.
 */
function assessCoupling(): FitnessComponent {
  const penalties: string[] = [];
  const rewards: string[] = [];
  let score = 10;

  // Check for adapters importing agents
  const adapterAgentImports = countPatternInDir(
    join(SRC_ROOT, 'adapters'),
    /\.ts$/,
    /from ['"]\.\.\/agents\//g
  );
  if (adapterAgentImports > 0) {
    penalties.push(`${String(adapterAgentImports)} adapter→agent imports (layer violation)`);
    score -= Math.min(5, adapterAgentImports);
  } else {
    rewards.push('No adapter→agent layer violations');
    score += 2;
  }

  // Check for core importing MCP
  const coreMcpImports = countPatternInDir(
    join(SRC_ROOT, 'core'),
    /\.ts$/,
    /from ['"]\.\.\/mcp\//g
  );
  if (coreMcpImports > 0) {
    penalties.push(`${String(coreMcpImports)} core→MCP imports (layer violation)`);
    score -= Math.min(3, coreMcpImports);
  } else {
    rewards.push('No core→MCP layer violations');
    score += 1;
  }

  return {
    name: 'Layer Coupling',
    score: Math.max(0, Math.min(10, score)),
    maxScore: 10,
    details: [],
    penalties,
    rewards,
  };
}

/**
 * Assess configuration surface.
 */
function assessConfigSurface(): FitnessComponent {
  const penalties: string[] = [];
  const rewards: string[] = [];
  let score = 10;

  // Count config schema files
  const schemaCount = countFiles(join(SRC_ROOT, 'config'), /schema.*\.ts$/);
  if (schemaCount > 10) {
    penalties.push(`${String(schemaCount)} config schemas (complexity)`);
    score -= 2;
  } else {
    rewards.push('Config schema count reasonable');
    score += 1;
  }

  // Check for unified config loader
  if (existsSync(join(SRC_ROOT, 'config/config-loader.ts'))) {
    rewards.push('Unified config loader exists');
    score += 2;
  }

  // Check for config manager
  if (existsSync(join(SRC_ROOT, 'config/config-manager.ts'))) {
    rewards.push('Runtime config manager exists');
    score += 1;
  }

  return {
    name: 'Config Surface',
    score: Math.max(0, Math.min(10, score)),
    maxScore: 10,
    details: [`Config schemas: ${String(schemaCount)}`],
    penalties,
    rewards,
  };
}

/**
 * Main fitness assessment.
 */
function assessFitness(): FitnessResult {
  const components = [
    assessCanonicalPaths(),
    assessDeterminism(),
    assessObservability(),
    assessCliErgonomics(),
    assessGovernance(),
    assessCoupling(),
    assessConfigSurface(),
  ];

  const total = components.reduce((sum, c) => sum + c.score, 0);
  const maxTotal = components.reduce((sum, c) => sum + c.maxScore, 0);
  const percentage = Math.round((total / maxTotal) * 100);

  return {
    total,
    maxTotal,
    percentage,
    components,
    trend: 'stable', // Would compare with previous run
    assessmentDate: new Date().toISOString(),
  };
}

/**
 * Print results.
 */
/* eslint-disable no-console */
function printResults(result: FitnessResult): void {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              CLI ORCHESTRATION FITNESS SCORE                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(
    `Total Score: ${String(result.total)}/${String(result.maxTotal)} (${String(result.percentage)}%)`
  );
  console.log(`Trend: ${result.trend}`);
  console.log(`Date: ${result.assessmentDate}`);
  console.log('');

  for (const component of result.components) {
    const bar = '█'.repeat(Math.floor((component.score / component.maxScore) * 20));
    const empty = '░'.repeat(20 - bar.length);
    console.log(
      `${component.name.padEnd(18)} [${bar}${empty}] ${String(component.score)}/${String(component.maxScore)}`
    );

    for (const reward of component.rewards) {
      console.log(`  ✓ ${reward}`);
    }
    for (const penalty of component.penalties) {
      console.log(`  ✗ ${penalty}`);
    }
  }

  console.log('');
  if (result.percentage >= 80) {
    console.log('✓ Fitness score GOOD (≥80%)');
  } else if (result.percentage >= 60) {
    console.log('⚠ Fitness score FAIR (60-79%)');
  } else {
    console.log('✗ Fitness score POOR (<60%)');
  }
}
/* eslint-enable no-console */

// Run assessment
const result = assessFitness();
printResults(result);

// Write JSON output
const outputPath = join(DOCS_ROOT, 'metrics/fitness-score.json');
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2));

process.exit(result.percentage >= 60 ? 0 : 1);
