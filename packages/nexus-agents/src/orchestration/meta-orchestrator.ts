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
import { createLogger, getTimeProvider, getErrorMessage } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import type { ILearnedStrategySelector, MetaShadowSink } from './meta-shadow-selector.js';
import { classifyTask } from '../pipeline/adaptive-orchestrator.js';
import type { PipelineType } from '../pipeline/adaptive-orchestrator.js';
import { createWorkflowRouter } from './workflow-router.js';
import type { IWorkflowRouter } from './workflow-router.js';
import type { TaskSignals, WorkflowPattern } from './workflow-router-types.js';
import type { TaskAnalysisResult } from '../core/task-analysis/shared-task-analyzer.js';
import type { CapabilityGapReport } from '../core/task-analysis/capability-gap-detector.js';
import type { ICapabilityGapLedger } from '../core/task-analysis/capability-gap-ledger.js';
import {
  buildForcedDecision,
  buildSelectedDecision,
  toRecord,
} from './meta-orchestrator-decision.js';
import { guardAuthority, type ActionClass } from './authority-tier-guard.js';

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
  /**
   * The authority class the caller's intended action would EXERCISE (#3841,
   * ADR-0017). When present, the router enforces the authority ladder: it REFUSES
   * (throws {@link AuthorityRefusalError}, fail-closed) if the selected/forced
   * strategy is declared at a tier BELOW this action class — e.g. requesting an
   * `enforce`-class action from an `advisory`-tier strategy. Absent ⇒ the router
   * authorizes only the strategy's own declared tier (no above-tier action is
   * requested, so nothing to refuse).
   */
  readonly requiredAuthority?: ActionClass | undefined;
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
  /**
   * The id of the strategy manifest that backs this decision (#3836). For an
   * auto-routed decision it is the manifest whose selection rule won; for a
   * forced one it is the forced strategy's manifest. The router routes purely
   * over manifest data, so this is the provenance of the choice.
   */
  readonly manifestId: string;
  /** The schema version of {@link manifestId}'s manifest (#3836 audit trail). */
  readonly manifestSchemaVersion: number;
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
  /** The strategy manifest id that backed the decision (#3836 audit trail). */
  readonly manifestId: string;
  /** The schema version of the backing manifest (#3836 audit trail). */
  readonly manifestSchemaVersion: number;
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
 * Computes the learned would-be strategy and logs it alongside the rule-based
 * decision (#3551). Shadow only — never alters the executed decision. Best-effort:
 * a selector/sink failure is logged and swallowed so selection never breaks.
 */
function recordShadow(
  shadowSelector: ILearnedStrategySelector,
  shadowSink: MetaShadowSink,
  decision: MetaDecision,
  timestamp: string,
  logger: ILogger
): void {
  try {
    const learned = shadowSelector.predict(decision);
    shadowSink.record({
      decisionId: decision.decisionId,
      timestamp,
      ruleStrategy: decision.strategy,
      learnedStrategy: learned.strategy,
      agree: learned.strategy === decision.strategy,
      taskClass: decision.analysis.taskType,
      learnedScore: learned.score,
    });
  } catch (err) {
    logger.warn('Shadow selection failed (non-fatal)', { error: getErrorMessage(err) });
  }
}

/** Emits the structured "strategy selected" audit log line for a decision. */
function logSelection(logger: ILogger, decision: MetaDecision, forced: boolean): void {
  logger.info('MetaOrchestrator strategy selected', {
    decisionId: decision.decisionId,
    strategy: decision.strategy,
    confidence: decision.confidence,
    pattern: decision.pattern,
    pipelineType: decision.pipelineType,
    needsShaping: decision.needsShaping,
    forced,
    manifestId: decision.manifestId,
    manifestSchemaVersion: decision.manifestSchemaVersion,
  });
}

/**
 * Creates a MetaOrchestrator. Selection is deterministic and routes purely over
 * the strategy-manifest registry (#3836) rather than hardcoded rules. Each
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
  /**
   * Optional learned selector (#3551). When provided WITH a shadowSink, its
   * would-be strategy is computed and logged alongside the rule-based choice —
   * SHADOW MODE: the learned choice is never executed. Default absent.
   */
  readonly shadowSelector?: ILearnedStrategySelector | undefined;
  /** Sink for shadow comparisons; required for shadow logging to run. */
  readonly shadowSink?: MetaShadowSink | undefined;
}): IMetaOrchestrator {
  const logger = options?.logger ?? createLogger({ component: 'MetaOrchestrator' });
  const router = options?.router ?? createWorkflowRouter({ logger });
  const sink = options?.sink ?? createAuditLogSink(logger);
  const gapLedger = options?.gapLedger;
  const shadowSelector = options?.shadowSelector;
  const shadowSink = options?.shadowSink;

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

      // Authority-ladder enforcement (#3841, ADR-0017). If the caller's action
      // exercises an authority class above the chosen strategy's DECLARED tier,
      // the router refuses fail-closed (throws AuthorityRefusalError) BEFORE the
      // decision is recorded or returned — an above-tier action is stopped at the
      // router, not caught after the fact. This is the machine consumer the
      // authority-ladder ratification panel required.
      if (input.requiredAuthority !== undefined) {
        guardAuthority(decision.strategy, input.requiredAuthority);
      }

      const timestamp = new Date(getTimeProvider().now()).toISOString();
      sink.record(toRecord(decision, input.goal, forced, timestamp));
      if (shadowSelector !== undefined && shadowSink !== undefined) {
        recordShadow(shadowSelector, shadowSink, decision, timestamp, logger);
      }
      if (gapLedger !== undefined && decision.capabilityGaps !== undefined) {
        gapLedger.record(decision.capabilityGaps, {
          goal: input.goal,
          decisionId: decision.decisionId,
        });
      }

      logSelection(logger, decision, forced);
      return decision;
    },
  };
}
