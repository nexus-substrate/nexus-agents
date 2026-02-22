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

/**
 * Computes an AOrchestra agent plan for a task.
 *
 * Uses SharedTaskAnalyzer to analyze the task, then AgentPlanner to
 * select an optimal expert team. Returns undefined on failure (best-effort).
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

    const plan = planAgentTeam(analysis, task);
    logger.info('AOrchestra plan', {
      experts: plan.totalExperts,
      taskType: plan.taskType,
      complexity: plan.complexity,
    });
    return plan;
  } catch (planError) {
    logger.warn('AOrchestra planning failed', {
      error: planError instanceof Error ? planError.message : 'unknown',
    });
    return undefined;
  }
}
