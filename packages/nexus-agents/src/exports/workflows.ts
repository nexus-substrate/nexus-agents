/**
 * Workflows exports - Workflow engine with parallel execution
 * Split from index.ts for file size compliance (Issue #285)
 */

export {
  // Workflow parser
  parseWorkflowYaml,
  parseWorkflowJson,
  loadWorkflowFile,
  validateWorkflow,
  // Workflow types
  InputTypeSchema,
  // Note: formatZodErrors internalized in #478 - use workflow-types.ts directly
  type InputType,
  type InputDefinitionInput,
  type InputDefinitionOutput,
  type AgentRoleType,
  type WorkflowStepInput,
  type WorkflowStepOutput,
  type WorkflowDefinitionInput,
  type WorkflowDefinitionOutput,
  type ValidationIssue,
  // Strict schemas
  StrictInputDefinitionSchema,
  StrictAgentRoleSchema,
  StrictWorkflowStepSchema,
  StrictWorkflowDefinitionSchema,
  // Dependency graph
  DependencyGraph,
  buildDependencyGraph,
  validateDependencyGraph,
  getTopologicalOrder,
  // Task queue
  TaskQueue,
  createTaskQueue,
  // Execution planner
  createExecutionPlan,
  validateWorkflowDependencies,
  getExecutionOrder,
  type ExecutionPhase,
  type ExecutionPlan as WorkflowExecutionPlan,
  // Parallel executor
  executeParallel,
  // Note: withRetries, allSucceeded, getFailedSteps internalized in #478
  // Use parallel-executor.ts directly if needed for testing
  type ParallelOptions,
  type ExecutionContext,
  type StepExecutor,
  // Template types
  type TemplateCategory,
  type TemplateMetadata,
  type ITemplateRegistry,
  InputDefinitionSchema,
  AgentRoleSchema,
  WorkflowStepSchema,
  WorkflowDefinitionSchema,
  TemplateCategorySchema,
  TemplateMetadataSchema,
  BUILT_IN_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_KEYWORDS,
  // Template loader
  getBuiltInTemplatesPath,
  parseTemplateContent,
  loadTemplateFile,
  loadTemplatesFromDirectory,
  getBuiltInTemplates,
  getBuiltInTemplatesWithMetadata,
  type ParsedTemplate,
  // Template registry
  createTemplateRegistry,
  createIsolatedRegistry,
  resetRegistry,
  TemplateRegistry,
  // Execution context
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
  type WorkflowExecutionContext,
  type CreateExecutionContextOptions,
  // Expression resolver
  parseExpression,
  resolveExpression,
  resolveInput,
  resolveStringExpressions,
  containsExpressions,
  validateExpressions,
  extractExpressions,
  getReferencedSteps,
  type ExpressionType,
  type ParsedExpression,
  type ResolveResult,
  // Step executor
  AgentStepExecutor,
  createAgentStepExecutor,
  ExpertFactoryAdapter,
  type IExpertFactory as WorkflowExpertFactory,
  type StepExecutorDeps,
  type StepExecutionOptions,
} from '../workflows/index.js';
