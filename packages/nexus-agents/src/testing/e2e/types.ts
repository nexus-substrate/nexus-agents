/**
 * nexus-agents/testing/e2e - E2E Testing Types
 *
 * Type definitions for end-to-end workflow testing infrastructure.
 * Implements 4-layer testing strategy:
 * - Layer 0: Contract validation
 * - Layer 1: Scenario tests (stubbed)
 * - Layer 2: AccuracyEval (real agents)
 * - Layer 3: User journey simulation
 *
 * @module testing/e2e/types
 * (Source: Issue #281, Consensus Vote 5-0)
 */

import type { WorkflowDefinition, StepResult } from '../../core/index.js';

/**
 * Test data classification for security controls.
 */
export type DataClassification = 'public' | 'internal' | 'sensitive';

/**
 * E2E test configuration.
 */
export interface E2ETestConfig {
  /** Test layer being executed */
  readonly layer: 0 | 1 | 2 | 3;
  /** Enable dry-run mode (log actions without API calls) */
  readonly dryRun: boolean;
  /** Sandbox mode requirement */
  readonly sandboxMode: 'none' | 'policy' | 'container';
  /** Maximum test duration in milliseconds */
  readonly timeoutMs: number;
  /** Cost budget for the test */
  readonly costBudgetUsd?: number;
  /** Data classification for security controls */
  readonly dataClassification: DataClassification;
}

/**
 * Scenario test fixture defining expected workflow behavior.
 */
export interface ScenarioFixture {
  /** Unique scenario identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Description of what is being tested */
  readonly description: string;
  /** Workflow template to test */
  readonly workflow: string;
  /** Input values for the workflow */
  readonly inputs: Record<string, unknown>;
  /** Expected step outputs (pattern matching) */
  readonly expectedOutputs: StepExpectation[];
  /** Maximum execution time in milliseconds */
  readonly timeoutMs: number;
  /** Tags for categorization */
  readonly tags: readonly string[];
  /** Data classification */
  readonly classification: DataClassification;
}

/**
 * Expected output for a workflow step.
 */
export interface StepExpectation {
  /** Step ID to validate */
  readonly stepId: string;
  /** Expected status (matches core StepResult status) */
  readonly status: 'success' | 'failed' | 'skipped';
  /** Output pattern to match (regex or substring) */
  readonly outputPattern?: string;
  /** Maximum duration in milliseconds */
  readonly maxDurationMs?: number;
  /** Required fields in structured output */
  readonly requiredFields?: readonly string[];
}

/**
 * Result of a scenario test execution.
 */
export interface ScenarioResult {
  /** Scenario identifier */
  readonly scenarioId: string;
  /** Whether the scenario passed */
  readonly passed: boolean;
  /** Individual step results */
  readonly stepResults: StepValidation[];
  /** Total execution time */
  readonly durationMs: number;
  /** Error message if failed */
  readonly error?: string;
  /** Execution timestamp */
  readonly executedAt: string;
}

/**
 * Validation result for a single step.
 */
export interface StepValidation {
  /** Step ID */
  readonly stepId: string;
  /** Whether the step passed validation */
  readonly passed: boolean;
  /** Actual step result */
  readonly actual: StepResult | undefined;
  /** Expected values */
  readonly expected: StepExpectation;
  /** Validation failures */
  readonly failures: readonly string[];
}

/**
 * AccuracyEval configuration for Layer 2 testing.
 */
export interface AccuracyEvalConfig {
  /** Name of the evaluation */
  readonly name: string;
  /** Workflow to evaluate */
  readonly workflow: string;
  /** Input for the workflow */
  readonly input: Record<string, unknown>;
  /** Expected output description */
  readonly expectedOutput: string;
  /** Guidelines for evaluation */
  readonly guidelines?: string;
  /** Quality threshold (0-10) */
  readonly qualityThreshold: number;
  /** Number of evaluation runs for averaging */
  readonly numRuns: number;
  /** Evaluator model to use */
  readonly evaluatorModel?: string;
}

/**
 * Result of an AccuracyEval test.
 */
export interface AccuracyEvalResult {
  /** Evaluation name */
  readonly name: string;
  /** Average quality score (0-10) */
  readonly avgScore: number;
  /** Individual run scores */
  readonly scores: readonly number[];
  /** Whether threshold was met */
  readonly passed: boolean;
  /** Threshold that was required */
  readonly threshold: number;
  /** Detailed evaluation feedback */
  readonly feedback: readonly EvaluationFeedback[];
  /** Total token usage */
  readonly totalTokens: number;
  /** Total cost in USD */
  readonly totalCostUsd: number;
  /** Execution duration */
  readonly durationMs: number;
}

