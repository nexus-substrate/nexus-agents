#!/usr/bin/env npx tsx

/**
 * CLI Orchestration Fitness Score
 * Per System Mandate Loop I - Architectural Fitness Function.
 * @module scripts/fitness-score
 */

import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { countFiles, countPatternInDir, fileContains } from './fitness-utils.js';
import type { FitnessComponent, FitnessResult } from './fitness-utils.js';
import { ROOT, SRC_ROOT, DOCS_ROOT } from './script-paths.js';

const DETERMINISM_EXCLUDES = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /random-provider\.ts$/,
  /time-provider\.ts$/,
];

function assessCanonicalPaths(): FitnessComponent {
  const penalties: string[] = [],
    rewards: string[] = [];
  let score = 20;

  const routerCount = countFiles(join(SRC_ROOT, 'cli-adapters'), /router\.ts$/);
  if (routerCount > 5) {
    penalties.push(`${String(routerCount)} router implementations`);
    score -= Math.min(5, routerCount - 5);
  } else {
    rewards.push('Router count within target');
  }

  if (existsSync(join(SRC_ROOT, 'cli-adapters/composite-router.ts'))) {
    rewards.push('CompositeRouter exists');
    score += 2;
  }

  const hasInterface =
    existsSync(join(SRC_ROOT, 'core/types/orchestrator.ts')) &&
    fileContains(join(SRC_ROOT, 'core/types/orchestrator.ts'), /interface IOrchestrator/);
  const hasAdapters =
    existsSync(join(SRC_ROOT, 'orchestration/orchestrator-adapters.ts')) &&
    fileContains(join(SRC_ROOT, 'orchestration/orchestrator-adapters.ts'), /TechLeadAdapter/) &&
    fileContains(join(SRC_ROOT, 'orchestration/orchestrator-adapters.ts'), /PuppeteerAdapter/);

  if (hasInterface) {
    rewards.push('IOrchestrator interface defined');
    score += 3;
  } else {
    penalties.push('No IOrchestrator interface');
    score -= 2;
  }

  if (hasAdapters) {
    rewards.push('Unified orchestrator adapters');
    score += 2;
  }

  return {
    name: 'Canonical Paths',
    score: Math.max(0, Math.min(20, score)),
    maxScore: 20,
    details: [`Routers: ${String(routerCount)}`],
    penalties,
    rewards,
  };
}

function countDeterminismPattern(pattern: RegExp): number {
  return countPatternInDir(SRC_ROOT, /\.ts$/, pattern, DETERMINISM_EXCLUDES);
}

function assessDeterminism(): FitnessComponent {
  const penalties: string[] = [],
    rewards: string[] = [];
  let score = 15;

  const randomCount = countDeterminismPattern(/Math\.random\(\)/g);
  const dateNowCount = countDeterminismPattern(/Date\.now\(\)/g);
  const timeUsage = countDeterminismPattern(/getTimeProvider\(\)/g);
  const randomUsage = countDeterminismPattern(/getRandomProvider\(\)/g);

  if (randomCount > 10) {
    penalties.push(`${String(randomCount)} unseeded Math.random()`);
    score -= Math.min(5, Math.floor(randomCount / 5));
  } else if (randomCount === 0) {
    rewards.push('No unseeded random calls');
    score += 2;
  }

  if (existsSync(join(SRC_ROOT, 'core/random-provider.ts'))) {
    rewards.push('Injectable random provider');
    score += 1;
  }
  if (randomUsage > 5) {
    rewards.push(`${String(randomUsage)} injectable random uses`);
    score += 1;
  }

  if (dateNowCount > 50) {
    penalties.push(`${String(dateNowCount)} Date.now() calls`);
    score -= 2;
  } else if (dateNowCount < 10) {
    rewards.push('Minimal Date.now() usage');
  }

  if (existsSync(join(SRC_ROOT, 'core/time-provider.ts'))) {
    rewards.push('Injectable time provider');
    score += 1;
  }
  if (timeUsage > 10) {
    rewards.push(`${String(timeUsage)} injectable time uses`);
    score += 1;
  }

  return {
    name: 'Determinism',
    score: Math.max(0, Math.min(15, score)),
    maxScore: 15,
    details: [`Random: ${String(randomCount)}`, `Date.now: ${String(dateNowCount)}`],
    penalties,
    rewards,
  };
}

