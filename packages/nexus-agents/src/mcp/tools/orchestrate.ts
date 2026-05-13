/* eslint-disable max-lines -- Cohesive orchestration tool (types already extracted to orchestrate-types.ts) */
/**
 * MCP tool for task orchestration with intelligent workflow pattern routing.
 * Types/schemas in orchestrate-types.ts (Issue #708). Routing via Issue #846.
 * @module mcp/tools/orchestrate
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger, Result, Task, TaskContext } from '../../core/index.js';
import { getErrorMessage } from '../../core/index.js';
import { MCP_TIMEOUTS, HEARTBEAT_TIMEOUTS, getMcpSafeDeadlineMs } from '../../config/timeouts.js';
import { getHeartbeatMonitor } from '../../agents/heartbeat-monitor.js';
import { raceAgainstDeadline } from '../../core/race/race-against-deadline.js';
import {
  createOrchestrationStateSnapshot,
  setRouting,
  setAnalysis,
  type OrchestrationStateSnapshot,
} from './orchestration-state-snapshot.js';

import {
  orchestrateInputToTaskContract,
  executeOrchestratePipeline,
} from '../../pipeline/v2-orchestrate.js';
import { resolveV2Config } from '../../pipeline/v2-config.js';
import {
  ok,
  err,
  createLogger,
  getTimeProvider,
  getRandomProvider,
  formatZodError,
} from '../../core/index.js';
import type {
  IOrchestrator,
  OrchestratorDefinition,
  OrchestratorType,
} from '../../core/types/orchestrator.js';
import { wrapToolWithTimeout, toSdkCallback } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { withDepthGuard } from '../middleware/spawn-depth-guard.js';
import { toolError, toolSuccess, type ToolResult } from './tool-result.js';
import {
  createMcpNotifier,
  NOOP_NOTIFIER,
  withProgressHeartbeat,
  abortSignalStorage,
} from '../mcp-notifier.js';
import type { ExecutionPlan } from '../../agents/index.js';
import { createOrchestratorWithSica } from './orchestrate-sica.js';
import { OrchestratorFactory } from '../../orchestration/orchestrator-factory.js';
import { createWorkflowRouter, type IWorkflowRouter } from '../../orchestration/workflow-router.js';
import { getToolMemory } from './tool-memory.js';
import { getAutoCatalog } from './research-auto-catalog.js';
import { computeAgentPlan } from './orchestrate-aorchestra.js';
import {
  executeWorkerDispatch,
  isWorkerDispatchEnabled,
  recordWorkerOutcomes,
} from './orchestrate-dispatch.js';
import { generateReflection } from './orchestrate-reflection.js';
import {
  getOutcomeStore,
  categorizeOutcomeErrorMessage,
} from '../../orchestration/outcomes/index.js';
import type { OutcomeFailureCategory } from '../../orchestration/outcomes/index.js';
import { detectTaskCategory } from '../../config/task-specialization.js';
import { DEFAULT_CLI, type CliNameLiteral } from '../../config/model-capabilities-types.js';
import {
  OrchestrateInputSchema,
  ORCHESTRATE_TOOL_SCHEMA,
  OrchestrationError,
  mapPatternToOrchestratorType,
  type OrchestrateInput,
  type OrchestrateOutput,
  type OrchestrateDeps,
  type RoutingInfo,
} from './orchestrate-types.js';
// ClawGuard access-policy derivation (#1977, #2022).
// When NEXUS_ACCESS_POLICY_MODE is unset/off, this returns a bypass policy
// and the middleware short-circuits — zero behavior change from pre-#2022.
import {
  deriveAccessPolicy,
  withAccessPolicy,
  resolveAccessPolicyMode,
} from '../../security/access-constraint-deriver/index.js';
// Structured task state (#2033, integration from #2043). Enabled by
// default from v2.50+; set NEXUS_TASK_STATE_ENABLED=0 to opt out.
// When disabled, helpers no-op silently.
import { initTaskState, updateStage, appendBlocker } from '../../context/structured-task-state.js';
import type { StructuredTaskState } from '../../context/structured-task-state-types.js';

// Re-export types and values for consumers
export {
  OrchestrateInputSchema,
  OrchestrateOutputSchema,
  OrchestrationError,
  OrchestrationUnavailableError,
  createMockOrchestrator,
  mapPatternToOrchestratorType,
  type OrchestrateInput,
  type OrchestrateOutput,
  type OrchestrateDeps,
  type RoutingInfo,
} from './orchestrate-types.js';

// ============================================================================
// Task Creation & Output Building
// ============================================================================

function generateTaskId(): string {
  const timestamp = getTimeProvider().now().toString(36);
  const random = getRandomProvider().random().toString(36).substring(2, 8);
  return `orch-${timestamp}-${random}`;
}

async function createTaskFromInput(input: OrchestrateInput, taskId: string): Promise<Task> {
  const context: TaskContext = {};
  if (input.context !== undefined) {
    context.metadata = input.context;
  }

  // Inject relevant past learnings and beliefs into task context
  try {
    const mem = getToolMemory();
    const learnings = mem.getRelevantLearnings(input.task);
    if (learnings !== undefined) {
      context.metadata = { ...context.metadata, _pastLearnings: learnings };
    }
    const beliefs = await mem.getRelevantBeliefs(input.task.split(/\s+/).slice(0, 3).join(' '));
    if (beliefs !== undefined) {
      context.metadata = { ...context.metadata, _beliefs: beliefs };
    }
  } catch (memErr: unknown) {
    // Memory retrieval is best-effort — log for diagnostics
    createLogger({ tool: 'orchestrate' }).debug('Memory retrieval failed', {
      error: memErr instanceof Error ? memErr.message : String(memErr),
    });
  }

  return {
    id: taskId,
    description: input.task,
    context,
    constraints: { maxTokens: input.maxIterations * 1000 },
  };
}

function buildOutputFromOrchestratorResult(
  taskId: string,
  orchResult: import('../../core/types/orchestrator.js').OrchestratorResult,
  durationMs: number,
  routing?: RoutingInfo
): OrchestrateOutput {
  const raw = orchResult.output as Record<string, unknown>;
  const executionPlan =
    raw.output !== undefined && typeof raw.output === 'object'
      ? (raw.output as Partial<ExecutionPlan>)
      : (raw as Partial<ExecutionPlan>);

  const analysis = executionPlan.analysis ?? {
    taskId,
    complexity: 5,
    taskType: 'general',
    requirements: [],
    risks: [],
    needsDecomposition: false,
    approach: 'Direct execution',
    estimatedEffort: 1,
  };

  return {
    taskId,
    analysis: {
      taskId: analysis.taskId,
      complexity: analysis.complexity,
      taskType: analysis.taskType,
      requirements: analysis.requirements,
      risks: analysis.risks,
      needsDecomposition: analysis.needsDecomposition,
      approach: analysis.approach,
      estimatedEffort: analysis.estimatedEffort,
    },
    routing,
    result: orchResult.steps.length > 0 ? orchResult.steps[orchResult.steps.length - 1] : undefined,
    stepsCompleted: orchResult.steps.length,
    metadata: {
      durationMs,
      tokensUsed: orchResult.totalTokensUsed,
      expertsUsed: orchResult.agentsUsed,
    },
  };
}

// ============================================================================
// Orchestrator Factory & Error Helpers
// ============================================================================

function createOrchestratorFromDeps(
  deps: OrchestrateDeps,
  logger: ILogger,
  orchestratorType?: OrchestratorType
): IOrchestrator {
  if (deps.orchestrator !== undefined) return deps.orchestrator;
  const techLead = createOrchestratorWithSica(logger, deps.modelAdapter);
  const factory = new OrchestratorFactory({
    logger,
    techLead: techLead as { execute: (task: unknown) => Promise<Result<unknown, unknown>> },
  });
  return factory.create(orchestratorType ?? 'orchestrator');
}

function createErrorOptions(
  taskId: string,
  cause: Error | undefined
): { cause?: Error; context: Record<string, unknown> } {
  const options: { cause?: Error; context: Record<string, unknown> } = { context: { taskId } };
  if (cause !== undefined) options.cause = cause;
  return options;
}

// ============================================================================
// Memory Recording (Issue #690)
// ============================================================================

/** Fire-and-forget promotion pipeline runner (Issue #753). */
function triggerPromotionPipeline(toolName: string): void {
  void getToolMemory()
    .runPromotionPipeline()
    .then((stats) => {
      if (stats.learningsPromotedToBelief > 0 || stats.beliefsPromotedToAgentic > 0) {
        createLogger({ tool: toolName }).debug('Promotion pipeline completed', {
          learningsPromoted: stats.learningsPromotedToBelief,
          beliefsPromoted: stats.beliefsPromotedToAgentic,
        });
      }
    })
    .catch((error: unknown) => {
      createLogger({ tool: toolName }).warn('Promotion pipeline failed', { error });
    });
}