/**
 * Feedback from a single evaluation run.
 */
export interface EvaluationFeedback {
  /** Run index */
  readonly runIndex: number;
  /** Quality score (0-10) */
  readonly score: number;
  /** Evaluator reasoning */
  readonly reasoning: string;
  /** Specific issues identified */
  readonly issues: readonly string[];
  /** Strengths identified */
  readonly strengths: readonly string[];
}

/**
 * User journey definition for Layer 3 testing.
 */
export interface UserJourney {
  /** Unique journey identifier */
  readonly id: string;
  /** Journey name */
  readonly name: string;
  /** Description of user goal */
  readonly description: string;
  /** Sequence of user actions */
  readonly actions: readonly JourneyAction[];
  /** Success criteria */
  readonly successCriteria: readonly string[];
  /** Maximum time to first success in milliseconds */
  readonly maxTimeToFirstSuccessMs: number;
}

/**
 * Single action in a user journey.
 */
export interface JourneyAction {
  /** Action type */
  readonly type: 'cli_command' | 'mcp_tool' | 'workflow_run' | 'wait';
  /** Command or tool name */
  readonly command: string;
  /** Arguments */
  readonly args?: Record<string, unknown>;
  /** Expected outcome */
  readonly expectedOutcome?: string;
  /** Maximum duration */
  readonly timeoutMs?: number;
}

/**
 * Result of a user journey execution.
 */
export interface JourneyResult {
  /** Journey identifier */
  readonly journeyId: string;
  /** Whether journey succeeded */
  readonly succeeded: boolean;
  /** Time to first success in milliseconds */
  readonly timeToFirstSuccessMs: number;
  /** Action results */
  readonly actionResults: readonly ActionResult[];
  /** Total duration */
  readonly durationMs: number;
  /** Failure point if failed */
  readonly failedAtAction?: number;
  /** Error message if failed */
  readonly error?: string;
}

/**
 * Result of a single journey action.
 */
export interface ActionResult {
  /** Action index */
  readonly index: number;
  /** Whether action succeeded */
  readonly succeeded: boolean;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Output produced */
  readonly output?: string;
  /** Error if failed */
  readonly error?: string;
}

/**
 * Quality thresholds per workflow type.
 */
export const WORKFLOW_QUALITY_THRESHOLDS: Record<string, number> = {
  'code-review': 8.5,
  'feature-implementation': 7.5,
  'bug-fix': 8.0,
  'security-audit': 9.0,
  'test-generation': 7.5,
  'documentation-update': 7.0,
  refactoring: 7.5,
} as const;

/**
 * Default E2E test configuration.
 */
export const DEFAULT_E2E_CONFIG: E2ETestConfig = {
  layer: 1,
  dryRun: false,
  sandboxMode: 'policy',
  timeoutMs: 300000, // 5 minutes
  dataClassification: 'internal',
} as const;

/**
 * Interface for scenario runner.
 */
export interface IScenarioRunner {
  /**
   * Load a scenario fixture from file.
   */
  loadFixture(path: string): Promise<ScenarioFixture>;

  /**
   * Run a scenario test.
   */
  run(scenario: ScenarioFixture, config?: Partial<E2ETestConfig>): Promise<ScenarioResult>;

  /**
   * Run multiple scenarios.
   */
  runAll(scenarios: ScenarioFixture[], config?: Partial<E2ETestConfig>): Promise<ScenarioResult[]>;

  /**
   * Validate a workflow definition against its schema (Layer 0).
   */
  validateContract(workflow: WorkflowDefinition): string[];
}

/**
 * Interface for accuracy evaluator.
 */
export interface IAccuracyEval {
  /**
   * Run an accuracy evaluation.
   */
  evaluate(config: AccuracyEvalConfig): Promise<AccuracyEvalResult>;

  /**
   * Record evaluation result to feedback integration.
   */
  recordFeedback(result: AccuracyEvalResult, routingId?: string): void;
}

/**
 * Interface for journey simulator.
 */
export interface IJourneySimulator {
  /**
   * Load a journey definition.
   */
  loadJourney(path: string): Promise<UserJourney>;

  /**
   * Simulate a user journey.
   */
  simulate(journey: UserJourney): Promise<JourneyResult>;

  /**
   * Generate documentation from journey.
   */
  generateDocs(journey: UserJourney, result: JourneyResult): string;
}