function assessObservability(): FitnessComponent {
  const penalties: string[] = [],
    rewards: string[] = [];
  let score = 15;

  if (existsSync(join(SRC_ROOT, 'observability/swarm-observer.ts'))) {
    rewards.push('SwarmObserver exists');
    score += 3;
  } else {
    penalties.push('No SwarmObserver');
    score -= 3;
  }

  if (existsSync(join(SRC_ROOT, 'core/trace.ts'))) {
    rewards.push('Trace exporter exists');
    score += 2;
  }

  const loggerCount = countPatternInDir(SRC_ROOT, /\.ts$/, /createLogger\(/g);
  if (loggerCount > 50) {
    rewards.push(`Strong logging (${String(loggerCount)} uses)`);
    score += 2;
  }

  if (existsSync(join(SRC_ROOT, 'audit'))) {
    rewards.push('Audit logging module');
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

function assessCliErgonomics(): FitnessComponent {
  const penalties: string[] = [],
    rewards: string[] = [];
  let score = 15;
  const commandCount = countFiles(join(SRC_ROOT, 'cli'), /\.ts$/);

  if (commandCount >= 20) {
    rewards.push(`Rich CLI (${String(commandCount)} commands)`);
    score += 3;
  }
  if (existsSync(join(SRC_ROOT, 'cli/doctor.ts'))) {
    rewards.push('Doctor command');
    score += 2;
  }
  if (existsSync(join(SRC_ROOT, 'cli/setup-command.ts'))) {
    rewards.push('Setup wizard');
    score += 2;
  }
  if (existsSync(join(SRC_ROOT, 'cli/demo-command.ts'))) {
    rewards.push('Demo command');
    score += 1;
  }
  if (existsSync(join(SRC_ROOT, 'cli/config-command.ts'))) {
    rewards.push('Config command');
    score += 1;
  }

  return {
    name: 'CLI Ergonomics',
    score: Math.max(0, Math.min(15, score)),
    maxScore: 15,
    details: [`Commands: ${String(commandCount)}`],
    penalties,
    rewards,
  };
}

function assessGovernance(): FitnessComponent {
  const penalties: string[] = [],
    rewards: string[] = [];
  let score = 15;

  if (existsSync(join(ROOT, 'CLAUDE.md'))) {
    rewards.push('CLAUDE.md exists');
    score += 3;
  } else {
    penalties.push('No CLAUDE.md');
    score -= 5;
  }

  if (existsSync(join(DOCS_ROOT, 'architecture/wiring-graph.json'))) {
    rewards.push('Wiring graph');
    score += 2;
  } else {
    penalties.push('No wiring-graph.json');
    score -= 2;
  }

  if (existsSync(join(DOCS_ROOT, 'metrics/completeness-score.json'))) {
    rewards.push('Completeness tracked');
    score += 2;
  }
  if (existsSync(join(DOCS_ROOT, 'architecture/redundancy-analysis.md'))) {
    rewards.push('Redundancy analysis');
    score += 2;
  }
  if (existsSync(join(DOCS_ROOT, 'adr'))) {
    rewards.push('ADR records');
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

function assessCoupling(): FitnessComponent {
  const penalties: string[] = [],
    rewards: string[] = [];
  let score = 10;

  const adapterAgentImports = countPatternInDir(
    join(SRC_ROOT, 'adapters'),
    /\.ts$/,
    /from ['"]\.\.\/agents\//g
  );
  if (adapterAgentImports > 0) {
    penalties.push(`${String(adapterAgentImports)} adapter→agent imports`);
    score -= Math.min(5, adapterAgentImports);
  } else {
    rewards.push('No adapter→agent violations');
    score += 2;
  }

  const coreMcpImports = countPatternInDir(
    join(SRC_ROOT, 'core'),
    /\.ts$/,
    /from ['"]\.\.\/mcp\//g
  );
  if (coreMcpImports > 0) {
    penalties.push(`${String(coreMcpImports)} core→MCP imports`);
    score -= Math.min(3, coreMcpImports);
  } else {
    rewards.push('No core→MCP violations');
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

function assessConfigSurface(): FitnessComponent {
  const penalties: string[] = [],
    rewards: string[] = [];
  let score = 10;
  const schemaCount = countFiles(join(SRC_ROOT, 'config'), /schema.*\.ts$/);

  if (schemaCount > 10) {
    penalties.push(`${String(schemaCount)} config schemas`);
    score -= 2;
  } else {
    rewards.push('Config schema count OK');
    score += 1;
  }

  if (existsSync(join(SRC_ROOT, 'config/config-loader.ts'))) {
    rewards.push('Unified config loader');
    score += 2;
  }
  if (existsSync(join(SRC_ROOT, 'config/config-manager.ts'))) {
    rewards.push('Runtime config manager');
    score += 1;
  }

  return {
    name: 'Config Surface',
    score: Math.max(0, Math.min(10, score)),
    maxScore: 10,
    details: [`Schemas: ${String(schemaCount)}`],
    penalties,
    rewards,
  };
}

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
  return {
    total,
    maxTotal,
    percentage: Math.round((total / maxTotal) * 100),
    components,
    trend: 'stable',
    assessmentDate: new Date().toISOString(),
  };
}

/* eslint-disable no-console */
function printResults(result: FitnessResult): void {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              CLI ORCHESTRATION FITNESS SCORE                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(
    `Total: ${String(result.total)}/${String(result.maxTotal)} (${String(result.percentage)}%) | ${result.trend}\n`
  );

  for (const c of result.components) {
    const bar = '█'.repeat(Math.floor((c.score / c.maxScore) * 20));
    console.log(
      `${c.name.padEnd(18)} [${bar.padEnd(20, '░')}] ${String(c.score)}/${String(c.maxScore)}`
    );
    for (const r of c.rewards) console.log(`  ✓ ${r}`);
    for (const p of c.penalties) console.log(`  ✗ ${p}`);
  }

  console.log('');
  if (result.percentage >= 80) console.log('✓ Fitness GOOD (≥80%)');
  else if (result.percentage >= 60) console.log('⚠ Fitness FAIR (60-79%)');
  else console.log('✗ Fitness POOR (<60%)');
}
/* eslint-enable no-console */

const result = assessFitness();
printResults(result);

const outputPath = join(DOCS_ROOT, 'metrics/fitness-score.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2));

process.exit(result.percentage >= 60 ? 0 : 1);
