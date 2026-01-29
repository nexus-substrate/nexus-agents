/**
 * nexus-agents/workflows
 *
 * Workflow engine with parallel execution support and built-in templates.
 * Provides YAML/JSON parsing, validation, and dependency graph analysis.
 */

// ============================================================================
// Workflow Parser (strict validation with Zod)
// ============================================================================

export {
  parseWorkflowYaml,
  parseWorkflowJson,
  loadWorkflowFile,
  validateWorkflow,
} from './workflow-parser.js';

// Strict Zod schemas for workflow parsing
export {
  InputTypeSchema,
  formatZodErrors,
  type InputType,
  type InputDefinitionInput,
  type InputDefinitionOutput,
  type AgentRoleType,
  type WorkflowStepInput,
  type WorkflowStepOutput,
  type WorkflowDefinitionInput,
  type WorkflowDefinitionOutput,
  type ValidationIssue,
} from './workflow-types.js';
// Re-export schema names from workflow-types for stricter validation
export {
  InputDefinitionSchema as StrictInputDefinitionSchema,
  AgentRoleSchema as StrictAgentRoleSchema,
  WorkflowStepSchema as StrictWorkflowStepSchema,
  WorkflowDefinitionSchema as StrictWorkflowDefinitionSchema,
} from './workflow-types.js';

// Dependency graph (for parsing validation)
export {
  DependencyGraph,
  buildDependencyGraph,
  validateDependencyGraph,
  getTopologicalOrder,
} from './dependency-graph.js';

// ============================================================================
// Task Queue
// ============================================================================

export { TaskQueue, createTaskQueue } from './task-queue.js';

// ============================================================================
// Execution Planner
// ============================================================================

export {
  createExecutionPlan,
  validateWorkflowDependencies,
  getExecutionOrder,
} from './execution-planner.js';
export type { ExecutionPhase, ExecutionPlan } from './execution-planner.js';

// ============================================================================
// Parallel Executor
// ============================================================================

export { executeParallel, withRetries, allSucceeded, getFailedSteps } from './parallel-executor.js';
export type { ParallelOptions, ExecutionContext, StepExecutor } from './parallel-executor.js';

// ============================================================================
// Template Types (for template registry)
// ============================================================================

export type { TemplateCategory, TemplateMetadata, ITemplateRegistry } from './template-types.js';
export {
  InputDefinitionSchema,
  AgentRoleSchema,
  WorkflowStepSchema,
  WorkflowDefinitionSchema,
  TemplateCategorySchema,
  TemplateMetadataSchema,
  BUILT_IN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_KEYWORDS,
} from './template-types.js';

// ============================================================================
// Template Loader
// ============================================================================

export {
  getBuiltInTemplatesPath,
  parseTemplateContent,
  loadTemplateFile,
  loadTemplatesFromDirectory,
  getBuiltInTemplates,
  getBuiltInTemplatesWithMetadata,
} from './template-loader.js';
export type { ParsedTemplate } from './template-loader.js';

// ============================================================================
// Template Registry
// ============================================================================

export {
  createTemplateRegistry,
  createIsolatedRegistry,
  resetRegistry,
  TemplateRegistry,
} from './template-registry.js';

// ============================================================================
// Workflow Execution Context
// ============================================================================

export {
  createExecutionContext,
  storeStepResult,
  getStepResult,
  setVariable,
  getVariable,
  getCompletedSteps,
  isStepCompleted,
  areStepsCompleted,
  getExecutionDuration,
  cancelExecution,
  isCancelled,
  snapshotContext,
  validateRequiredInputs,
  WorkflowInputsSchema,
} from './execution-context.js';
export type {
  WorkflowExecutionContext,
  CreateExecutionContextOptions,
} from './execution-context.js';

// ============================================================================
// Expression Resolver
// ============================================================================

export {
  parseExpression,
  resolveExpression,
  resolveInput,
  resolveStringExpressions,
  containsExpressions,
  validateExpressions,
  extractExpressions,
  getReferencedSteps,
} from './expression-resolver.js';
export type { ExpressionType, ParsedExpression, ResolveResult } from './expression-resolver.js';

// ============================================================================
// Step Executor (Agent-based)
// ============================================================================

export {
  StepExecutor as AgentStepExecutor,
  createStepExecutor as createAgentStepExecutor,
  ExpertFactoryAdapter,
} from './step-executor.js';
export type { IExpertFactory, StepExecutorDeps, StepExecutionOptions } from './step-executor.js';

// ============================================================================
// Self-Evolving Workflows (SEW)
// ============================================================================

