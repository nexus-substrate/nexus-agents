/**
 * Agent Executor context enrichment — outcome, weather, memory and trend
 * context blocks prepended to the planner prompt (#1711, #6331).
 *
 * @module pipeline/agent-executor-context
 */

import { getOutcomeStore, getOutcomeSummaryText } from '../orchestration/outcomes/outcome-store.js';
import { detectTrend } from '../orchestration/outcomes/adaptive-thresholds.js';

/** Query outcome store for recent performance context (#1714). */
export function getOutcomeContext(): string {
  try {
    const text = getOutcomeSummaryText();
    return text.length > 0 ? `\n\n${text}` : '';
  } catch {
    return '';
  }
}

/** Query weather report for CLI health context (#1713). */
export async function getWeatherContext(): Promise<string> {
  try {
    const { generateWeatherReport } = await import('../mcp/tools/weather-report.js');
    const report = generateWeatherReport({ includeAdaptive: true });
    const mappings = 'recommendedMappings' in report ? report.recommendedMappings : [];
    if (!Array.isArray(mappings) || mappings.length === 0) return '';
    // Pre-#2718 this read `m.cli` via a wrong `as Array<{cli: string}>`
    // cast — `RecommendedMapping` has `recommendedCli`, not `cli`, so every
    // line rendered as "category → undefined". Cast to the real shape from
    // weather-report-types.ts.
    const typedMappings = mappings as ReadonlyArray<{
      readonly category: string;
      readonly recommendedCli: string;
    }>;
    const lines = typedMappings.map((m) => `  ${m.category} → ${m.recommendedCli}`).join('\n');
    return (
      `\n\n## CLI Health (${String(report.overall.totalTasks)} tasks, ` +
      `${String(Math.round(report.overall.successRate * 100))}% success)\n` +
      `Recommended mappings:\n${lines}\n`
    );
  } catch {
    return '';
  }
}

/**
 * Query SessionMemory for prior learnings relevant to the task (#1716).
 * DRY: follows swe-bench/memory-enrichment.ts pattern.
 */
export async function getMemoryContext(task: string): Promise<string> {
  try {
    const { createSessionMemory } = await import('../context/session-memory.js');
    const { getLearningDir } = await import('../config/learning-persistence.js');
    const memory = createSessionMemory(getLearningDir(), { maxLearningsInContext: 10 });
    const learnings = memory.searchLearnings(task.slice(0, 200));
    if (learnings.length === 0) return '';
    const lines = learnings
      .slice(0, 8)
      .map((l) => `- ${l.pattern}`)
      .join('\n');
    return `\n\n## Prior Learnings (${String(learnings.length)} relevant)\n${lines}\n`;
  } catch {
    return '';
  }
}

/** Detect quality trend from outcome store (#1716). */
export function getTrendContext(): string {
  try {
    const store = getOutcomeStore();
    const outcomes = store.query();
    if (outcomes.length < 10) return '';
    const trend = detectTrend(outcomes);
    if (trend === 'stable') return '';
    if (trend === 'declining') {
      return '\n\n⚠ **Quality trend: DECLINING** — recent success rate is lower than historical. Consider conservative approaches.\n';
    }
    return '\n\n✓ **Quality trend: IMPROVING** — recent success rate is higher than historical.\n';
  } catch {
    return '';
  }
}
