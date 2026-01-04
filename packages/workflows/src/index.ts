/**
 * @nexus-agents/workflows
 *
 * Workflow engine with parallel execution support and built-in templates.
 * Provides YAML/JSON parsing, validation, and dependency graph analysis.
 */

export const VERSION = '0.0.1';

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
