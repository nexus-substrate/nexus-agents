/**
 * nexus-agents/orchestration - MetaOrchestrator (adaptive selection tier)
 *
 * One adaptive entry point that, given a goal, SELECTS the right execution
 * strategy among the existing specialized pipelines — it routes once per task,
 * it does NOT switch patterns mid-flight and it does NOT execute anything
 * itself. This is the "routing" pattern (Anthropic, Building Effective Agents):
 * classify → dispatch to a specialized pipeline, rather than a generalist
 * mega-pipeline.
 *
 * Step 1 (#3549) is a pure, deterministic selection function. It reuses the
 * existing selection brains — `SharedTaskAnalyzer` (signals), `WorkflowRouter`
 * (execution pattern), and `classifyTask` (pipeline template) — and maps their
 * combined output to a single {@link ExecutionStrategy}. Dispatch wiring,
 * decision logging, and learned selection are later steps of epic #3548.
 *
 * @module orchestration/meta-orchestrator
 * (Source: Issue #3549 — MetaOrchestrator step 1)
 */

import { randomUUID } from 'node:crypto';
import { createLogger, getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { classifyTask } from '../pipeline/adaptive-orchestrator.js';
import type { TaskClassification, PipelineType } from '../pipeline/adaptive-orchestrator.js';
import { createWorkflowRouter } from './workflow-router.js';
import type { IWorkflowRouter } from './workflow-router.js';
import type { TaskSignals, RoutingDecision, WorkflowPattern } from './workflow-router-types.js';
import type { TaskAnalysisResult } from '../core/task-analysis/shared-task-analyzer.js';
import type { CapabilityGapReport } from '../core/task-analysis/capability-gap-detector.js';
import type { ICapabilityGapLedger } from '../core/task-analysis/capability-gap-ledger.js';

/**
 * Execution strategies the MetaOrchestrator can select. Each maps to an
 * existing entry point / engine — the MetaOrchestrator does not introduce a
 * new execution path, it chooses among the ones that already exist.
 */
export type ExecutionStrategy =
  /** Trivial single-step task → `delegate_to_model`. */
  | 'single-shot'
  /** Code change with the dev gate (test/lint/typecheck) → `run_dev_pipeline`. */
  | 'dev-pipeline'
  /** Multi-stage templated work (audit/general) → `run_pipeline`. */
  | 'pipeline'
  /** DAG / conditional-edge workflow → `run_graph_workflow`. */
  | 'graph-workflow'
  /** Pattern-based multi-agent orchestration (wave/aflow/puppeteer) → `orchestrate`. */
  | 'orchestrate'
  /** Multi-perspective decision → `consensus_vote`. */
  | 'consensus'
  /** Greenfield project from a spec → `execute_spec`. */
  | 'spec'
  /** Research-heavy work → the research pipeline. */
  | 'research';

/** Input to a MetaOrchestrator selection. */
export interface MetaOrchestratorInput {
  /** Natural-language goal. */
  readonly goal: string;
  /** Optional structural hints forwarded to the workflow router. */
  readonly signals?: Omit<TaskSignals, 'description'> | undefined;
  /** Power-user override — bypass selection and force a strategy. */
  readonly forceStrategy?: ExecutionStrategy | undefined;
}

/**
 * The selection result. Always transparent: it carries the chosen strategy
 * plus the reasoning, confidence, alternatives, and the underlying signals so
 * the decision is observable (and, in later steps, loggable + learnable).
 */
export interface MetaDecision {
  /**
   * Unique id for this selection decision. The join key a later task outcome
   * references (mirrors `TaskOutcome.routingDecisionId`) so selection can be
   * correlated with results when learned selection lands (epic #3548 step 3+).
   */
  readonly decisionId: string;
  /** The selected execution strategy. */
  readonly strategy: ExecutionStrategy;
  /** Human-readable explanation of why this strategy was selected. */
  readonly reasoning: string;
  /** Confidence in the selection (0-1). */
  readonly confidence: number;
  /** Other strategies that were plausible, best-first, excluding the chosen one. */
  readonly alternatives: readonly ExecutionStrategy[];
  /**
   * Whether the goal is ambiguous/novel enough to warrant a research→vote
   * "shape-the-work" phase before executing. The strategy is still selected;
   * this flags that the selection is low-confidence and escalation is advised.
   */
  readonly needsShaping: boolean;
  /** Clarification questions surfaced when {@link needsShaping} is true. */
  readonly shapingQuestions?: readonly string[];
  /** The execution pattern chosen by the workflow router (sub-signal). */
  readonly pattern: WorkflowPattern;
  /** The pipeline template chosen by the classifier (sub-signal). */
  readonly pipelineType: PipelineType;
  /** Full task analysis from SharedTaskAnalyzer (shared signal). */
  readonly analysis: TaskAnalysisResult;
  /** Capability gap report — what's available vs needed. */
  readonly capabilityGaps?: CapabilityGapReport;
}

/** Public interface for the MetaOrchestrator. */
export interface IMetaOrchestrator {
  /**
   * Selects an execution strategy for a goal. Selection itself is deterministic;
   * as of epic #3548 step 2 it also emits a {@link MetaSelectionRecord} to the
   * configured {@link MetaDecisionSink} for observability (the substrate learned
   * selection mines). It does not execute the strategy.
   */
  select(input: MetaOrchestratorInput): MetaDecision;
}

/**
 * An observability record of one selection decision. Distinct from the
 * model-routing `RoutingDecision` in the learning module — that captures which
 * *model* a stage router picked; this captures which *strategy* the
 * MetaOrchestrator picked. Logging it (not the outcome) is step 2's deliverable;
 * the decision→outcome correlation lands once dispatch wiring exists.
 */
export interface MetaSelectionRecord {
  /** Matches the {@link MetaDecision.decisionId} of the decision it records. */
  readonly decisionId: string;
  /** ISO timestamp of the decision. */
  readonly timestamp: string;
  /** The goal that was routed. */
  readonly goal: string;
  /** The selected strategy. */
  readonly strategy: ExecutionStrategy;
  /** Confidence in the selection (0-1). */
  readonly confidence: number;
  /** The underlying workflow pattern. */
  readonly pattern: WorkflowPattern;
  /** The underlying pipeline template. */
  readonly pipelineType: PipelineType;
  /** Alternatives that were considered. */
  readonly alternatives: readonly ExecutionStrategy[];
  /** Whether the decision was flagged for a shape-the-work escalation. */
  readonly needsShaping: boolean;
  /** Whether the strategy was forced by the caller (vs selected). */
  readonly forced: boolean;
}

/** A sink that receives every selection decision for observability. */
export interface MetaDecisionSink {
  /** Records one selection decision. Must not throw (observability is best-effort). */
  record(record: MetaSelectionRecord): void;
}

/** A {@link MetaDecisionSink} that also exposes its buffered records for inspection. */
export interface IRecordingMetaDecisionSink extends MetaDecisionSink {
  /** Returns the buffered records, oldest first. */
  getRecords(): readonly MetaSelectionRecord[];
}

/** Default cap for the in-memory recording sink, matching WorkflowRouter's buffer. */
const DEFAULT_MAX_RECORDS = 200;

/**
 * Creates a sink that emits each decision as a structured audit log line.
 * This is the MetaOrchestrator's default sink.
 */
export function createAuditLogSink(logger: ILogger): MetaDecisionSink {
  return {
    record(record: MetaSelectionRecord): void {
      logger.info('MetaOrchestrator selection decision', { ...record });
    },
  };
}

/**
 * Creates an in-memory recording sink with a bounded buffer (oldest evicted).
 * The queryable observability surface that learned selection (step 3) reads.
 */
export function createRecordingSink(maxRecords = DEFAULT_MAX_RECORDS): IRecordingMetaDecisionSink {
  const records: MetaSelectionRecord[] = [];
  return {
    record(record: MetaSelectionRecord): void {
      records.push(record);
      if (records.length > maxRecords) {
        records.splice(0, records.length - maxRecords);
      }
    },
    getRecords(): readonly MetaSelectionRecord[] {
      return records;
    },
  };
}

/**
 * Maps a workflow pattern (+ complexity) to the execution strategy that engine
 * fronts. `sequential` collapses to the lightest engine that fits the
 * complexity.
 */
export function strategyFromPattern(
  pattern: WorkflowPattern,
  complexity: TaskAnalysisResult['complexity']
): ExecutionStrategy {
  switch (pattern) {
    case 'consensus':
      return 'consensus';
    case 'graph':
      return 'graph-workflow';
    case 'wave':
    case 'aflow':
    case 'puppeteer':
      return 'orchestrate';
    case 'sequential':
      return complexity === 'simple' ? 'single-shot' : 'dev-pipeline';
    default: {
      // Exhaustiveness guard — a new pattern must be mapped explicitly.
      const _exhaustive: never = pattern;
      return _exhaustive;
    }
  }
}

/** Maps a pipeline template to the execution strategy that fronts it. */
export function strategyFromPipelineType(pipelineType: PipelineType): ExecutionStrategy {
  switch (pipelineType) {
    case 'greenfield':
      return 'spec';
    case 'research':
      return 'research';
    case 'audit':
      return 'pipeline';
    case 'dev':
      return 'dev-pipeline';
    case 'general':
      return 'pipeline';
    default: {
      const _exhaustive: never = pipelineType;
      return _exhaustive;
    }
  }
}

interface SelectionCore {
  readonly strategy: ExecutionStrategy;
  readonly reasoning: string;
  readonly confidence: number;
}

/**
 * The core selection rule. Distinctive pipeline templates (greenfield,
 * research) and an explicit consensus requirement take precedence over the
 * structural pattern; otherwise the structural pattern drives the choice, with
 * the audit template upgrading a plain sequential default to the templated
 * pipeline.
 */
function decideStrategy(
  routing: RoutingDecision,
  classification: TaskClassification
): SelectionCore {
  const { pattern, analysis } = routing;
  const { pipelineType } = classification;

  if (pattern === 'consensus') {
    return {
      strategy: 'consensus',
      reasoning: `Consensus pattern selected (${routing.reasoning}) — routing to a multi-perspective vote`,
      confidence: routing.confidence,
    };
  }
  if (pipelineType === 'greenfield') {
    return {
      strategy: 'spec',
      reasoning: 'Greenfield work detected — routing to a spec-driven build',
      confidence: classification.confidence,
    };
  }
  if (pipelineType === 'research') {
    return {
      strategy: 'research',
      reasoning: 'Research-heavy work detected — routing to the research pipeline',
      confidence: classification.confidence,
    };
  }

  const patternStrategy = strategyFromPattern(pattern, analysis.complexity);
  // The audit template is more specific than a plain sequential default.
  if (
    pipelineType === 'audit' &&
    (patternStrategy === 'dev-pipeline' || patternStrategy === 'single-shot')
  ) {
    return {
      strategy: 'pipeline',
      reasoning: 'Audit work detected — routing to the templated audit pipeline',
      confidence: classification.confidence,
    };
  }
  return {
    strategy: patternStrategy,
    reasoning: `Pattern "${pattern}" → ${patternStrategy} (${routing.reasoning})`,
    confidence: routing.confidence,
  };
}

/** Builds the best-first alternatives list, excluding the chosen strategy. */
function buildAlternatives(
  chosen: ExecutionStrategy,
  routing: RoutingDecision,
  classification: TaskClassification
): ExecutionStrategy[] {
  const candidates: ExecutionStrategy[] = [
    strategyFromPattern(routing.pattern, routing.analysis.complexity),
    strategyFromPipelineType(classification.pipelineType),
    'orchestrate',
  ];
  const seen = new Set<ExecutionStrategy>([chosen]);
  const alternatives: ExecutionStrategy[] = [];
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      alternatives.push(c);
    }
  }
  return alternatives;
}

