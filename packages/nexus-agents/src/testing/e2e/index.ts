/**
 * nexus-agents/testing/e2e - E2E Testing Module
 *
 * Comprehensive end-to-end workflow testing infrastructure.
 * Implements 4-layer testing strategy for workflow validation.
 *
 * @module testing/e2e
 * (Source: Issue #281, Consensus Vote 5-0)
 */

// Types
export type {
  DataClassification,
  E2ETestConfig,
  ScenarioFixture,
  ScenarioResult,
  StepExpectation,
  StepValidation,
  AccuracyEvalConfig,
  AccuracyEvalResult,
  EvaluationFeedback,
  UserJourney,
  JourneyAction,
  JourneyResult,
  ActionResult,
  IScenarioRunner,
  IAccuracyEval,
  IJourneySimulator,
} from './types.js';

export { DEFAULT_E2E_CONFIG, WORKFLOW_QUALITY_THRESHOLDS } from './types.js';

// Scenario Runner (Layer 1)
export {
  ScenarioRunner,
  createScenarioRunner,
  defaultStubFactory,
  type StubFactory,
  type StubFunction,
} from './scenario-runner.js';

// AccuracyEval (Layer 2)
export {
  AccuracyEval,
  createAccuracyEval,
  DefaultQualityEvaluator,
  type IQualityEvaluator,
} from './accuracy-eval.js';

// Journey Simulator (Layer 3)
export {
  JourneySimulator,
  createJourneySimulator,
  DefaultActionExecutor,
  type IActionExecutor,
} from './journey-simulator.js';
