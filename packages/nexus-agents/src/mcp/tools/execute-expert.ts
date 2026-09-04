/* eslint-disable max-lines */
/**
 * nexus-agents/mcp - Execute Expert Tool
 *
 * MCP tool for executing tasks with previously created expert agents.
 * Experts must be created first using the create_expert tool.
 *
 * @module mcp/tools/execute-expert
 * (Source: Issue #437 - Add execute_expert tool)
 * (Refactored: Issue #1298 - MCP Tasks async execution)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  ToolTaskHandler,
  CreateTaskRequestHandlerExtra,
  TaskRequestHandlerExtra,
} from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CreateTaskResult, GetTaskResult } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { ILogger, Task } from '../../core/index.js';
import { getErrorMessage } from '../../core/index.js';
import { isRateLimitLikeError } from '../../adapters/rate-limit-detector.js';

import {
  createLogger,
  getTimeProvider,
  getRandomProvider,
  formatZodError,
  withStep,
} from '../../core/index.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import { createMcpNotifier, NOOP_NOTIFIER, withProgressHeartbeat } from '../mcp-notifier.js';
import type { Expert } from '../../agents/index.js';
import { getToolMemory } from './tool-memory.js';
import {
  autoCatalogScan,
  handleExpertFailure,
  handleExpertSuccess,
} from './execute-expert-recording.js';
import { getExpertFallbackChain, ROLE_TO_TASK_CATEGORY } from './create-expert-routing.js';
import { getGlobalRegistry } from '../../adapters/unified-registry.js';
import { createExpert } from '../../agents/experts/expert-factory.js';
import { getOutcomeStore } from '../../orchestration/outcomes/outcome-store.js';
// ClawGuard access-policy derivation (#1977, #2022).
// When NEXUS_ACCESS_POLICY_MODE is unset/off, this is a no-op wrapper.
import {
  deriveAccessPolicy,
  withAccessPolicy,
  withAuditTrail,
  resolveAccessPolicyMode,
} from '../../security/access-constraint-deriver/index.js';
// Durable AUDIT-mode violation persistence (#4097). Establishes the audit
// trail in ALS so the access-policy middleware can mirror log-and-allow
// violations to the shared hash chain — ONLY when the server threaded a logger.
import { createDurableAuditTrail } from '../../security/audit-bridge.js';
import type { IAuditLogger } from '../../audit/audit-types.js';
// Per-expert context-budget observer (#2031). Telemetry-only; never
// influences the call. Emits `context_warning` when utilization crosses
// threshold (default 85%, overridable via NEXUS_CONTEXT_WARN_THRESHOLD).
import { observeExpertContext } from './expert-context-observer.js';
import type { ExpertContextObservation } from './expert-context-observer.js';
import {
  getExpertTaskTimeout,
  HEARTBEAT_TIMEOUTS,
  EXPERT_TIMEOUTS,
} from '../../config/timeouts.js';
import type { ICliDetectionCache } from '../../cli-adapters/cli-detection-cache.js';
import { requireAdapterAvailable } from '../middleware/adapter-availability.js';
import { getExpertPool } from '../../agents/expert-pool.js';
import { withDepthGuard } from '../middleware/spawn-depth-guard.js';
import {
  classifyStallTick,
  getHeartbeatMonitor,
  runInHeartbeatSession,
} from '../../agents/heartbeat-monitor.js';
import {
  getContextForTask,
  inferTaskCategory,
  summarizeContextForPrompt,
} from '../../context/context-retriever.js';
import { clampTaskTtl, DEFAULT_TASK_TTL_MS } from '../task-store.js';
import { toolStructuredError, toolSuccess, type BaseMcpToolDeps } from './tool-result.js';
import { getToolAnnotations } from '../tool-annotations.js';

/**
 * Minimum effective timeout for expert tasks — LLM inference takes 20-90s
 * minimum (#1163, #1330). Re-exported from `EXPERT_TIMEOUTS.executeFloorMs`
 * for backward compatibility with existing imports (#2636).
 */
export const EXPERT_TIMEOUT_FLOOR_MS = EXPERT_TIMEOUTS.executeFloorMs;

/**
 * Input schema for execute_expert tool.
 */
