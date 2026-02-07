/**
 * nexus-agents/orchestration - Workflow Pattern Router
 *
 * Intelligent orchestration pattern selection based on task characteristics.
 * Uses SharedTaskAnalyzer signals + caller hints to select the optimal
 * workflow pattern (sequential, wave, graph, consensus, aflow, puppeteer).
 *
 * v1: Rule-based only (per consensus vote — no ML/RL yet).
 *
 * @module orchestration/workflow-router
 * (Source: Issue #844 — Intelligent Workflow Pattern Router)
 */

import { createLogger } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { createSharedTaskAnalyzer } from '../core/task-analysis/shared-task-analyzer.js';
import type {
  ISharedTaskAnalyzer,
  TaskAnalysisResult,
} from '../core/task-analysis/shared-task-analyzer.js';
import type {
  TaskSignals,
  WorkflowPattern,
  RoutingDecision,
  WorkflowRouterOptions,
  PatternOutcome,
  PatternMetrics,
} from './workflow-router-types.js';

const MAX_OUTCOMES = 200;

/** Rule function that returns a pattern + reasoning if it matches, or undefined. */
type RoutingRule = (
  signals: TaskSignals,
  analysis: TaskAnalysisResult
) => { pattern: WorkflowPattern; reasoning: string; confidence: number } | undefined;

/**
 * Creates a workflow pattern router.
 *
 * Analyzes task characteristics and selects the optimal orchestration
 * pattern using a rule-based classification system.
 */
export function createWorkflowRouter(options?: {
  readonly logger?: ILogger | undefined;
  readonly analyzer?: ISharedTaskAnalyzer | undefined;
}): IWorkflowRouter {
  const logger = options?.logger ?? createLogger({ component: 'WorkflowRouter' });
  const analyzer = options?.analyzer ?? createSharedTaskAnalyzer({ logger });
  const outcomes: PatternOutcome[] = [];

  return {
    route(signals: TaskSignals, routerOpts?: WorkflowRouterOptions): RoutingDecision {
      return routeTask(signals, analyzer, logger, routerOpts);
    },
    recordOutcome(outcome: PatternOutcome): void {
      recordPatternOutcome(outcomes, outcome);
    },
    getMetrics(pattern?: WorkflowPattern): readonly PatternMetrics[] {
      return computeMetrics(outcomes, pattern);
    },
  };
}

/** Public interface for the workflow router. */
export interface IWorkflowRouter {
  /** Routes a task to the optimal workflow pattern. */
  route(signals: TaskSignals, options?: WorkflowRouterOptions): RoutingDecision;
  /** Records an execution outcome for performance tracking. */
  recordOutcome(outcome: PatternOutcome): void;
  /** Gets aggregated metrics, optionally filtered by pattern. */
  getMetrics(pattern?: WorkflowPattern): readonly PatternMetrics[];
}

/** Ordered rules — first match wins. */
const ROUTING_RULES: readonly RoutingRule[] = [
  ruleForcePattern,
  ruleConsensusRequired,
  ruleIndependentSubtasks,
  ruleLinearDependencies,
  ruleDagDependencies,
  ruleNovelTask,
  ruleComplexArchitecture,
  ruleSimpleTask,
  ruleBulkOperations,
];

function routeTask(
  signals: TaskSignals,
  analyzer: ISharedTaskAnalyzer,
  logger: ILogger,
  _opts?: WorkflowRouterOptions
): RoutingDecision {
  const analysis = analyzer.analyze(signals.description);
  const matchedRules: string[] = [];
  const alternatives: WorkflowPattern[] = [];

  for (const rule of ROUTING_RULES) {
    const result = rule(signals, analysis);
    if (result !== undefined) {
      matchedRules.push(rule.name);
      collectAlternatives(alternatives, result.pattern);
      logger.info('Workflow pattern selected', {
        pattern: result.pattern,
        rule: rule.name,
        confidence: result.confidence,
        taskType: analysis.taskType,
        complexity: analysis.complexity,
      });
      return {
        pattern: result.pattern,
        reasoning: result.reasoning,
        confidence: result.confidence,
        matchedRules,
        alternatives,
        analysis,
      };
    }
  }

  // Fallback: Graph DAG as most general pattern (per Architect feedback)
  logger.info('Using fallback pattern', { pattern: 'graph', taskType: analysis.taskType });
  return {
    pattern: 'graph',
    reasoning: 'No specific rule matched — using Graph DAG as the most general pattern',
    confidence: 0.5,
    matchedRules: ['fallback'],
    alternatives: ['sequential', 'wave'],
    analysis,
  };
}

function ruleForcePattern(signals: TaskSignals): ReturnType<RoutingRule> {
  if (signals.forcePattern === undefined) return undefined;
  return {
    pattern: signals.forcePattern,
    reasoning: `Pattern forced by caller: ${signals.forcePattern}`,
    confidence: 1.0,
  };
}

