/**
 * Builders for `TaskContract` instances.
 *
 * Extracted from `v2-orchestrate.ts` and `v2-delegate.ts`, which previously
 * each had their own near-identical converter. The shared scaffolding (id
 * template, status, measured analysis/constraints/capabilities, empty
 * artifacts, timestamps) lives here; callers supply the entry-point prefix,
 * task description and metadata.
 *
 * (Source: Issue #2343, audit-epic #2337)
 *
 * @module pipeline/task-contract-builders
 */

import { randomUUID } from 'node:crypto';
import type { TaskContract } from './task-contract.js';
import { createSharedTaskAnalyzer } from '../core/task-analysis/shared-task-analyzer.js';
import type {
  ISharedTaskAnalyzer,
  TaskAnalysisResult,
} from '../core/task-analysis/shared-task-analyzer.js';
import { detectCapabilityGaps } from '../core/task-analysis/capability-gap-detector.js';

/** Inputs needed to build a fresh `'approved'` `TaskContract`. */
export interface BaseTaskContractInput {
  /** Prefix for the auto-generated id (e.g., `'orchestrate'`, `'delegate'`). */
  readonly idPrefix: string;
  /** The task description (free-text). */
  readonly task: string;
  /** Optional summary override; constraints/capabilities still come from the task. */
  readonly analysis?: TaskContract['analysis'];
  /** Caller-controlled metadata (source tag + entry-point-specific fields). */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Lazily-built analyzer for {@link analyzeForContract}. One instance per
 * process — `createSharedTaskAnalyzer` is not free and the analysis is a pure
 * function of the task text.
 */
let sharedAnalyzer: ISharedTaskAnalyzer | undefined;

/** Retains the full canonical analysis for contract measurement. */
function analyzeTask(task: string): TaskAnalysisResult {
  sharedAnalyzer ??= createSharedTaskAnalyzer();
  return sharedAnalyzer.analyze(task);
}

/**
 * Derives the `TaskContract.analysis` summary from the task itself (#5924).
 *
 * The `orchestrate` and `delegate_to_model` entry points used to pass a
 * hard-coded literal — every orchestrate task was recorded as
 * `{ complexity: 'high', taskType: 'orchestration', ambiguityScore: 0.3 }`,
 * including a typo fix, and every delegate task as
 * `{ complexity: 'moderate', taskType: 'routing', ambiguityScore: 0.1 }`. A
 * fixed `ambiguityScore` that no task can move is a constant wearing the name
 * of a measurement, which is the shape that inflated the metric it fed in
 * #5812.
 *
 * `SharedTaskAnalyzer` is what CLAUDE.md names canonical for "analyse /
 * classify a task", it already produces exactly these three fields, and
 * `analyze()` is synchronous — so this is calling the analyzer the repo
 * already has, from the two entry points that skipped it.
 */
export function analyzeForContract(task: string): {
  complexity: string;
  taskType: string;
  ambiguityScore: number;
} {
  const result = analyzeTask(task);
  return {
    complexity: result.complexity,
    taskType: result.taskType,
    ambiguityScore: result.ambiguityScore,
  };
}

/**
 * Build a fresh `'approved'` contract using canonical analysis and gap detection.
 *
 * Scope is empty and time/quality absent when the analyzer recognizes none;
 * these are extracted hints, not a guarantee that the task has no constraints.
 * `allSatisfied` covers inferred requirements only, not execution outcomes.
 * Inferred gaps are retained regardless of the ledger's recording flag.
 *
 * The two MCP entrypoints (`orchestrate`, `delegate_to_model`) build their
 * task contracts via this helper rather than copy-pasting the full shape.
 * Adding a new field to `TaskContractSchema` only requires updating this one
 * place.
 */
export function buildBaseTaskContract(input: BaseTaskContractInput): TaskContract {
  const analysis = analyzeTask(input.task);
  const report = detectCapabilityGaps(analysis.requiredCapabilities);
  const now = Date.now();
  return {
    id: `${input.idPrefix}-${randomUUID().slice(0, 8)}`,
    description: input.task,
    status: 'approved',
    analysis: input.analysis ?? {
      complexity: analysis.complexity,
      taskType: analysis.taskType,
      ambiguityScore: analysis.ambiguityScore,
    },
    constraints: { ...analysis.constraints, scope: [...analysis.constraints.scope] },
    requiredCapabilities: {
      tools: [...analysis.requiredCapabilities.tools],
      experts: [...analysis.requiredCapabilities.experts],
    },
    capabilityGaps: {
      available: {
        tools: [...report.available.tools],
        experts: [...report.available.experts],
      },
      gaps: [...report.gaps],
      allSatisfied: report.allSatisfied,
      gapsMeasured: true,
    },
    artifacts: [],
    metadata: { ...input.metadata },
    createdAt: now,
    updatedAt: now,
  };
}