/** Optional fields for outcome recording. */
interface OutcomeRecordOptions {
  readonly failureCategory?: OutcomeFailureCategory;
  readonly errorMessage?: string;
  readonly actualCli?: CliNameLiteral;
}

/** Build failure fields for outcome record. */
function buildOutcomeFailureFields(opts?: OutcomeRecordOptions): Record<string, string> {
  const fields: Record<string, string> = {};
  if (opts?.failureCategory !== undefined) fields['failureCategory'] = opts.failureCategory;
  if (opts?.errorMessage !== undefined) fields['errorMessage'] = opts.errorMessage.slice(0, 500);
  return fields;
}

/** Records orchestration outcome to OutcomeStore (Issue #1014). Best-effort, never throws. */
function recordToOutcomeStore(
  taskDescription: string,
  success: boolean,
  durationMs: number,
  opts?: OutcomeRecordOptions
): void {
  try {
    const match = detectTaskCategory(taskDescription);
    const cli = opts?.actualCli ?? match?.primaryCli ?? DEFAULT_CLI;
    const category = match?.category ?? 'exploration';
    getOutcomeStore().append({
      id: `orch-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 8)}`,
      cli,
      category,
      model: 'orchestrator',
      success,
      durationMs,
      timestamp: new Date(getTimeProvider().now()).toISOString(),
      source: 'delegate',
      ...buildOutcomeFailureFields(opts),
    });
  } catch (error: unknown) {
    createLogger({ tool: 'orchestrate' }).debug('Best-effort outcome recording failed', {
      error: getErrorMessage(error),
    });
  }
}