export const ExecuteExpertInputSchema = z.object({
  expertId: z.string().min(1).describe('Expert ID from create_expert tool'),
  task: z.string().min(1).max(50000).describe('Task description for the expert to execute'),
  context: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional context metadata for the task'),
  timeoutMs: z
    .number()
    .int()
    .min(EXPERT_TIMEOUT_FLOOR_MS)
    .max(EXPERT_TIMEOUTS.maxMs)
    .optional()
    .describe('Optional timeout in ms (120s-900s). Overrides auto-detected timeout.'),
  previousExpertSummary: z
    .string()
    .max(2000)
    .optional()
    .describe(
      'Summary from a previous expert in the chain. Injected into prompt for context continuity.'
    ),
});

/**
 * Type for validated execute expert input.
 */
export type ExecuteExpertInput = z.infer<typeof ExecuteExpertInputSchema>;

/**
 * Dependencies for execute_expert tool.
 */
export interface ExecuteExpertDeps extends BaseMcpToolDeps {
  /** Registry of created experts (shared with create_expert) */
  expertRegistry: Map<string, Expert>;
  /**
   * Durable, hash-chained audit logger (#4097). When present, ClawGuard
   * AUDIT-mode violations during the expert's nested tool calls are persisted
   * to the shared store. Absent on the pure-CLI path → no trail established.
   */
  auditLogger?: IAuditLogger;
  /** Optional CLI detection cache for checking available CLIs (Issue #747) */
  cliCache?: ICliDetectionCache;
  /** MCP notifier for client-visible logging (Issue #974) */
  notifier?: IMcpNotifier | undefined;
}

/**
 * Response from execute_expert tool.
 */
export interface ExecuteExpertResponse {
  /** Expert ID that executed the task */
  expertId: string;
  /** Expert role */
  role: string;
  /** Task execution output */
  output: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Token usage from the model */
  tokensUsed: number;
  /** Status of execution */
  status: 'success' | 'error';
  /** Error message if status is 'error' */
  error?: string;
  /** Model used for execution (Issue #817) */
  modelUsed?: string;
  /**
   * The expert's self-reported confidence in `[0, 1]` (#3766). Present only when
   * the expert emitted an {@link ExpertOutput}-shaped analysis carrying a numeric
   * confidence; absent for plain-string outputs. Consumers can route/weight on it.
   */
  confidence?: number;
}

/**
 * Sanitize expert summary to prevent prompt injection (Issue #1585).
 *
 * Uses iterative replacement until the input is stable — single-pass regex
 * sanitization is incomplete because removing one tag can create a new one
 * (CodeQL js/incomplete-multi-character-sanitization). Example:
 * `<scr<script>ipt>` → after one pass: `<script>` (the bypass survives).
 */