export {
  // Types
  parseVersion,
  formatVersion,
  incrementVersion,
  computeFitnessScore,
  stepsAreDependent,
  findReorderableSteps,
  findParallelizableSteps,
  DEFAULT_FITNESS_METRICS,
  DEFAULT_FITNESS_WEIGHTS,
  DEFAULT_EVOLUTION_CONFIG,
  EvolutionConfigSchema,
  // Mutation operators
  adjustTimeout,
  adjustRetries,
  reorderSteps,
  addParallelization,
  removeParallelization,
  randomTimeoutFactor,
  randomRetryDelta,
  applyRandomMutation,
  createMutant,
  describeMutation,
  // Evolver
  WorkflowEvolver,
  createWorkflowEvolver,
} from './self-evolving/index.js';

export type {
  SemanticVersion,
  FitnessMetrics,
  FitnessWeights,
  WorkflowVersion,
  MutationType,
  WorkflowMutation,
  TimeoutAdjustment,
  RetryAdjustment,
  StepReorder,
  ParallelizationChange,
  EvolutionConfig,
  ExecutionOutcome,
  EvolutionHistoryEntry,
  EvolutionResult,
} from './self-evolving/index.js';

// ============================================================================
// AFlow MCTS-based Workflow Generation (arXiv:2410.10762)
// ============================================================================

export {
  // Types and schemas
  DEFAULT_AFLOW_CONFIG,
  AFlowConfigSchema,
  DEFAULT_ACTION_SPACE_CONFIG,
  // MCTS Tree
  MCTSTree,
  createMCTSTree,
  // Action Space
  ActionSpace,
  createActionSpace,
  // Evaluation
  WorkflowEvaluator,
  createWorkflowEvaluator,
  DEFAULT_EVALUATION_WEIGHTS,
  // AFlow Generator
  AFlowGenerator,
  AFlowError,
  createAFlowGenerator,
  generateWorkflow,
} from './aflow/index.js';

export type {
  // AFlow types
  ActionType,
  WorkflowAction,
  StepModifications,
  MCTSNode,
  UCTScore,
  EvaluationResult,
  AFlowConfig,
  TaskSpecification,
  TaskConstraints as AFlowTaskConstraints,
  AFlowResult,
  SearchHistoryEntry,
  MCTSStats,
  ActionSpaceConfig,
  EvaluationWeights,
  AFlowErrorCode,
} from './aflow/index.js';

// ============================================================================
// Budget Enforcement Circuit Breaker (Issue #349)
// ============================================================================

export {
  // Circuit breaker
  BudgetCircuitBreaker,
  BudgetCircuitError,
  BudgetCircuitErrorCode,
  createBudgetCircuitBreaker,
  checkBudgetResult,
  allocateStepBudgetResult,
  // Config schema
  BudgetCircuitBreakerConfigSchema,
  DEFAULT_BUDGET_CIRCUIT_CONFIG,
  // Budget enforcement functions
  applyBudgetEnforcement,
  enforceBudgetForStep,
  createWorkflowCircuitBreaker,
  resolveStepBudget,
  copyBudgetEvents,
} from './budget-enforcement.js';

export type {
  // Circuit breaker types
  BudgetCircuitState,
  BudgetCircuitBreakerConfig,
  BudgetCircuitSnapshot,
  BudgetCircuitStateChangeEvent,
  BudgetCircuitStateChangeListener,
  BudgetEnforcementResult,
  BudgetUsageSnapshot,
  IBudgetCircuitBreaker,
  StepBudgetAllocation,
  // Budget enforcement types
  BudgetEnforcementEvent,
  BudgetEnforcementConfig,
  EnforceBudgetOptions,
} from './budget-enforcement.js';

// ============================================================================
// Workflow Engine Factory (Issue #430)
// ============================================================================

export {
  createWorkflowEngineDeps,
  createWorkflowEngineDepsAsync,
  createRealWorkflowEngine,
  createInitializedWorkflowEngine,
  createProductionWorkflowEngine,
  initializeBuiltInTemplates,
  clearTemplateCache,
} from './workflow-engine-factory.js';
export type { WorkflowEngineFactoryConfig } from './workflow-engine-factory.js';

// ============================================================================
// LATTS (Locally Adaptive Test-Time Scaling) (Issue #153)
// ============================================================================

export {
  // Types
  type IVerifier,
  type ILattsController,
  type VerificationResult,
  type VerifierContext,
  type LattsDecision,
  type DecisionContext,
  type LattsConfig,
  type LattsHistoryEntry,
  type LattsExecutionResult,
  type LattsStats,
  // Constants and schemas
  DEFAULT_LATTS_CONFIG,
  LattsConfigSchema,
} from './latts-types.js';

export {
  // Verifier
  HeuristicVerifier,
  // Controller
  AdaptiveLattsController,
  // Executor
  LattsExecutor,
  createLattsExecutor,
} from './latts.js';
