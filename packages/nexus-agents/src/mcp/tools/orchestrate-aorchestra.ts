/**
 * AOrchestra integration for the orchestrate tool (Issue #935).
 *
 * Provides agent planning via SharedTaskAnalyzer + AgentPlanner
 * when the NEXUS_AORCHESTRA feature flag is enabled.
 *
 * @module mcp/tools/orchestrate-aorchestra
 */

import type { ILogger } from '../../core/index.js';
import { planAgentTeam, type AgentPlan } from '../../orchestration/aorchestra/index.js';
import { SharedTaskAnalyzer } from '../../core/task-analysis/shared-task-analyzer.js';
import { getOutcomeStore } from '../../orchestration/outcomes/index.js';

/** Worker model prefix — matches orchestrate-dispatch.ts and weather-report.ts. */
const WORKER_MODEL_PREFIX = 'worker-';

/** Minimum outcomes per expert before reliability data is used (cold-start guard). */
const RELIABILITY_COLD_START = 3;

/**
 * Computes per-expert success rates from historical worker dispatch outcomes.
 *
 * Queries OutcomeStore for entries with `worker-{role}` model names,
 * aggregates success rates per role, and returns a map for the planner.
 * Roles with fewer than RELIABILITY_COLD_START outcomes are excluded
 * (no data = assume reliable).
 */
export function computeExpertReliability(): ReadonlyMap<string, number> {
  const store = getOutcomeStore();
  const allOutcomes = store.query();
  const workerOutcomes = allOutcomes.filter((o) => o.model.startsWith(WORKER_MODEL_PREFIX));
  if (workerOutcomes.length === 0) return new Map();

  const byRole = new Map<string, { successes: number; total: number }>();
  for (const o of workerOutcomes) {
    const role = o.model.slice(WORKER_MODEL_PREFIX.length);
    const existing = byRole.get(role) ?? { successes: 0, total: 0 };
    existing.total += 1;
    if (o.success) existing.successes += 1;
    byRole.set(role, existing);
  }

  const reliability = new Map<string, number>();
  for (const [role, stats] of byRole) {
    if (stats.total >= RELIABILITY_COLD_START) {
      reliability.set(role, stats.successes / stats.total);
    }
  }
  return reliability;
}

/**
 * Computes an AOrchestra agent plan for a task.
 *
 * Uses SharedTaskAnalyzer to analyze the task, then AgentPlanner to
 * select an optimal expert team. Feeds historical expert reliability
 * data to skip underperforming experts (Issue #1325).
 * Returns undefined on failure (best-effort).
 *
 * @param task - Task description to plan for
 * @param logger - Logger for observability
 * @returns AgentPlan or undefined if planning fails
 */
export function computeAgentPlan(task: string, logger: ILogger): AgentPlan | undefined {
  try {
    const analyzer = new SharedTaskAnalyzer();
    const analysis = analyzer.analyze(task);

    // Skip planning for simple tasks — AOrchestra adds overhead without value (Issue #1132)
    if (analysis.complexity === 'simple') {
      logger.debug('Skipping AOrchestra planning for simple task', {
        taskType: analysis.taskType,
      });
      return undefined;
    }

    const expertReliability = computeExpertReliability();
    const plan = planAgentTeam(analysis, task, { expertReliability });
    logger.info('AOrchestra plan', {
      experts: plan.totalExperts,
      taskType: plan.taskType,
      complexity: plan.complexity,
      reliabilityEntries: expertReliability.size,
    });
    return plan;
  } catch (planError) {
    logger.warn('AOrchestra planning failed', {
      error: planError instanceof Error ? planError.message : 'unknown',
    });
    return undefined;
  }
}