function sanitizeExpertSummary(summary: string): string {
  let cleaned = summary;
  // Iterate until stable to defeat nested-tag bypasses.
  // Cap iterations to prevent worst-case quadratic behavior on pathological
  // input (the slice(0, 2000) below also bounds total work).
  for (let i = 0; i < 10; i++) {
    const next = cleaned.replace(/<[^>]*>/g, '');
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned
    .replace(/\b(ignore|forget|disregard)\s+(previous|above|all)\b/gi, '[REDACTED]')
    .slice(0, 2000);
}

/**
 * Best-effort accumulated-context prefix for an expert task (#3238 — extends the
 * #2792 entry-point wiring to execute_expert). Gated behind
 * `NEXUS_CONTEXT_RETRIEVER_INJECT=1`, matching the orchestrate rollout (#2921):
 * default-off, no behavior change until the bake-in flips it on. Fail-soft —
 * any error yields `undefined` and the task runs with no prefix.
 *
 * The returned summary is NOT trusted: the underlying memory backends are
 * writable via the untrusted `memory_write` tool (#3238 review), so `buildTask`
 * runs it through `sanitizeExpertSummary` before it reaches the prompt, and the
 * access policy is derived from the prefix-free task so it can't be widened.
 */
export async function maybeFetchContextPrefix(
  task: string,
  logger: ILogger | undefined
): Promise<string | undefined> {
  if (process.env['NEXUS_CONTEXT_RETRIEVER_INJECT'] !== '1') return undefined;
  const category = inferTaskCategory(task);
  try {
    const ctx = await getContextForTask({
      task,
      category,
      ...(logger !== undefined ? { logger } : {}),
    });
    const summary = summarizeContextForPrompt(ctx);
    return summary === '' ? undefined : summary;
  } catch (error: unknown) {
    // #3699: the #3180-adopted best-effort failure policy — observable WARN
    // (not a swallowed debug line) + continue without the prefix. This site has
    // no event-listener channel (unlike the graph boundary), so the structured
    // warn IS the observable; `getErrorMessage` yields a sanitized message only.
    logger?.warn('execute_expert: context retrieval failed; continuing without prefix', {
      category,
      error: getErrorMessage(error),
    });
    return undefined;
  }
}

/**
 * Builds a task object from the tool input.
 * Zod schema enforces timeoutMs >= EXPERT_TIMEOUT_FLOOR_MS, so no runtime floor needed (#1330).
 * `contextPrefix` (#3238) is an optional accumulated-memory block prepended ahead
 * of the task; see {@link maybeFetchContextPrefix}.
 */
export function buildTask(input: ExecuteExpertInput, contextPrefix?: string): Task {
  const autoTimeout = getExpertTaskTimeout(input.task);
  const timeoutMs = input.timeoutMs ?? autoTimeout;

  // Inject sanitized handoff context from previous expert (Issue #1585)
  let description = input.task;
  if (input.previousExpertSummary !== undefined) {
    const sanitized = sanitizeExpertSummary(input.previousExpertSummary);
    description = `[Previous expert context]\n${sanitized}\n\n[Your task]\n${input.task}`;
  }

  // Prepend accumulated memory context ahead of everything else (#3238).
  // Sanitized like `previousExpertSummary`: the memory backends are writable by
  // the untrusted `memory_write` tool, so the prefix is NOT trusted — strip tags
  // + redact ignore-instruction phrasing (the #3238 security review found this
  // gap). The policy is derived from the prefix-free description separately.
  if (contextPrefix !== undefined) {
    description = `[Prior context]\n${sanitizeExpertSummary(contextPrefix)}\n\n${description}`;
  }

  return {
    id: `exec-${String(getTimeProvider().now())}-${getRandomProvider().random().toString(36).slice(2, 9)}`,
    description,
    context: {
      metadata: input.context ?? {},
    },
    constraints: {
      maxTokens: 4096,
      maxDuration: timeoutMs,
    },
  };
}

/**
 * Look up expert and return error hint if not found.
 */
function lookupExpert(
  registry: Map<string, Expert>,
  expertId: string
): { ok: true; expert: Expert } | { ok: false; error: string } {
  const expert = registry.get(expertId);
  if (expert === undefined) {
    const availableIds = Array.from(registry.keys());
    const hint =
      availableIds.length > 0
        ? ` Available experts: ${availableIds.join(', ')}`
        : ' No experts have been created yet. Use create_expert first.';
    return { ok: false, error: `Expert not found: ${expertId}.${hint}` };
  }
  return { ok: true, expert };
}

/**
 * Build success response from execution result.
 */
interface SuccessResponseParams {
  expertId: string;
  role: string;
  output: unknown;
  durationMs: number;
  tokensUsed: number;
  modelUsed?: string | undefined;
}

/**
 * Extract an expert's self-reported confidence from its task output (#3766).
 *
 * Experts emit an {@link ExpertOutput}-shaped analysis object whose `confidence`
 * is a number in `[0, 1]`; the MCP boundary stringifies the output, dropping that
 * structured field. This recovers it (fail-safe: returns `undefined` for plain
 * strings, missing/non-numeric/out-of-range values) so the response can surface it.
 */
export function extractExpertConfidence(output: unknown): number | undefined {
  if (typeof output !== 'object' || output === null) return undefined;
  const c = (output as { confidence?: unknown }).confidence;
  if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) return undefined;
  return c;
}

export function buildSuccessResponse(params: SuccessResponseParams): ExecuteExpertResponse {
  const outputStr =
    typeof params.output === 'string' ? params.output : JSON.stringify(params.output, null, 2);
  const response: ExecuteExpertResponse = {
    expertId: params.expertId,
    role: params.role,
    output: outputStr,
    durationMs: params.durationMs,
    tokensUsed: params.tokensUsed,
    status: 'success',
  };
  if (params.modelUsed !== undefined) {
    response.modelUsed = params.modelUsed;
  }
  // #3766: surface the expert's real confidence before the output is flattened.
  const confidence = extractExpertConfidence(params.output);
  if (confidence !== undefined) {
    response.confidence = confidence;
  }
  return response;
}

/** Injects past error solutions into task context (best-effort). */
/**
 * Observe context-budget utilization if the expert call succeeded
 * (#2031). Extracted to keep runExpertTask under the 50-line limit.
 */