function recordOrchestrationSuccess(
  taskId: string,
  taskDescription: string,
  stepsCompleted: number,
  durationMs: number
): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Orchestrated: ${taskDescription.slice(0, 100)}`,
      challenges: [],
      durationMs,
    });
    memory.recordLearning({
      pattern: `Orchestration completed in ${String(stepsCompleted)} steps`,
      context: `task=${taskId}`,
      confidence: 0.7,
      source: 'orchestrate-tool',
    });
    void memory.recordBelief(
      taskDescription.split(/\s+/).slice(0, 3).join(' '),
      'orchestrated-successfully-in',
      `${String(stepsCompleted)} steps (${String(durationMs)}ms)`,
      'medium'
    );
  } catch (error: unknown) {
    createLogger({ tool: 'orchestrate' }).debug('Best-effort memory recording failed', {
      error: getErrorMessage(error),
      taskId,
    });
  }

  try {
    getAutoCatalog().scanAndRecord(taskDescription, 'orchestrate');
  } catch (error: unknown) {
    createLogger({ tool: 'orchestrate' }).debug('Best-effort auto-catalog scan failed', {
      error: getErrorMessage(error),
    });
  }

  recordToOutcomeStore(taskDescription, true, durationMs);
  triggerPromotionPipeline('orchestrate');
}

function recordOrchestrationError(
  errorMessage: string,
  taskDescription: string,
  durationMs?: number
): void {
  try {
    const memory = getToolMemory();
    memory.recordError({
      error: errorMessage.slice(0, 200),
      solution: 'Pending - orchestration failed',
      filePattern: 'mcp/tools/orchestrate',
    });
    memory.recordLearning({
      pattern: `Orchestration failure: ${errorMessage.slice(0, 80)}`,
      context: `task=${taskDescription.slice(0, 60)}`,
      confidence: 0.5,
      source: 'orchestrate-tool-error',
    });
  } catch (error: unknown) {
    createLogger({ tool: 'orchestrate' }).debug('Best-effort error recording failed', {
      error: getErrorMessage(error),
    });
  }
  const fc = categorizeOutcomeErrorMessage(errorMessage);
  // Skip OutcomeStore recording for adapter-unavailable errors (#1214).
  // These are infrastructure issues (missing API keys), not task failures.
  // Recording them as failures poisons the weather_report success rates.
  if (fc !== 'adapter_unavailable') {
    recordToOutcomeStore(taskDescription, false, durationMs ?? 0, {
      failureCategory: fc,
      errorMessage,
    });
  }
}

// ============================================================================
// Execution & Registration
// ============================================================================

/** Routes task and creates routing context for executeOrchestration (Issue #846). */
function routeAndPrepare(
  input: OrchestrateInput,
  deps: OrchestrateDeps,
  router?: IWorkflowRouter
): {
  workflowRouter: IWorkflowRouter;
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision;
  orchestrator: IOrchestrator;
  logger: ILogger;
} {
  const logger = deps.logger ?? createLogger({ tool: 'orchestrate' });
  const workflowRouter = router ?? createWorkflowRouter({ logger });
  const decision = workflowRouter.route({ description: input.task });
  const orchType = mapPatternToOrchestratorType(decision.pattern);
  logger.info('Workflow pattern selected', {
    pattern: decision.pattern,
    orchestratorType: orchType,
  });
  const orchestrator = createOrchestratorFromDeps(deps, logger, orchType);
  return { workflowRouter, decision, orchestrator, logger };
}

/** Builds RoutingInfo from decision + mapped type. */
function buildRoutingInfo(
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision
): RoutingInfo {
  return {
    pattern: decision.pattern,
    reasoning: decision.reasoning,
    confidence: decision.confidence,
    orchestratorType: mapPatternToOrchestratorType(decision.pattern),
  };
}

/** Records a workflow outcome to the router. */
function recordRouterOutcome(
  workflowRouter: IWorkflowRouter,
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision,
  success: boolean,
  durationMs: number
): void {
  workflowRouter.recordOutcome({
    pattern: decision.pattern,
    taskType: decision.analysis.taskType,
    success,
    durationMs,
    timestamp: getTimeProvider().now(),
  });
}

/** Handles unexpected exceptions during orchestration. */
function handleOrchestrationException(
  error: unknown,
  taskId: string,
  task: string,
  logger: import('../../core/index.js').ILogger
): Result<OrchestrateOutput, OrchestrationError> {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const cause = error instanceof Error ? error : undefined;
  logger.error('Orchestration exception', cause, { taskId });
  recordOrchestrationError(message, task);
  return err(
    new OrchestrationError(
      `Orchestration failed unexpectedly: ${message}`,
      createErrorOptions(taskId, cause)
    )
  );
}

/** Starts a heartbeat session with periodic stall detection (Issue #1087). */
function startHeartbeatTracking(label: string, logger: ILogger): { cleanup: () => void } {
  const monitor = getHeartbeatMonitor();
  const sessionId = monitor.startSession(label);
  const timer = setInterval(() => {
    monitor.heartbeat(sessionId);
    if (monitor.isStalled(sessionId)) {
      logger.warn('Orchestration session stalled', { label, sessionId });
    }
  }, HEARTBEAT_TIMEOUTS.heartbeatIntervalMs);
  return {
    cleanup: (): void => {
      clearInterval(timer);
      monitor.endSession(sessionId);
    },
  };
}

/** Fast-path for simple tasks: return structural analysis without LLM call (Issue #1132). */
function buildSimpleTaskResult(
  taskId: string,
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision,
  durationMs: number
): OrchestrateOutput {
  return {
    taskId,
    analysis: {
      taskId,
      complexity: Math.round(decision.analysis.complexityScore * 10) || 1,
      taskType: decision.analysis.taskType,
      requirements: [],
      risks: [],
      needsDecomposition: false,
      approach: `Low complexity ${decision.analysis.taskType} task. Direct implementation with basic validation.`,
      estimatedEffort: decision.analysis.estimatedTokens,
    },
    routing: buildRoutingInfo(decision),
    result: undefined,
    stepsCompleted: 0,
    metadata: { durationMs, tokensUsed: 0, expertsUsed: [] },
  };
}

/** Fast-path: simple tasks skip expensive LLM orchestration (Issue #1132). */
function trySimpleTaskFastPath(ctx: {
  taskId: string;
  task: string;
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision;
  workflowRouter: IWorkflowRouter;
  startTime: number;
  logger: ILogger;
}): Result<OrchestrateOutput, OrchestrationError> | undefined {
  if (ctx.decision.analysis.complexity !== 'simple') return undefined;
  const durationMs = getTimeProvider().now() - ctx.startTime;
  ctx.logger.info('Simple task fast-path', {
    taskId: ctx.taskId,
    taskType: ctx.decision.analysis.taskType,
    durationMs,
  });
  recordOrchestrationSuccess(ctx.taskId, ctx.task, 0, durationMs);
  recordRouterOutcome(ctx.workflowRouter, ctx.decision, true, durationMs);
  return ok(buildSimpleTaskResult(ctx.taskId, ctx.decision, durationMs));
}

/** Handles orchestrator.execute() returning a failure Result. */
function handleOrchestratorFailure(ctx: {
  error: Error;
  taskId: string;
  task: string;
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision;
  workflowRouter: IWorkflowRouter;
  startTime: number;
  logger: ILogger;
}): Result<OrchestrateOutput, OrchestrationError> {
  const failDuration = getTimeProvider().now() - ctx.startTime;
  ctx.logger.error('Orchestration failed', ctx.error, { taskId: ctx.taskId });
  recordOrchestrationError(ctx.error.message, ctx.task, failDuration);
  recordRouterOutcome(ctx.workflowRouter, ctx.decision, false, failDuration);
  const cause = ctx.error instanceof Error ? ctx.error : undefined;
  return err(
    new OrchestrationError(
      `Task execution failed: ${ctx.error.message}`,
      createErrorOptions(ctx.taskId, cause)
    )
  );
}

/** Builds output and records success outcome. */
function handleOrchestratorSuccess(ctx: {
  orchResult: import('../../core/types/orchestrator.js').OrchestratorResult;
  taskId: string;
  taskDescription: string;
  decision: import('../../orchestration/workflow-router-types.js').RoutingDecision;
  workflowRouter: IWorkflowRouter;
  startTime: number;
  logger: ILogger;
}): Result<OrchestrateOutput, OrchestrationError> {
  const durationMs = getTimeProvider().now() - ctx.startTime;
  const output = buildOutputFromOrchestratorResult(
    ctx.taskId,
    ctx.orchResult,
    durationMs,
    buildRoutingInfo(ctx.decision)
  );
  recordOrchestrationSuccess(ctx.taskId, ctx.taskDescription, output.stepsCompleted, durationMs);
  recordRouterOutcome(ctx.workflowRouter, ctx.decision, true, durationMs);
  ctx.logger.info('Orchestration completed', {
    taskId: ctx.taskId,
    durationMs,
    stepsCompleted: output.stepsCompleted,
  });
  return ok(output);
}

async function executeOrchestration(
  input: OrchestrateInput,
  deps: OrchestrateDeps,
  router?: IWorkflowRouter,
  snapshot?: OrchestrationStateSnapshot
): Promise<Result<OrchestrateOutput, OrchestrationError>> {
  const { workflowRouter, decision, orchestrator, logger } = routeAndPrepare(input, deps, router);
  const taskId = generateTaskId();
  const startTime = getTimeProvider().now();
  // Snapshot: routing decision available once routeAndPrepare returns (#2111)
  if (snapshot !== undefined) setRouting(snapshot, buildRoutingInfo(decision));
  const fastResult = trySimpleTaskFastPath({
    taskId,
    task: input.task,
    decision,
    workflowRouter,
    startTime,
    logger,
  });
  if (fastResult !== undefined) {
    // Fast-path produced a full analysis — capture it for the deadline handler
    if (snapshot !== undefined && fastResult.ok) setAnalysis(snapshot, fastResult.value.analysis);
    return fastResult;
  }
  logger.info('Starting orchestration', { taskId, taskLength: input.task.length });
  recordTaskStateInit(taskId, input.task, logger);
  const task = await createTaskFromInput(input, taskId);
  const definition: OrchestratorDefinition = { type: 'task', task };
  const hb = startHeartbeatTracking(`orchestrate-${taskId}`, logger);
  const policy = await deriveOrchestratePolicy(input.task, deps, logger);
  try {
    return await runOrchestratorWithStateTracking({
      taskId,
      taskInput: input.task,
      definition,
      orchestrator,
      policy,
      decision,
      workflowRouter,
      startTime,
      logger,
    });
  } catch (error) {
    recordTaskStateBlocker(taskId, error instanceof Error ? error.message : String(error), logger);
    recordTaskStateStage(taskId, 'blocked', logger);
    return handleOrchestrationException(error, taskId, input.task, logger);
  } finally {
    hb.cleanup();
  }
}

/** Run the orchestrator and record success/failure stage transitions (#2043). */
async function runOrchestratorWithStateTracking(params: {
  readonly taskId: string;
  readonly taskInput: string;
  readonly definition: OrchestratorDefinition;
  readonly orchestrator: IOrchestrator;
  readonly policy: Awaited<ReturnType<typeof deriveAccessPolicy>>;
  readonly decision: import('../../orchestration/workflow-router-types.js').RoutingDecision;
  readonly workflowRouter: IWorkflowRouter;
  readonly startTime: number;
  readonly logger: ILogger;
}): Promise<Result<OrchestrateOutput, OrchestrationError>> {
  const { taskId, taskInput, definition, orchestrator, policy, logger } = params;
  recordTaskStateStage(taskId, 'executing', logger);
  const result = await withAccessPolicy(policy, () => orchestrator.execute(definition, {}));
  if (!result.ok) {
    recordTaskStateBlocker(taskId, result.error.message, logger);
    recordTaskStateStage(taskId, 'blocked', logger);
    return handleOrchestratorFailure({
      error: result.error,
      taskId,
      task: taskInput,
      decision: params.decision,
      workflowRouter: params.workflowRouter,
      startTime: params.startTime,
      logger,
    });
  }
  recordTaskStateStage(taskId, 'complete', logger);
  return handleOrchestratorSuccess({
    orchResult: result.value,
    taskId,
    taskDescription: taskInput,
    decision: params.decision,
    workflowRouter: params.workflowRouter,
    startTime: params.startTime,
    logger,
  });
}

/** Opt-in flag for structured-task-state recording (#2033). */
/**
 * Structured task-state recording is ON by default as of v2.50+. Set
 * `NEXUS_TASK_STATE_ENABLED=0` (or `false`) to opt out — any other value
 * (or unset) leaves it enabled.
 */
function isTaskStateEnabled(): boolean {
  const raw = process.env['NEXUS_TASK_STATE_ENABLED'];
  if (raw === undefined || raw === '') return true;
  const normalized = raw.toLowerCase();
  return normalized !== '0' && normalized !== 'false';
}

/**
 * Initialize structured state for this orchestration (#2033). On by
 * default; set NEXUS_TASK_STATE_ENABLED=0 to opt out. Never throws —
 * failures are logged and ignored.
 */
function recordTaskStateInit(taskId: string, taskText: string, logger: ILogger): void {
  if (!isTaskStateEnabled()) return;
  const now = getTimeProvider().nowIso();
  const initial: StructuredTaskState = {
    taskId,
    stage: 'planning',
    decisions: [],
    blockers: [],
    position: { currentStep: 'orchestrate.init' },
    updatedAt: now,
  };
  const result = initTaskState(initial);
  if (!result.ok) {
    logger.warn('task-state: init failed, continuing', {
      taskId,
      error: result.error.message,
      taskLength: taskText.length,
    });
  }
}

/** Record a stage transition. Silently swallows failures. */
function recordTaskStateStage(
  taskId: string,
  stage: StructuredTaskState['stage'],
  logger: ILogger
): void {
  if (!isTaskStateEnabled()) return;
  const result = updateStage(taskId, stage, getTimeProvider().nowIso());
  if (!result.ok) {
    logger.warn('task-state: stage update failed', {
      taskId,
      stage,
      error: result.error.message,
    });
  }
}

/** Record a blocker. Silently swallows failures. */
function recordTaskStateBlocker(taskId: string, blocker: string, logger: ILogger): void {
  if (!isTaskStateEnabled()) return;
  const ts = getTimeProvider().nowIso();
  const result = appendBlocker(taskId, { ts, blocker });
  if (!result.ok) {
    logger.warn('task-state: blocker record failed', {
      taskId,
      error: result.error.message,
    });
  }
}

/**
 * Derive a ClawGuard access policy for this orchestration (#1977, #2022).
 *
 * Returns a live policy when `NEXUS_ACCESS_POLICY_MODE=audit|enforce` and
 * a model adapter is available; returns a bypass policy in `off` mode
 * (the default), which makes the mounted middleware short-circuit to
 * pass-through.
 *
 * Never throws — derivation failure falls back to a permissive `off`
 * policy so orchestration proceeds. All failures are logged.
 */
async function deriveOrchestratePolicy(
  taskText: string,
  deps: OrchestrateDeps,
  logger: ILogger
): Promise<Awaited<ReturnType<typeof deriveAccessPolicy>>> {
  const mode = resolveAccessPolicyMode();
  try {
    const opts: Parameters<typeof deriveAccessPolicy>[1] = {
      mode,
      trustTier: '1',
      ...(deps.modelAdapter !== undefined ? { adapter: deps.modelAdapter } : {}),
    };
    const policy = await deriveAccessPolicy(taskText, opts);
    if (mode !== 'off') {
      logger.info('access-policy: derived', {
        mode,
        source: policy.source,
        allowedToolsWildcard: policy.allowedTools === '*',
      });
    }
    return policy;
  } catch (error) {
    logger.warn('access-policy: derivation failed, falling back to off', {
      error: getErrorMessage(error),
    });
    return {
      allowedTools: '*',
      allowedPathPatterns: [],
      allowedOperations: '*',
      objectiveHash: 'derivation-failed',
      derivedAt: getTimeProvider().nowIso(),
      source: 'bypass',
      mode: 'off',
    };
  }
}

/** Fire-and-forget V2 pipeline instrumentation (Phase E, Issue #924). */
function instrumentV2Orchestrate(input: { task: string }, logger: ILogger): void {
  const tc = orchestrateInputToTaskContract(input);
  void executeOrchestratePipeline(tc)
    .then((m) => {
      logger.info('V2 orchestrate pipeline', { ...m });
    })
    .catch((error: unknown) => {
      logger.debug('V2 orchestrate pipeline failed', { error: getErrorMessage(error) });
    });
}

/** Try worker dispatch if conditions are met (Issue #1303). Best-effort, returns undefined on failure. */
async function tryWorkerDispatch(
  agentPlan: ReturnType<typeof computeAgentPlan>,
  task: string,
  deps: OrchestrateDeps,
  logger: import('../../core/index.js').ILogger,
  notifier: import('../mcp-notifier.js').IMcpNotifier
): Promise<Awaited<ReturnType<typeof executeWorkerDispatch>> | undefined> {
  const adapter = deps.modelAdapter;
  if (agentPlan === undefined || !isWorkerDispatchEnabled() || adapter === undefined) {
    return undefined;
  }
  // Short-circuit if the MCP client has already cancelled the request.
  // The MCP middleware parks the active AbortSignal in AsyncLocalStorage;
  // checking it here avoids kicking off expensive worker dispatch for a
  // request the client no longer cares about.
  const abortSignal = abortSignalStorage.getStore();
  if (abortSignal?.aborted === true) {
    logger.info('Worker dispatch aborted before start (client cancelled)');
    return undefined;
  }
  try {
    return await withProgressHeartbeat('worker-dispatch', notifier, () =>
      executeWorkerDispatch({
        agentPlan,
        taskDescription: task,
        modelAdapter: adapter,
        logger,
        synthesize: true,
        refine: true,
        perWorkerRouting: true,
      })
    );
  } catch (dispatchError: unknown) {
    logger.warn('Worker dispatch failed, continuing with standard orchestration', {
      error: dispatchError instanceof Error ? dispatchError.message : String(dispatchError),
    });
    return undefined;
  }
}

/**
 * Compute aggregate worker-dispatch status (#2619 bug 1). Returns
 * undefined when dispatch did not run (no decomposition / feature
 * disabled / zero workers planned) so the field is omitted from the
 * output. `failed` = every dispatched worker errored — caller needs to
 * see this distinctly from a normal `successCount > 0` partial run.
 */
function computeWorkerDispatchStatus(
  dispatch: { totalWorkers: number; successCount: number } | undefined
): 'success' | 'partial' | 'failed' | undefined {
  if (dispatch === undefined || dispatch.totalWorkers === 0) return undefined;
  if (dispatch.successCount === 0) return 'failed';
  if (dispatch.successCount === dispatch.totalWorkers) return 'success';
  return 'partial';
}

/**
 * Assemble final orchestrate tool output (Issue #1310).
 *
 * When every dispatched worker errored (`workerDispatchStatus === 'failed'`,
 * see #2619 bug 1) the structured payload is returned via `toolError` so
 * the MCP-layer `isError` flag flips true. The full JSON (including
 * `workerDispatch.results[].errorMessage`) remains in the body so callers
 * can inspect per-worker reasons; the only change is that callers that
 * only check the outer status no longer silently get an empty success.
 *
 * Exported for unit testing only — downstream code should not call this
 * helper directly.
 */
export function assembleOrchestrateOutput(
  orchestrationResult: Record<string, unknown>,
  agentPlan: ReturnType<typeof computeAgentPlan>,
  workerDispatchResult: Awaited<ReturnType<typeof executeWorkerDispatch>> | undefined
): ToolResult {
  const hasSynthesis =
    workerDispatchResult?.synthesis !== undefined && workerDispatchResult.synthesis !== '';
  const workerDispatchStatus = computeWorkerDispatchStatus(workerDispatchResult);

  const output = {
    ...orchestrationResult,
    ...(agentPlan !== undefined ? { agentPlan } : {}),
    ...(workerDispatchResult !== undefined ? { workerDispatch: workerDispatchResult } : {}),
    ...(hasSynthesis ? { synthesizedResponse: workerDispatchResult.synthesis } : {}),
    ...(workerDispatchStatus !== undefined ? { workerDispatchStatus } : {}),
  };
  const body = JSON.stringify(output, null, 2);
  return workerDispatchStatus === 'failed' ? toolError(body) : toolSuccess(body);
}

/** Record worker outcomes + fire-and-forget reflection (Issue #1323, #1392). */
function recordAndReflect(
  dispatchResult: Awaited<ReturnType<typeof executeWorkerDispatch>> | undefined,
  task: string,
  deps: OrchestrateDeps
): void {
  if (dispatchResult === undefined) return;
  recordWorkerOutcomes(dispatchResult.results, task);
  if (deps.modelAdapter !== undefined) {
    void generateReflection(task, dispatchResult.results, deps.modelAdapter);
  }
}

/**
 * Builds a structured partial OrchestrateOutput for wall-clock timeouts
 * (sub-issue B of #2104). Returns an `ok` Result so the happy-path
 * assembler runs and the client sees structured data instead of a naked
 * wrapper error. `timeoutReason` in `metadata` is the client's signal to
 * distinguish a truncated run from a normal low-depth one.
 *
 * If `snapshot` is provided (issue #2111 follow-up), analysis / routing /
 * stepsCompleted are populated from whatever the orchestration captured
 * before the deadline fired, instead of sentinel values.
 *
 * Exported for unit testing only; downstream code should NOT call this
 * helper directly — it is internal plumbing for `executeOrchestrationWithDeadline`.
 */
export function buildTimeoutOrchestrationResult(
  taskId: string,
  elapsedMs: number,
  reason: string,
  snapshot?: OrchestrationStateSnapshot
): Result<OrchestrateOutput, OrchestrationError> {
  // analysis.complexity has a schema min of 1 (see orchestrate-types.ts);
  // use 1 as the "unknown / truncated" sentinel. The distinguishing signal
  // for a truncated run is `metadata.timeoutReason` being set.
  const analysis = snapshot?.analysis ?? {
    taskId,
    complexity: 1,
    taskType: 'unknown',
    requirements: [],
    risks: [],
    needsDecomposition: false,
    approach: `Orchestration aborted: ${reason}`,
    estimatedEffort: 0,
  };
  const output: OrchestrateOutput = {
    taskId,
    analysis,
    result: undefined,
    stepsCompleted: snapshot?.stepsCompleted ?? 0,
    metadata: {
      durationMs: elapsedMs,
      tokensUsed: 0,
      expertsUsed: [],
      timeoutReason: reason,
    },
  };
  if (snapshot?.routing !== undefined) {
    output.routing = snapshot.routing;
  }
  return ok(output);
}

/**
 * Races `executeOrchestration` against a wall-clock deadline clamped below
 * the MCP wrapper cap (sub-issue B of #2104). On timeout, returns a
 * structured partial result. See buildTimeoutOrchestrationResult.
 */
async function executeOrchestrationWithDeadline(params: {
  readonly input: OrchestrateInput;
  readonly deps: OrchestrateDeps;
  readonly notifier: ReturnType<typeof createMcpNotifier>;
  readonly logger: ILogger;
}): Promise<Result<OrchestrateOutput, OrchestrationError>> {
  const { input, deps, notifier, logger } = params;
  const overallDeadlineMs = getMcpSafeDeadlineMs(
    MCP_TIMEOUTS.perTool['orchestrate'] ?? MCP_TIMEOUTS.defaultMs,
    'orchestrate'
  );
  const timeoutTaskId = generateTaskId();
  // Shared snapshot: executeOrchestration fills it as sub-steps complete; the
  // timeout handler reads it to produce a richer partial result (#2111).
  const snapshot = createOrchestrationStateSnapshot(getTimeProvider().now());
  return raceAgainstDeadline(
    withProgressHeartbeat('orchestrate', notifier, () =>
      executeOrchestration(input, deps, undefined, snapshot)
    ),
    overallDeadlineMs,
    (elapsedMs) => {
      logger.warn('Orchestration overall deadline reached; returning partial result', {
        overallDeadlineMs,
        elapsedMs,
        stage: snapshot.stage,
      });
      return buildTimeoutOrchestrationResult(
        timeoutTaskId,
        elapsedMs,
        'orchestration overall deadline exceeded',
        snapshot
      );
    }
  );
}

/** Body of the depth-guarded orchestration pipeline (extracted for line limit). */
async function runOrchestratePipeline(params: {
  readonly input: OrchestrateInput;
  readonly deps: OrchestrateDeps;
  readonly notifier: ReturnType<typeof createMcpNotifier>;
  readonly logger: ILogger;
}): Promise<ToolResult> {
  const { input, deps, notifier, logger } = params;
  logger.debug('Starting orchestration', { taskLength: input.task.length });
  notifier.info('orchestrate', { event: 'orchestrate_start', taskLength: input.task.length });
  const startMs = getTimeProvider().now();
  const v2Config = resolveV2Config();
  if (v2Config.orchestrateEnabled) instrumentV2Orchestrate(input, logger);

  const agentPlan = v2Config.aorchestraEnabled ? computeAgentPlan(input.task, logger) : undefined;
  const workerDispatchResult = await tryWorkerDispatch(
    agentPlan,
    input.task,
    deps,
    logger,
    notifier
  );
  recordAndReflect(workerDispatchResult, input.task, deps);

  // Wall-clock safeguard (sub-issue B of #2104): see helper doc.
  const result = await executeOrchestrationWithDeadline({ input, deps, notifier, logger });
  if (!result.ok) {
    return toolError(`Orchestration error: ${result.error.message}`);
  }
  notifier.info('orchestrate', {
    event: 'orchestrate_complete',
    subtaskCount: result.value.stepsCompleted,
    durationMs: getTimeProvider().now() - startMs,
  });
  return assembleOrchestrateOutput(result.value, agentPlan, workerDispatchResult);
}

function createOrchestrateHandler(deps: OrchestrateDeps) {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;
  return async (args: unknown, ctx: HandlerContext) => {
    const validated = OrchestrateInputSchema.safeParse(args);
    if (!validated.success) {
      ctx.logger.warn('Invalid orchestrate input', { errors: validated.error.issues });
      return toolError(`Validation error: ${formatZodError(validated.error)}`);
    }
    // Depth guard: prevent runaway nested orchestration (#1500)
    try {
      return await withDepthGuard('orchestrate', () =>
        runOrchestratePipeline({
          input: validated.data,
          deps,
          notifier,
          logger: ctx.logger,
        })
      );
    } catch (depthError: unknown) {
      const msg = depthError instanceof Error ? depthError.message : String(depthError);
      ctx.logger.warn('Orchestration depth guard triggered', { error: msg });
      return toolError(`Depth limit: ${msg}`);
    }
  };
}

/**
 * Registers the orchestrate tool with the MCP server.
 * Uses createSecureHandler (Issue #531) with timeout protection (Issue #271).
 * @category MCP
 */
export function registerOrchestrateTool(server: McpServer, deps: OrchestrateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'orchestrate' });
  const notifier = deps.notifier ?? createMcpNotifier(server);
  const depsWithNotifier = { ...deps, notifier };
  const description =
    'Orchestrate a task by analyzing it, breaking it into subtasks if needed, and coordinating expert agents';

  const secureHandler = createSecureHandler(createOrchestrateHandler(depsWithNotifier), {
    toolName: 'orchestrate',
    securityTier: 'user-facing',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Canonical source: config/timeouts.ts (Issue #1046)
  const wrappedHandler = wrapToolWithTimeout('orchestrate', secureHandler, {
    timeoutMs: MCP_TIMEOUTS.perTool['orchestrate'] ?? MCP_TIMEOUTS.defaultMs,
    logger,
  });

  server.registerTool(
    'orchestrate',
    { description, inputSchema: ORCHESTRATE_TOOL_SCHEMA },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered orchestrate tool with secure handler and timeout protection');
}