/** Common sub-signal fields shared by every decision. */
function subSignals(
  routing: RoutingDecision,
  classification: TaskClassification
): Pick<MetaDecision, 'pattern' | 'pipelineType' | 'analysis' | 'capabilityGaps'> {
  return {
    pattern: routing.pattern,
    pipelineType: classification.pipelineType,
    analysis: routing.analysis,
    ...(routing.capabilityGaps !== undefined ? { capabilityGaps: routing.capabilityGaps } : {}),
  };
}

function buildForcedDecision(
  forced: ExecutionStrategy,
  routing: RoutingDecision,
  classification: TaskClassification
): Omit<MetaDecision, 'decisionId'> {
  return {
    strategy: forced,
    reasoning: `Strategy forced by caller: ${forced}`,
    confidence: 1.0,
    alternatives: buildAlternatives(forced, routing, classification),
    needsShaping: false,
    ...subSignals(routing, classification),
  };
}

function buildSelectedDecision(
  routing: RoutingDecision,
  classification: TaskClassification
): Omit<MetaDecision, 'decisionId'> {
  const core = decideStrategy(routing, classification);
  const needsShaping = routing.needsClarification === true;
  return {
    strategy: core.strategy,
    reasoning: core.reasoning,
    confidence: core.confidence,
    alternatives: buildAlternatives(core.strategy, routing, classification),
    needsShaping,
    ...(needsShaping && routing.suggestedQuestions !== undefined
      ? { shapingQuestions: routing.suggestedQuestions }
      : {}),
    ...subSignals(routing, classification),
  };
}