function observeExpertContextIfOk(
  result: Awaited<ReturnType<Expert['execute']>>,
  expert: Expert,
  task: Task,
  durationMs: number,
  logger: ILogger | undefined
): void {
  if (!result.ok) return;
  const expertModelId = expert.expertConfig.modelPreference?.modelId;
  const observation: ExpertContextObservation = {
    expertId: expert.id,
    role: expert.role,
    modelId: expertModelId as ExpertContextObservation['modelId'],
    tokensUsed: result.value.metadata.tokensUsed,
    // #4743: provenance travels with the number, so a consumer can tell a
    // measured zero from an unreported one.
    ...(result.value.metadata.tokensMeasured !== undefined
      ? { tokensMeasured: result.value.metadata.tokensMeasured }
      : {}),
    taskDescription: task.description,
    durationMs,
  };
  observeExpertContext(observation, logger);
}

/**
 * Derive a ClawGuard access policy for this expert invocation (#1977, #2022).
 *
 * Mirrors the orchestrate-tool pattern: in `off` mode returns a bypass
 * policy (zero behavior change); in audit/enforce modes derives a real
 * policy via the regex fallback (no LLM adapter on `ExecuteExpertDeps`).
 *
 * Never throws — derivation failure falls back to a permissive `off`
 * policy so expert execution is never blocked by a policy-derivation
 * bug.
 */
async function deriveExpertAccessPolicy(
  objective: string,
  logger: ILogger | undefined,
  trustTier: string | undefined
): Promise<Awaited<ReturnType<typeof deriveAccessPolicy>>> {
  const mode = resolveAccessPolicyMode();
  try {
    // Closes #2993 (expert path): trustTier was hardcoded to '1' regardless
    // of caller. Now threaded from secure-handler RequestContext; missing
    // defaults to '4' so derivation runs at the strictest tier.
    // `objective` is the prefix-free task description (#3238 review): the
    // informational memory prefix is excluded so it cannot widen the policy.
    const policy = await deriveAccessPolicy(objective, {
      mode,
      trustTier: (trustTier ?? '4') as '1' | '2' | '3' | '4',
    });
    if (mode !== 'off') {
      logger?.info('access-policy: derived (expert)', {
        mode,
        source: policy.source,
      });
    }
    return policy;
  } catch (error) {
    // Fail closed under active enforcement, fail safe under audit/off.
    // See `orchestrate.ts:deriveOrchestratePolicy` for the full rationale
    // (#2993). Mirror the behavior here so the two MCP entry points to
    // policy derivation don't diverge.
    logger?.warn('access-policy: derivation failed (expert)', {
      mode,
      error: getErrorMessage(error),
      failClosed: mode === 'enforce' || mode === 'confirm_risky',
    });
    if (mode === 'enforce' || mode === 'confirm_risky') {
      return {
        allowedTools: [],
        allowedPathPatterns: [],
        allowedOperations: [],
        objectiveHash: 'derivation-failed',
        derivedAt: getTimeProvider().nowIso(),
        source: 'bypass',
        mode,
      };
    }
    return {
      allowedTools: '*',
      allowedPathPatterns: [],
      allowedOperations: '*',
      objectiveHash: 'derivation-failed',
      derivedAt: getTimeProvider().nowIso(),
      source: 'bypass',
      mode,
    };
  }
}

function injectErrorHints(task: Task, role: string): void {
  try {
    const hints = getToolMemory().getRelevantErrorHints(role);
    if (hints !== undefined) {
      (task.context.metadata as Record<string, unknown>)._pastErrorSolutions = hints;
    }
  } catch (error: unknown) {
    createLogger({ tool: 'execute_expert' }).warn('Failed to inject error hints', {
      error: getErrorMessage(error),
      role,
    });
  }
}

type ExpertResult = { ok: true; value: ExecuteExpertResponse } | { ok: false; error: string };

/** Checks whether an error message indicates a rate-limit failure. */
function isRateLimitFailure(message: string): boolean {
  return isRateLimitLikeError(new Error(message));
}

/** Minimum consecutive failures before proactive fallback (#1401). */
const DEGRADATION_CONSECUTIVE_THRESHOLD = 3;

/** Worker model prefix for outcome queries. */
const WORKER_PREFIX = 'worker-';

/**
 * Checks if an expert role is degraded based on recent outcome data.
 * Returns true if the role has >= DEGRADATION_CONSECUTIVE_THRESHOLD
 * consecutive trailing failures. Lightweight — filters outcome store in memory.
 */
