/**
 * Pipeline Stage Types — Shared interfaces for graph-backed pipelines (#1735, Phase 2)
 *
 * Defines the IPipelineStage interface that all pipeline stages implement.
 * Stages are wrapped as GraphBuilder NodeHandlers for execution.
 *
 * @module pipeline/stage-types
 */

// ============================================================================
// Stage Interface
// ============================================================================

/** Read-only pipeline context passed to every stage. */
export interface PipelineContext {
  /** Unique pipeline execution ID. */
  readonly executionId: string;
  /** The original task/prompt that started the pipeline. */
  readonly task: string;
  /** Pipeline template being executed. */
  readonly templateId: string;
  /** Accumulated state from prior stages. */
  readonly state: Readonly<Record<string, unknown>>;
  /** Cross-stage knowledge store for discoveries, decisions, constraints (#1764). */
  readonly sharedMemory: import('./shared-memory.js').SharedMemoryStore;
}

/** Result of executing a single pipeline stage. */
export interface StageOutput {
  /** The key to store this stage's output under in pipeline state. */
  readonly stateKey: string;
  /** The output value (stored in GraphState). */
  readonly value: unknown;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** Whether the stage succeeded. */
  readonly success: boolean;
  /** Error message if failed. */
  readonly error?: string | undefined;
}

/** A pipeline stage that can be compiled into a graph node. */
export interface IPipelineStage {
  /** Unique stage identifier (used as graph node ID). */
  readonly id: string;
  /** Human-readable stage name. */
  readonly name: string;
  /** Execute the stage. */
  execute(context: PipelineContext): Promise<StageOutput>;
}

// ============================================================================
// Pipeline Template
// ============================================================================

/** Edge definition in a pipeline template. */
export type PipelineEdge =
  | { readonly type: 'fixed'; readonly from: string; readonly to: string }
  | {
      readonly type: 'conditional';
      readonly from: string;
      readonly routerKey: string;
      readonly targets: readonly string[];
    };

/** A declarative pipeline template defining stages and their connections. */
export interface PipelineTemplate {
  /** Unique template identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Ordered stage IDs (for simple linear pipelines). */
  readonly stages: readonly string[];
  /** Edge overrides (for non-linear flows like vote→plan feedback loops). */
  readonly edges?: readonly PipelineEdge[] | undefined;
  /** Stage IDs that can be skipped via dryRun. */
  readonly dryRunStopAfter?: string | undefined;
}

// ============================================================================
// Well-Known State Keys
// ============================================================================

/** Standard state keys used across pipeline templates. */
export const PIPELINE_STATE_KEYS = {
  TASK: 'task',
  RESEARCH: 'research',
  PLAN: 'plan',
  VOTE_RESULT: 'voteResult',
  VOTE_FEEDBACK: 'voteFeedback',
  VOTE_ITERATIONS: 'voteIterations',
  TASKS: 'tasks',
  IMPLEMENTATIONS: 'implementations',
  QA_ITERATIONS: 'qaIterations',
  SECURITY_PASSED: 'securityPassed',
  FINDINGS: 'findings',
  SYNTHESIS: 'synthesis',
  DELIVERABLES: 'deliverables',
  PARSED_SPEC: 'parsedSpec',
  SCAFFOLD_OUTPUT: 'scaffoldOutput',
  COMPLETED: 'completed',
  SHARED_MEMORY: '__sharedMemory__',
} as const;
