/**
 * nexus-agents/swe-bench - Type Definitions
 *
 * Types for SWE-bench benchmark integration.
 *
 * @module swe-bench/types
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { CliNameLiteral } from '../config/model-capabilities-types.js';

/**
 * SWE-bench dataset variants.
 */
export type SWEBenchVariant = 'lite' | 'verified' | 'full';

/**
 * A single SWE-bench instance representing a GitHub issue.
 */
export interface SWEBenchInstance {
  /** Unique identifier (e.g., "django__django-11099"). */
  readonly instance_id: string;
  /** Repository name (e.g., "django/django"). */
  readonly repo: string;
  /** Base commit SHA to checkout. */
  readonly base_commit: string;
  /** The problem statement (issue description). */
  readonly problem_statement: string;
  /** Hints for solving the issue (optional). */
  readonly hints_text?: string;
  /** Created at timestamp. */
  readonly created_at: string;
  /** Test patch for evaluation. */
  readonly test_patch?: string;
  /** Version of the repository. */
  readonly version?: string;
  /** Environment setup script. */
  readonly environment_setup_commit?: string;
}

/**
 * A prediction/solution for a SWE-bench instance.
 */
export interface SWEBenchPrediction {
  /** Instance ID this prediction is for. */
  readonly instance_id: string;
  /** Model or agent name. */
  readonly model_name_or_path: string;
  /** The generated patch (git diff format). */
  readonly model_patch: string;
}

/**
 * Result of running agent on a single instance.
 */
export interface SWEBenchRunResult {
  /** Instance ID. */
  readonly instance_id: string;
  /** Whether the agent completed without error. */
  readonly completed: boolean;
  /** The generated prediction (if completed). */
  readonly prediction?: SWEBenchPrediction;
  /** Error message if failed. */
  readonly error?: string;
  /** Duration in milliseconds. */
  readonly duration_ms: number;
  /** Token usage. */
  readonly tokens_used?: number;
  /** Number of agent iterations/turns. */
  readonly iterations?: number;
}

/**
 * Evaluation result for a single prediction.
 */
export interface SWEBenchEvalResult {
  /** Instance ID. */
  readonly instance_id: string;
  /** Whether the prediction resolved the issue. */
  readonly resolved: boolean;
  /** Test results. */
  readonly tests_status: 'passed' | 'failed' | 'error';
  /** Number of tests that passed. */
  readonly tests_passed?: number;
  /** Number of tests that failed. */
  readonly tests_failed?: number;
  /** Error message if evaluation failed. */
  readonly error?: string;
}

/**
 * Summary of a benchmark run.
 */
export interface SWEBenchSummary {
  /** Dataset variant used. */
  readonly variant: SWEBenchVariant;
  /** Total instances in dataset. */
  readonly total_instances: number;
  /** Instances attempted. */
  readonly attempted: number;
  /** Instances completed (no agent error). */
  readonly completed: number;
  /** Instances resolved (passed evaluation). */
  readonly resolved: number;
  /** Resolution rate (resolved / attempted). */
  readonly resolution_rate: number;
  /** Total tokens used. */
  readonly total_tokens: number;
  /** Average tokens per instance. */
  readonly avg_tokens_per_instance: number;
  /** Total duration in milliseconds. */
  readonly total_duration_ms: number;
  /** Average duration per instance. */
  readonly avg_duration_ms: number;
  /** Model name. */
  readonly model: string;
  /** Run timestamp. */
  readonly timestamp: string;
}

/**
 * Configuration for running SWE-bench.
 */