export function isExpertDegraded(role: string): boolean {
  const store = getOutcomeStore();
  const modelKey = `${WORKER_PREFIX}${role}`;
  const all = store.query();
  const roleOutcomes = all.filter((o) => o.model === modelKey);
  if (roleOutcomes.length < DEGRADATION_CONSECUTIVE_THRESHOLD) return false;
  let consecutive = 0;
  for (let i = roleOutcomes.length - 1; i >= 0; i--) {
    const outcome = roleOutcomes[i];
    if (outcome === undefined || outcome.success) break;
    consecutive++;
  }
  return consecutive >= DEGRADATION_CONSECUTIVE_THRESHOLD;
}

/**
 * Attempts to execute the task with a fallback CLI after a rate-limit failure. (#1532)
 * Creates a temporary expert with the same config but a different adapter.
 * Tries the first available fallback only (bounded retry).
 */
async function tryExpertFallback(
  expert: Expert,
  task: Task,
  logger: ILogger | undefined
): Promise<ExpertResult | undefined> {
  const roleKey = `${expert.role}_expert`;
  const category = ROLE_TO_TASK_CATEGORY[roleKey];
  if (category === undefined) return undefined;
  const effectiveLogger = logger ?? createLogger({ tool: 'execute_expert' });
  const registry = getGlobalRegistry({ logger: effectiveLogger });
  const routing = registry.getRouting(category);
  const primaryCli = routing?.primaryCli ?? 'unknown';
  const chain = getExpertFallbackChain(roleKey, primaryCli, effectiveLogger);
  if (chain.length === 0) return undefined;
  const fallbackCli = chain[0];
  if (fallbackCli === undefined) return undefined;
  const fallbackAdapter = registry.getAdapterForCli(fallbackCli);
  logger?.info('Retrying expert with fallback CLI', { role: expert.role, fallbackCli });

  // #4286: the outer CLI-fallback expert (#1532) also gets the conservative
  // inner transient recovery, so a one-off transient blip on the fallback
  // adapter doesn't collapse the last recovery layer. The primary expert's own
  // { maxRetries: 1 } policy is wired at its creation site (create-expert.ts).
  const fallbackResult = createExpert(expert.expertConfig, {
    adapter: fallbackAdapter,
    recoveryPolicy: { maxRetries: 1 },
  });
  if (!fallbackResult.ok) return undefined;

  const fallbackStart = getTimeProvider().now();
  const result = await fallbackResult.value.execute(task);
  if (!result.ok) return undefined;
  const fallbackDurationMs = getTimeProvider().now() - fallbackStart;

  return {
    ok: true,
    value: buildSuccessResponse({
      expertId: expert.id,
      role: expert.role,
      output: result.value.output,
      durationMs: fallbackDurationMs,
      tokensUsed: result.value.metadata.tokensUsed,
      modelUsed: fallbackCli,
    }),
  };
}

/** Options for classifyExpertResult. */
interface ClassifyExpertResultOpts {
  result: Awaited<ReturnType<Expert['execute']>>;
  expert: Expert;
  task: Task;
  args: ExecuteExpertInput;
  durationMs: number;
  logger: ILogger | undefined;
}

/**
 * The model id to attribute the outcome to (#3624): prefer the model the
 * adapter ACTUALLY executed (ground truth from result metadata) over the
 * configured preference. On failure there's no executed model — fall back to
 * the configured preference (and ultimately 'unknown' at the recorder).
 */
function resolveExecutedModelId(
  result: ClassifyExpertResultOpts['result'],
  expert: Expert
): string | undefined {
  const executed = result.ok ? result.value.metadata.model : undefined;
  return executed ?? expert.expertConfig.modelPreference?.modelId;
}

/** Classifies expert execution result, with rate-limit fallback (#1532). */
async function classifyExpertResult(opts: ClassifyExpertResultOpts): Promise<ExpertResult> {
  const { result, expert, task, args, durationMs, logger } = opts;
  const modelId = resolveExecutedModelId(result, expert);
  const info = {
    expertId: args.expertId,
    role: expert.role,
    ...(modelId !== undefined ? { modelId } : {}),
  };

  if (!result.ok) {
    if (isRateLimitFailure(result.error.message)) {
      const fallback = await tryExpertFallback(expert, task, logger);
      if (fallback !== undefined) return fallback;
    }
    logger?.warn('Expert execution failed', {
      expertId: args.expertId,
      error: result.error.message,
    });
    return handleExpertFailure(args.task, info, result.error.message, durationMs);
  }

  logger?.info('Expert execution completed', { expertId: args.expertId, durationMs });
  handleExpertSuccess(args.task, info, durationMs);
  if (typeof result.value.output === 'string') {
    autoCatalogScan(result.value.output, args.expertId, logger);
  }
  return {
    ok: true,
    value: buildSuccessResponse({
      expertId: args.expertId,
      role: expert.role,
      output: result.value.output,
      durationMs,
      tokensUsed: result.value.metadata.tokensUsed,
      modelUsed: modelId,
    }),
  };
}