function ruleConsensusRequired(signals: TaskSignals): ReturnType<RoutingRule> {
  if (signals.requiresConsensus !== true) return undefined;
  return {
    pattern: 'consensus',
    reasoning: 'Task requires multi-perspective consensus voting',
    confidence: 0.9,
  };
}

function ruleIndependentSubtasks(
  signals: TaskSignals,
  analysis: TaskAnalysisResult
): ReturnType<RoutingRule> {
  const isIndependent = signals.dependencyStructure === 'independent';
  const isParallel = analysis.capabilities.parallelizable;
  const hasMultiple = (signals.subtaskCount ?? 0) > 1;
  if (!isIndependent && !(isParallel && hasMultiple)) return undefined;
  return {
    pattern: 'wave',
    reasoning: 'Independent subtasks detected — wave scheduler maximizes parallelism',
    confidence: isIndependent ? 0.9 : 0.75,
  };
}

function ruleLinearDependencies(signals: TaskSignals): ReturnType<RoutingRule> {
  if (signals.dependencyStructure !== 'linear') return undefined;
  return {
    pattern: 'sequential',
    reasoning: 'Linear dependency chain — sequential pipeline is optimal',
    confidence: 0.9,
  };
}

function ruleDagDependencies(signals: TaskSignals): ReturnType<RoutingRule> {
  if (signals.dependencyStructure !== 'dag') return undefined;
  return {
    pattern: 'graph',
    reasoning: 'DAG dependency structure — graph workflow with conditional edges',
    confidence: 0.9,
  };
}

function ruleNovelTask(
  signals: TaskSignals,
  analysis: TaskAnalysisResult
): ReturnType<RoutingRule> {
  if (signals.isNovel !== true) return undefined;
  if (signals.timeConstraint === 'urgent') return undefined;
  const isComplex = analysis.complexity === 'complex' || analysis.complexity === 'expert';
  if (!isComplex) return undefined;
  return {
    pattern: 'aflow',
    reasoning: 'Novel complex task — AFlow MCTS explores solution space',
    confidence: 0.7,
  };
}

function ruleComplexArchitecture(
  _signals: TaskSignals,
  analysis: TaskAnalysisResult
): ReturnType<RoutingRule> {
  if (analysis.taskType !== 'architecture') return undefined;
  if (analysis.complexity !== 'expert') return undefined;
  return {
    pattern: 'graph',
    reasoning: 'Expert-level architecture task — graph DAG with checkpointing',
    confidence: 0.8,
  };
}

function ruleSimpleTask(
  _signals: TaskSignals,
  analysis: TaskAnalysisResult
): ReturnType<RoutingRule> {
  if (analysis.complexity !== 'simple') return undefined;
  return {
    pattern: 'sequential',
    reasoning: 'Simple task — sequential execution avoids orchestration overhead',
    confidence: 0.85,
  };
}

function ruleBulkOperations(
  _signals: TaskSignals,
  analysis: TaskAnalysisResult
): ReturnType<RoutingRule> {
  if (analysis.taskType !== 'bulk_operations') return undefined;
  return {
    pattern: 'wave',
    reasoning: 'Bulk operations — wave scheduler for parallel batch processing',
    confidence: 0.85,
  };
}

function collectAlternatives(alternatives: WorkflowPattern[], selected: WorkflowPattern): void {
  const allPatterns: WorkflowPattern[] = [
    'sequential',
    'wave',
    'graph',
    'consensus',
    'aflow',
    'puppeteer',
  ];
  for (const p of allPatterns) {
    if (p !== selected) alternatives.push(p);
  }
}

/** Records an outcome, maintaining bounded storage (per Security/Architect feedback). */
function recordPatternOutcome(outcomes: PatternOutcome[], outcome: PatternOutcome): void {
  outcomes.push(outcome);
  if (outcomes.length > MAX_OUTCOMES) {
    outcomes.splice(0, outcomes.length - MAX_OUTCOMES);
  }
}

/** Computes aggregated metrics from recorded outcomes. */
function computeMetrics(
  outcomes: readonly PatternOutcome[],
  filterPattern?: WorkflowPattern
): PatternMetrics[] {
  const groups = new Map<string, PatternOutcome[]>();

  for (const o of outcomes) {
    if (filterPattern !== undefined && o.pattern !== filterPattern) continue;
    const key = `${o.pattern}:${o.taskType}`;
    const group = groups.get(key);
    if (group !== undefined) {
      group.push(o);
    } else {
      groups.set(key, [o]);
    }
  }

  const metrics: PatternMetrics[] = [];
  for (const [, group] of groups) {
    const first = group[0];
    if (first === undefined) continue;
    const successCount = group.filter((o) => o.success).length;
    const totalDuration = group.reduce((sum, o) => sum + o.durationMs, 0);
    metrics.push({
      pattern: first.pattern,
      taskType: first.taskType,
      totalExecutions: group.length,
      successCount,
      successRate: successCount / group.length,
      avgDurationMs: totalDuration / group.length,
    });
  }

  return metrics;
}