export interface SWEBenchConfig {
  /** Dataset variant. */
  readonly variant: SWEBenchVariant;
  /** Model to use. */
  readonly model: CliNameLiteral | 'auto';
  /** Maximum instances to run (for testing). */
  readonly limit?: number;
  /** Output path for predictions. */
  readonly output_path: string;
  /** Whether to resume from checkpoint. */
  readonly resume: boolean;
  /** Timeout per instance in milliseconds. */
  readonly timeout_ms: number;
  /** Maximum agent iterations per instance. */
  readonly max_iterations: number;
  /** Working directory for repo clones. */
  readonly work_dir: string;
  /** Number of concurrent workers (1 = sequential). */
  readonly concurrency: number;
  /** Directory for cross-run memory persistence. Empty string disables. */
  readonly memory_dir: string;
  /** Enable MCP tools in child CLI sessions (memory, research). Default: false. */
  readonly mcp_enabled: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_SWE_BENCH_CONFIG: SWEBenchConfig = {
  variant: 'lite',
  model: 'auto',
  output_path: './swe-bench-predictions.jsonl',
  resume: false,
  timeout_ms: 600000, // 10 minutes per instance
  max_iterations: 5,
  work_dir: '/tmp/swe-bench',
  concurrency: 1,
  memory_dir: '/tmp/swe-bench-memory',
  mcp_enabled: false,
};

/**
 * Checkpoint for resuming a run.
 */
export interface SWEBenchCheckpoint {
  /** Config used for the run. */
  readonly config: SWEBenchConfig;
  /** Instance IDs already processed. */
  readonly completed_instances: readonly string[];
  /** Last processed timestamp. */
  readonly last_updated: string;
}

/**
 * Dataset metadata.
 */
export interface SWEBenchDatasetInfo {
  /** Dataset variant. */
  readonly variant: SWEBenchVariant;
  /** Number of instances. */
  readonly num_instances: number;
  /** Repositories included. */
  readonly repositories: readonly string[];
  /** HuggingFace dataset ID. */
  readonly hf_dataset_id: string;
}

/**
 * Dataset variant metadata.
 */
export const SWE_BENCH_DATASETS: Record<SWEBenchVariant, SWEBenchDatasetInfo> = {
  lite: {
    variant: 'lite',
    num_instances: 300,
    repositories: [
      'astropy/astropy',
      'django/django',
      'matplotlib/matplotlib',
      'mwaskom/seaborn',
      'pallets/flask',
      'psf/requests',
      'pydata/xarray',
      'pylint-dev/pylint',
      'pytest-dev/pytest',
      'scikit-learn/scikit-learn',
      'sphinx-doc/sphinx',
      'sympy/sympy',
    ],
    hf_dataset_id: 'princeton-nlp/SWE-bench_Lite',
  },
  verified: {
    variant: 'verified',
    num_instances: 500,
    repositories: [
      'astropy/astropy',
      'django/django',
      'matplotlib/matplotlib',
      'mwaskom/seaborn',
      'pallets/flask',
      'psf/requests',
      'pydata/xarray',
      'pylint-dev/pylint',
      'pytest-dev/pytest',
      'scikit-learn/scikit-learn',
      'sphinx-doc/sphinx',
      'sympy/sympy',
    ],
    hf_dataset_id: 'princeton-nlp/SWE-bench_Verified',
  },
  full: {
    variant: 'full',
    num_instances: 2294,
    repositories: [
      'astropy/astropy',
      'django/django',
      'matplotlib/matplotlib',
      'mwaskom/seaborn',
      'pallets/flask',
      'psf/requests',
      'pydata/xarray',
      'pylint-dev/pylint',
      'pytest-dev/pytest',
      'scikit-learn/scikit-learn',
      'sphinx-doc/sphinx',
      'sympy/sympy',
    ],
    hf_dataset_id: 'princeton-nlp/SWE-bench',
  },
};

// ============================================================================
// Cross-Iteration Context Types (Issue #1417)
// ============================================================================

/** Relevance of a file to the current issue. */
export type FileRelevance = 'high' | 'medium' | 'low';

/** A file explored during an iteration. */
export interface ExploredFile {
  readonly path: string;
  readonly relevance: FileRelevance;
}

/** Outcome of an approach attempt. */
export type ApproachOutcome = 'patch_invalid' | 'patch_rejected' | 'no_patch' | 'success';

/** Record of an attempted approach. */
export interface ApproachRecord {
  readonly iteration: number;
  readonly approach: string;
  readonly outcome: ApproachOutcome;
  readonly errorSummary?: string;
}

/** Cross-iteration context accumulated during agent execution. */
export interface IterationContext {
  /** Files explored and their relevance. */
  readonly filesExplored: readonly ExploredFile[];
  /** Current root cause hypothesis. */
  readonly rootCauseHypothesis: string | null;
  /** History of approaches attempted. */
  readonly approachHistory: readonly ApproachRecord[];
}