/**
 * Derive the access policy (#1977) and run `expert.execute(task)` under it,
 * establishing a durable audit trail in ALS when a logger was threaded so
 * ClawGuard AUDIT-mode violations from the expert's nested tool calls are
 * persisted to the shared hash chain (#4097). No trail → byte-identical path.
 *
 * execute-expert runs through MCP's native task handler (not the
 * ContextAwareHandler chain), so HandlerContext / RequestContext isn't
 * available here. The deriver gets `undefined` and defaults to trust tier '4'
 * (untrusted). End-to-end trust-tier wiring is a follow-up (see #2993).
 */
async function executeExpertUnderPolicy(
  deps: ExecuteExpertDeps,
  expert: Expert,
  task: Parameters<Expert['execute']>[0],
  policyObjective: string
): Promise<Awaited<ReturnType<Expert['execute']>>> {
  const policy = await deriveExpertAccessPolicy(policyObjective, deps.logger, undefined);
  const auditTrail = createDurableAuditTrail(deps.auditLogger);
  const runExpert = (): ReturnType<Expert['execute']> => expert.execute(task);
  return withAccessPolicy(
    policy,
    auditTrail !== undefined ? () => withAuditTrail(auditTrail, runExpert) : runExpert
  );
}

/**
 * Runs expert work under a heartbeat session whose liveness comes from progress
 * (#4665).
 *
 * The timer only OBSERVES. It used to call `heartbeat()` on its own tick, which
 * made the watchdog measure the clock rather than the work and left the
 * stall thresholds unreachable. Step activity emitted inside
 * `runInHeartbeatSession` is now the only thing that keeps the session alive.
 */
async function runExpertUnderHeartbeat<T>(
  expertId: string,
  logger: ILogger | undefined,
  work: () => Promise<T>
): Promise<T> {
  const monitor = getHeartbeatMonitor();
  const sessionId = monitor.startSession(expertId);
  // #5282: reported once per session, not once per 15s tick — every expert
  // session is currently unmeasured, so a per-tick line would be pure noise.
  let reportedUnmeasured = false;
  const heartbeatTimer = setInterval(() => {
    if (monitor.isExpired(sessionId)) {
      logger?.warn('Expert session expired', { expertId, sessionId });
    }
    switch (classifyStallTick(monitor.getSessionHealth(sessionId)?.health)) {
      case 'stalled':
        logger?.warn('Expert session stalled — no step activity', { expertId, sessionId });
        break;
      case 'unmeasured':
        // The state `isStalled` used to render as `false`. Nothing inside the
        // expert path emits on `stepBus`, so stall detection is inert here;
        // saying so beats reporting a green "not stalled" it never measured.
        if (!reportedUnmeasured) {
          reportedUnmeasured = true;
          logger?.debug('Expert session stall detection unmeasured — no step events in scope', {
            expertId,
            sessionId,
          });
        }
        break;
      case 'quiet':
        break;
    }
  }, HEARTBEAT_TIMEOUTS.heartbeatIntervalMs);

  try {
    return await runInHeartbeatSession(sessionId, work);
  } finally {
    clearInterval(heartbeatTimer);
    monitor.endSession(sessionId);
  }
}