/** Maps a finished decision to its observability record. */
function toRecord(
  decision: MetaDecision,
  goal: string,
  forced: boolean,
  timestamp: string
): MetaSelectionRecord {
  return {
    decisionId: decision.decisionId,
    timestamp,
    goal,
    strategy: decision.strategy,
    confidence: decision.confidence,
    pattern: decision.pattern,
    pipelineType: decision.pipelineType,
    alternatives: decision.alternatives,
    needsShaping: decision.needsShaping,
    forced,
  };
}

/**
 * Creates a MetaOrchestrator. Selection is deterministic and reuses the
 * existing routing/classification logic rather than duplicating it (DRY). Each
 * selection is emitted to the decision sink for observability (step 2, #3550).
 *
 * @param options.logger - optional logger.
 * @param options.router - optional workflow router (injectable for tests).
 * @param options.sink - optional decision sink (default: audit-log sink).
 * @param options.gapLedger - optional capability-gap ledger; when provided, each
 *   decision's capability gaps are recorded for the self-directed build backlog
 *   (#3555). Default absent — no gap recording, no behavior change.
 */
export function createMetaOrchestrator(options?: {
  readonly logger?: ILogger | undefined;
  readonly router?: IWorkflowRouter | undefined;
  readonly sink?: MetaDecisionSink | undefined;
  readonly gapLedger?: ICapabilityGapLedger | undefined;
}): IMetaOrchestrator {
  const logger = options?.logger ?? createLogger({ component: 'MetaOrchestrator' });
  const router = options?.router ?? createWorkflowRouter({ logger });
  const sink = options?.sink ?? createAuditLogSink(logger);
  const gapLedger = options?.gapLedger;

  return {
    select(input: MetaOrchestratorInput): MetaDecision {
      const signals: TaskSignals = { description: input.goal, ...input.signals };
      const routing = router.route(signals);
      const classification = classifyTask(input.goal);

      const forced = input.forceStrategy !== undefined;
      const base =
        input.forceStrategy !== undefined
          ? buildForcedDecision(input.forceStrategy, routing, classification)
          : buildSelectedDecision(routing, classification);
      const decision: MetaDecision = { ...base, decisionId: randomUUID() };

      const timestamp = new Date(getTimeProvider().now()).toISOString();
      sink.record(toRecord(decision, input.goal, forced, timestamp));
      if (gapLedger !== undefined && decision.capabilityGaps !== undefined) {
        gapLedger.record(decision.capabilityGaps, {
          goal: input.goal,
          decisionId: decision.decisionId,
        });
      }

      logger.info('MetaOrchestrator strategy selected', {
        decisionId: decision.decisionId,
        strategy: decision.strategy,
        confidence: decision.confidence,
        pattern: decision.pattern,
        pipelineType: decision.pipelineType,
        needsShaping: decision.needsShaping,
        forced,
      });
      return decision;
    },
  };
}