/** Runs the expert task and records outcomes. Assumes permit is held. */
async function runExpertTask(
  deps: ExecuteExpertDeps,
  args: ExecuteExpertInput,
  expert: Expert
): Promise<ExpertResult> {
  const { expertId } = args;
  const contextPrefix = await maybeFetchContextPrefix(args.task, deps.logger);
  const task = buildTask(args, contextPrefix);
  // Access policy is derived from the prefix-free description so accumulated
  // memory context can never widen the derived operations (#3238 review).
  const policyObjective = buildTask(args).description;
  injectErrorHints(task, expert.role);

  // Proactive fallback for degraded experts (#1401)
  if (isExpertDegraded(expert.role)) {
    deps.logger?.warn('Expert role degraded, trying fallback', { role: expert.role });
    const fallback = await tryExpertFallback(expert, task, deps.logger);
    if (fallback !== undefined) return fallback;
  }

  return withStep(
    { name: `expert:${expert.role}`, attrs: { expertId, role: expert.role } },
    async (ctx) => {
      const startTime = getTimeProvider().now();
      const result = await runExpertUnderHeartbeat(expertId, deps.logger, () =>
        executeExpertUnderPolicy(deps, expert, task, policyObjective)
      );
      const durationMs = getTimeProvider().now() - startTime;
      observeExpertContextIfOk(result, expert, task, durationMs, deps.logger);
      const classified = await classifyExpertResult({
        result,
        expert,
        task,
        args,
        durationMs,
        logger: deps.logger,
      });
      ctx.setSummary(classified.ok ? `${expert.role} ok` : `${expert.role} failed`);
      return classified;
    }
  );
}

/**
 * Handles the execute_expert tool execution.
 * (Issue #747 - CLI detection, Issue #1029 - admission control)
 */
async function handleExecuteExpert(
  deps: ExecuteExpertDeps,
  args: ExecuteExpertInput
): Promise<ExpertResult> {
  const lookup = lookupExpert(deps.expertRegistry, args.expertId);
  if (!lookup.ok) return { ok: false, error: lookup.error };

  const adapterError = await requireAdapterAvailable(deps.cliCache);
  if (adapterError !== undefined) return { ok: false, error: adapterError };

  // Depth guard: prevent runaway nested expert execution (#1500)
  try {
    return await withDepthGuard('execute_expert', async () => {
      const pool = getExpertPool();
      let permit;
      try {
        permit = await pool.acquire();
      } catch (acquireErr: unknown) {
        return { ok: false as const, error: getErrorMessage(acquireErr) };
      }

      try {
        return await runExpertTask(deps, args, lookup.expert);
      } finally {
        pool.release(permit);
      }
    });
  } catch (depthError: unknown) {
    return { ok: false, error: getErrorMessage(depthError) };
  }
}

// ============================================================================
// Task Handler (Issue #1298 — Layer 2 MCP Tasks async execution)
// ============================================================================

/** Input shape type for registerToolTask. */
type ExecuteExpertToolSchema = typeof EXECUTE_EXPERT_TOOL_SCHEMA;

const EXECUTE_EXPERT_TOOL_SCHEMA = {
  expertId: z.string().min(1).describe('Expert ID from create_expert tool'),
  task: z.string().min(1).max(50000).describe('Task description for the expert to execute'),
  context: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Additional context metadata for the task'),
  timeoutMs: z
    .number()
    .int()
    .min(EXPERT_TIMEOUT_FLOOR_MS)
    .max(EXPERT_TIMEOUTS.maxMs)
    .optional()
    .describe('Optional timeout in ms (120s-900s). Overrides auto-detected timeout.'),
};

/**
 * Creates a ToolTaskHandler for execute_expert.
 *
 * Implements the MCP Tasks primitive (SEP-1686):
 * - createTask: validates, starts background execution, returns task immediately
 * - getTask: returns current task status from store
 * - getTaskResult: returns completed/failed result from store
 *
 * When the client supports tasks, createTask returns immediately and the client
 * polls for status. When the client doesn't support tasks, the SDK internally
 * polls until completion (handleAutomaticTaskPolling).
 *
 * @param deps - Tool dependencies
 * @param logger - Logger instance
 */
function createTaskHandler(
  deps: ExecuteExpertDeps,
  logger: ILogger
): ToolTaskHandler<ExecuteExpertToolSchema> {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;

  return {
    createTask: (
      args: ExecuteExpertInput,
      extra: CreateTaskRequestHandlerExtra
    ): Promise<CreateTaskResult> => {
      // Validate input
      const parsed = ExecuteExpertInputSchema.safeParse(args);
      if (!parsed.success) {
        return Promise.reject(new Error(`Validation error: ${formatZodError(parsed.error)}`));
      }

      const validatedArgs = parsed.data;
      const { taskStore } = extra;

      // Create task with clamped TTL
      const ttl = clampTaskTtl(DEFAULT_TASK_TTL_MS);
      const taskPromise = taskStore.createTask({ ttl, pollInterval: 5000 }).then((task) => {
        logger.info('Task created for execute_expert', {
          taskId: task.taskId,
          expertId: validatedArgs.expertId,
        });

        // Start background execution (fire-and-forget)
        void runBackgroundExpertTask({
          deps,
          args: validatedArgs,
          taskId: task.taskId,
          taskStore,
          notifier,
        });

        return { task };
      });

      return taskPromise;
    },

    getTask: (
      _args: ExecuteExpertInput,
      extra: TaskRequestHandlerExtra
    ): Promise<GetTaskResult> => {
      return extra.taskStore.getTask(extra.taskId);
    },

    getTaskResult: (
      _args: ExecuteExpertInput,
      extra: TaskRequestHandlerExtra
    ): Promise<CallToolResult> => {
      return extra.taskStore.getTaskResult(extra.taskId) as Promise<CallToolResult>;
    },
  };
}

/** Options for background expert task execution. */
interface BackgroundExpertTaskOpts {
  deps: ExecuteExpertDeps;
  args: ExecuteExpertInput;
  taskId: string;
  taskStore: CreateTaskRequestHandlerExtra['taskStore'];
  notifier: IMcpNotifier;
}

/**
 * Runs expert execution in the background, updating task store on completion.
 * Fire-and-forget — errors are caught and stored as task failures.
 */
async function runBackgroundExpertTask(opts: BackgroundExpertTaskOpts): Promise<void> {
  const { deps, args, taskId, taskStore, notifier } = opts;
  const logger = deps.logger ?? createLogger({ tool: 'execute_expert' });
  try {
    notifier.info('execute_expert', {
      event: 'expert_start',
      taskId,
      expertId: args.expertId,
    });

    const result = await withProgressHeartbeat('execute_expert', notifier, () =>
      handleExecuteExpert(deps, args)
    );

    if (!result.ok) {
      await taskStore.storeTaskResult(taskId, 'failed', {
        ...toolStructuredError({
          errorCategory: 'internal',
          message: `Failed to execute expert: ${result.error}`,
        }),
      });
      return;
    }

    notifier.info('execute_expert', {
      event: 'expert_complete',
      taskId,
      role: result.value.role,
      confidence: result.value.status === 'success' ? 1 : 0,
      tokenUsage: result.value.tokensUsed,
    });

    await taskStore.storeTaskResult(taskId, 'completed', {
      ...toolSuccess(JSON.stringify(result.value, null, 2)),
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.warn('Background expert task failed', { taskId, error: message });
    try {
      await taskStore.storeTaskResult(taskId, 'failed', {
        ...toolStructuredError({
          errorCategory: 'internal',
          message: `Expert execution error: ${message}`,
        }),
      });
    } catch (storeError: unknown) {
      logger.warn('Failed to store task failure result', {
        taskId,
        error: getErrorMessage(storeError),
      });
    }
  }
}

// ============================================================================
// Registration
// ============================================================================

/**
 * Registers the execute_expert tool with the MCP server.
 *
 * Uses MCP Tasks primitive (SEP-1686) via registerToolTask for async execution.
 * taskSupport: 'optional' preserves sync fallback for clients without task support.
 *
 * NOT wrapped by createSecureHandler or wrapToolWithTimeout (#4981). Of the 46
 * tool modules this is the only one outside the standard middleware stack: it
 * registers through registerToolTask, so it creates no RequestContext, emits
 * no `Tool invocation started` pair, and no tool-audit record. An earlier
 * version of this comment claimed it used createSecureHandler (Issue #531)
 * and that it carried the #271 timeout protection; neither is true as wired.
 * Whether the tasks primitive can take those wrappers is part of #4978.
 *
 * @category MCP
 * @param server - MCP server instance
 * @param deps - Tool dependencies
 */
export function registerExecuteExpertTool(server: McpServer, deps: ExecuteExpertDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'execute_expert' });
  const notifier = deps.notifier ?? createMcpNotifier(server);
  const depsWithNotifier = { ...deps, notifier };

  const description =
    'Run a task through an expert YOU PREVIOUSLY CREATED via `create_expert`. ' +
    'Requires the expertId returned by create_expert; not for ad-hoc execution. ' +
    'Returns the expert analysis including output, status, model used, token usage, ' +
    "and the expert's confidence (0-1) when it reports one.";

  server.experimental.tasks.registerToolTask(
    'execute_expert',
    {
      description,
      inputSchema: EXECUTE_EXPERT_TOOL_SCHEMA,
      execution: { taskSupport: 'optional' },

      annotations: getToolAnnotations('execute_expert'),
    },
    createTaskHandler(depsWithNotifier, logger)
  );
  logger.info('Registered execute_expert tool with MCP Tasks support (taskSupport: optional)');
}
