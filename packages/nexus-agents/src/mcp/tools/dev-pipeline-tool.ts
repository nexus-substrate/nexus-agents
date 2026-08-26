/**
 * run_dev_pipeline MCP Tool (#1684)
 *
 * Exposes the multi-agent development pipeline as an MCP tool.
 * Accepts input from direct instructions, a plan file, or a spec file.
 *
 * @module mcp/tools/dev-pipeline-tool
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, getErrorMessage, formatZodError, type ILogger } from '../../core/index.js';
import { runDevPipeline } from '../../pipeline/dev-pipeline.js';
import { checkSimulationAllowed, simulationDeniedResult } from './simulation-guard.js';
import type { DevPipelineResult, DevPipelineOptions } from '../../pipeline/dev-pipeline.js';
import type { IAuditLogger } from '../../audit/audit-types.js';
import { createAgentStages, flushPipelineMemory } from '../../pipeline/agent-executor.js';
import { createTaskTracker, detectBackend } from '../../pipeline/task-tracker.js';
import { getToolAnnotations } from '../tool-annotations.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import { measuredTrustTier } from '../middleware/request-context.js';
import {
  toolStructuredError,
  toolSuccessStructured,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';
// #3726 / epic #2631: async-mode dispatch via the shared `runAsJob` helper.
import { runAsJob, defaultReplayEnvelope, defaultCollisionEnvelope } from '../jobs/run-as-job.js';
import { resolveIdempotency, registerIdempotentJob } from '../jobs/job-idempotency.js';

/**
 * Discoverability hint (#3726) prepended to sync run_dev_pipeline error/timeout
 * envelopes. A real autonomous run can exceed the 900s MCP request timeout;
 * async mode is the durable escape hatch.
 */
const DEV_PIPELINE_ASYNC_HINT =
  'A full run_dev_pipeline run can exceed the 900s synchronous MCP timeout. ' +
  "Retry with `dispatch: 'async'` to get a jobId immediately, then poll " +
  'get_job_result({ jobId }) for the result.';

/**
 * What to tell a caller whose DRY run failed (#4933).
 *
 * `dispatch: 'async'` is ignored when `dryRun` is true, so the hint above is
 * remediation the caller cannot take — following it verbatim produces another
 * synchronous run. Say what is true instead.
 */
const DEV_PIPELINE_DRY_RUN_NOTE =
  'This was a dry run (plan+vote), which always runs synchronously; async ' +
  'dispatch is ignored for dry runs, so retrying with it changes nothing.';

/** The failure-time note that matches the dispatch mode actually available. */
function dispatchNoteFor(dryRun: boolean): string {
  return dryRun ? DEV_PIPELINE_DRY_RUN_NOTE : DEV_PIPELINE_ASYNC_HINT;
}

// ============================================================================
// Input Schema
// ============================================================================

export const DevPipelineInputSchema = z.object({
  /** Direct task instructions. */
  task: z.string().max(10000).optional().describe('Direct task instructions (what to build)'),
  /** Path to a plan file (.md, .yaml, .txt) to use as input. */
  planFile: z.string().max(500).optional().describe('Path to a plan/spec file to use as input'),
  /** Whether to run in dry-run mode (plan+vote only, no implementation). */
  dryRun: z.boolean().default(false).describe('If true, stop after plan+vote (no implementation)'),
  /** Maximum vote iterations before proceeding (default: 3). */
  maxVoteIterations: z.number().int().min(1).max(5).default(3).describe('Max plan→vote iterations'),
  /** Maximum QA iterations per task (default: 3). */
  maxQaIterations: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe('Max QA review iterations per task'),
  /** Working directory for the pipeline (default: cwd). Used for security scan and context. */
  workingDir: z.string().max(500).optional().describe('Working directory (default: cwd)'),
  /** GitHub issue number to track progress on. Updates posted as comments. */
  issueNumber: z.number().int().positive().optional().describe('GitHub issue to post progress to'),
  /** GitHub repo (owner/name) for issue tracking. */
  repo: z
    .string()
    .max(200)
    .optional()
    .describe('GitHub repo for issue tracking (e.g., owner/repo)'),
  /** Task tracking backend: github, gitlab, or json (default: json). */
  trackerBackend: z
    .enum(['github', 'gitlab', 'json'])
    .default('json')
    .describe('Task tracking backend for issue creation'),
  /** Labels to apply to created issues. */
  labels: z.array(z.string()).optional().describe('Labels for created issues'),
  /** Session ID for checkpoint/resume. Enables crash recovery. */
  sessionId: z
    .string()
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional()
    .describe('Session ID for checkpoint/resume (crash recovery)'),
  /**
   * TESTS ONLY — when true, voters return random decisions. Must not be used as
   * a fallback when adapters are unavailable; configure an adapter instead. (#2319)
   */
  simulateVotes: z
    .boolean()
    .default(false)
    .describe('TESTS ONLY — random output, must not be used for real decisions (#2319)'),
  /** Voting strategy for consensus stages. */
  votingStrategy: z
    .enum([
      'simple_majority',
      'supermajority',
      'unanimous',
      'higher_order',
      'proof_of_learning',
      'opinion_wise',
    ])
    .optional()
    .describe('Voting strategy for plan approval (default: higher_order)'),
  /** Use 3 agents instead of 6 for faster voting. */
  quickMode: z
    .boolean()
    .default(false)
    .describe('Use 3 agents instead of 6 for faster consensus voting'),
  /** Maximum execution time per stage in milliseconds (min 30s, max 600s). */
  timeoutMs: z
    .number()
    .int()
    .min(30_000)
    .max(600_000)
    .optional()
    .describe('Max time per stage in ms (30000-600000). Default: varies by stage complexity'),
  /** Pipeline execution mode. */
  mode: z
    .enum(['autonomous', 'harness'])
    .default('autonomous')
    .describe(
      "'autonomous': full pipeline. 'harness': stops after decompose, returns tasks for caller to implement."
    ),
  /**
   * Dispatch mode (#3726). `sync` (default) runs the pipeline inline and
   * returns the result — but a real autonomous run can exceed the 900s MCP
   * request timeout. `async` returns a `{ status: 'pending', jobId }`
   * envelope immediately and runs the pipeline in the background; poll
   * `get_job_result({ jobId })` for the result. Ignored when `dryRun` is
   * true (plan+vote completes fast, so dry runs always stay sync).
   */
  dispatch: z
    .enum(['sync', 'async'])
    .default('sync')
    .describe(
      "Dispatch mode (#3726). 'sync' (default): run inline. 'async': return a jobId immediately + run in background (poll get_job_result). Ignored for dryRun."
    ),
  /** Local pre-ship quality gate (typecheck/lint/tests) mode (#3356). */
  qualityGate: z
    .enum(['off', 'advisory', 'blocking'])
    .default('off')
    .describe(
      "Pre-ship local quality gate. 'off' (default): skip. 'advisory': run + record feedback, never fail. 'blocking': a red gate fails the pipeline."
    ),
  /** Opt-in per-run token budget — a safety cap for unattended runs (#3395). */
  maxBudgetTokens: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Per-run token ceiling (#3395). When set, expert calls stop (returning failures) once cumulative usage crosses it — a hard-stop safety cap for unattended/multi-day runs. Omit to disable (default).'
    ),
});

export type DevPipelineInput = z.infer<typeof DevPipelineInputSchema>;

/**
 * Deps for `run_dev_pipeline`. Extends the base with the server's single durable
 * `auditLogger` (#3710) so the pipeline's consensus→execute policy gate can
 * persist `policy.evaluated` decisions to the shared hash chain. Optional — when
 * absent (pure-CLI path) the pipeline behaves exactly as before (no durability).
 */
export interface DevPipelineToolDeps extends BaseMcpToolDeps {
  readonly auditLogger?: IAuditLogger | undefined;
}

// ============================================================================
// Input Resolution
// ============================================================================

/**
 * Resolve task input from direct instructions or file.
 *
 * Async because plan files can be large and the previous synchronous read
 * blocked libuv for the duration, stalling concurrent MCP requests (#2354).
 */
async function resolveTaskInput(input: DevPipelineInput): Promise<string> {
  if (input.task !== undefined && input.task.trim() !== '') {
    return input.task;
  }
  if (input.planFile !== undefined) {
    const resolved = path.resolve(input.planFile);
    // Path traversal guard — restrict to cwd subtree (security audit 2026-04-10).
    // The `+ path.sep` is load-bearing: without it, a sibling directory whose
    // name starts with the cwd basename (e.g. `/home/u/projEVIL` when cwd is
    // `/home/u/proj`) bypasses the check. Match the convention in
    // security/safe-path.ts and query-trace-tool.ts.
    const cwdRoot = path.resolve('.');
    if (resolved !== cwdRoot && !resolved.startsWith(cwdRoot + path.sep)) {
      throw new Error(`Path traversal denied: planFile must be within ${cwdRoot}`);
    }
    try {
      return await fs.promises.readFile(resolved, 'utf-8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Plan file not found: ${resolved}`);
      }
      throw err;
    }
  }
  throw new Error('Either task or planFile must be provided');
}

// ============================================================================
// Stub Stages (replaced by real agents when available)
// ============================================================================

/** Create pipeline stages wired to real agents via agent-executor. */
async function createStages(
  input: DevPipelineInput,
  // #4694: record-only. The consensus→execute seam already ENFORCES on this
  // tier; the executor stages have never even recorded it, so a run's stage
  // telemetry could not say what provenance drove it.
  trustTier?: string
): Promise<ReturnType<typeof createAgentStages>> {
  // Auto-detect tracker backend if set to 'auto' or default
  const backendChoice = input.trackerBackend;
  const backend =
    backendChoice === 'json' && input.repo !== undefined ? await detectBackend() : backendChoice;
  const tracker =
    input.repo !== undefined
      ? createTaskTracker({ backend, repo: input.repo, labels: input.labels })
      : undefined;
  return createAgentStages({
    ...(trustTier !== undefined ? { trustTier } : {}),
    scanTarget: input.workingDir,
    simulateVotes: input.simulateVotes,
    votingStrategy: input.votingStrategy,
    quickMode: input.quickMode,
    issueNumber: input.issueNumber,
    repo: input.repo,
    tracker,
    // #3395: thread the opt-in per-run token ceiling through to the budget guard.
    ...(input.maxBudgetTokens !== undefined && {
      budget: { maxTokens: input.maxBudgetTokens },
    }),
  });
}

/**
 * Run the dev pipeline for a plain goal string with default (real, non-simulated)
 * settings. The strategy executor the unified `run` entry point dispatches to for
 * the `dev-pipeline` strategy (#3575). Wires real agents via {@link createStages};
 * never simulates votes (schema default `simulateVotes: false`).
 */
export async function runDevPipelineForGoal(
  goal: string,
  trustTier?: string,
  dryRun?: boolean
): Promise<DevPipelineResult> {
  // #4806: `dryRun` is the one pipeline option `run` forwards. `mode` and
  // `qualityGate` stay pipeline-specific vocabulary — a caller who wants those
  // has already decided on the strategy and should call `run_dev_pipeline`.
  const input = DevPipelineInputSchema.parse({
    task: goal,
    ...(dryRun !== undefined ? { dryRun } : {}),
  });
  const stages = await createStages(input, trustTier);
  // #3712: thread the caller's real content-provenance trust tier into the
  // consensus→execute policy snapshot. Undefined ⇒ seam fail-closes to tier 4
  // (never infer trust from absence). The `run` entry point passes the caller's
  // real RequestContext.trustTier here — closing the run-path hole where a
  // possibly-untrusted goal ran a real research stage with an absent tier.
  return runDevPipeline(goal, stages, {
    ...(trustTier !== undefined ? { trustTier } : {}),
    // #4806 said `dryRun` is the one pipeline option `run` forwards. It parsed
    // the flag into `input` — which only `createStages` reads — and then built
    // the options from `trustTier` alone, so the short-circuit at
    // `dev-pipeline.ts:367` never fired and a dry run implemented for real.
    ...(input.dryRun ? { dryRun: true as const } : {}),
  });
}

// ============================================================================
// Tool Registration
// ============================================================================

/** Build structured JSON output for harness consumption (#1700). */
function buildStructuredOutput(
  result: DevPipelineResult,
  simulated: boolean
): Record<string, unknown> {
  return {
    // #4170: stamped only on an explicit NEXUS_ALLOW_SIMULATE=1 opt-in run so
    // a random demo panel can never pass as a real decision.
    ...(simulated ? { simulated: true } : {}),
    completed: result.completed,
    securityPassed: result.securityPassed,
    // #4772: these two are what make `completed: false` legible. Without them a
    // caller cannot tell a failed planner from a successful dry run, or a
    // security rejection from a gate that never ran — which is the whole point
    // of the fields. They were added to DevPipelineResult and then not listed
    // here, so they never reached the MCP surface.
    ...(result.securityRan !== undefined ? { securityRan: result.securityRan } : {}),
    ...(result.planStatus !== undefined ? { planStatus: result.planStatus } : {}),
    voteIterations: result.voteIterations,
    qaIterations: result.qaIterations,
    plan: result.plan,
    tasks: result.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      implementation: t.implementation ?? null,
      feedback: t.feedback ?? null,
    })),
  };
}

const RUN_DEV_PIPELINE_DESCRIPTION =
  "Run the multi-agent development pipeline. Accepts direct task instructions, a plan file, or a spec file. Supports dry-run (plan+vote only). Supports dispatch: 'async' (non-dryRun runs) — returns a jobId immediately; poll get_job_result.";

/**
 * Validates input, runs the dev pipeline, and shapes the result.
 *
 * `trustTier` is the caller's real content-provenance tier, threaded from
 * `RequestContext.trustTier` by the registered 2-arg handler (#3712). When
 * undefined (no caller context), the consensus→execute seam fail-closes to
 * untrusted (tier 4) — absence is never treated as trusted.
 */
/**
 * Build the {@link DevPipelineOptions} from validated input plus the threaded
 * caller context. Extracted so the handler stays under the complexity cap. The
 * `auditLogger` (#3710) is included only when the server threaded one.
 */
function buildPipelineOptions(
  input: DevPipelineInput,
  trustTier: string | undefined,
  auditLogger: IAuditLogger | undefined
): DevPipelineOptions {
  return {
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.dryRun ? { dryRun: true } : {}),
    ...(input.mode === 'harness' ? { mode: 'harness' as const } : {}),
    ...(input.qualityGate !== 'off' ? { qualityGate: input.qualityGate } : {}),
    // #4939: both were advertised, bounds-checked and defaulted since the tool
    // shipped, and neither was ever read off `parsed.data`.
    maxVoteIterations: input.maxVoteIterations,
    maxQaIterations: input.maxQaIterations,
    ...(trustTier !== undefined ? { trustTier } : {}),
    // #3710: thread the server's durable audit logger so the consensus→execute
    // policy gate persists decisions to the shared hash chain.
    ...(auditLogger !== undefined ? { auditLogger } : {}),
  };
}

/**
 * Run the pipeline body + shape the structured success envelope. The
 * sync handler awaits this inline; the async dispatcher backgrounds it via
 * {@link runAsJob}. `taskText` + `stages` + `pipelineOptions` are resolved by
 * the sync prelude in {@link runDevPipelineHandler} so only the (long) pipeline
 * body runs in the background (#3726).
 */
async function executeDevPipelineBody(
  taskText: string,
  stages: Awaited<ReturnType<typeof createStages>>,
  pipelineOptions: DevPipelineOptions | undefined,
  simulated: boolean
): Promise<ToolResult> {
  const result = await runDevPipeline(taskText, stages, pipelineOptions);
  // Always flush memory session — including dry-run exits (#1716)
  flushPipelineMemory();
  return toolSuccessStructured(buildStructuredOutput(result, simulated));
}

async function runDevPipelineHandler(
  args: unknown,
  logger: ILogger,
  trustTier?: string,
  auditLogger?: IAuditLogger
): Promise<ToolResult> {
  const parsed = DevPipelineInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Invalid input: ${formatZodError(parsed.error)}`,
    });
  }
  const input = parsed.data;
  // #4170: simulateVotes fails CLOSED outside test runners — BEFORE the try
  // block (its catch categorizes as `internal`) and BEFORE the async dispatch
  // (sync and async modes must reject identically).
  let simulated = false;
  if (input.simulateVotes) {
    const simCheck = checkSimulationAllowed('run_dev_pipeline', logger);
    if (!simCheck.allowed) return simulationDeniedResult(simCheck.reason);
    simulated = simCheck.optedIn;
  }

  try {
    // Sync prelude — fast: input resolution + stage wiring + option build.
    // Only the pipeline BODY backgrounds in async mode (#3726).
    const taskText = await resolveTaskInput(input);
    const stages = await createStages(input, trustTier);
    const pipelineOptions = buildPipelineOptions(input, trustTier, auditLogger);
    const hasOptions = Object.keys(pipelineOptions).length > 0;
    const resolvedOptions = hasOptions ? pipelineOptions : undefined;
    const run = (): Promise<ToolResult> =>
      executeDevPipelineBody(taskText, stages, resolvedOptions, simulated);

    // #3726: async dispatch for real (non-dryRun) runs — a full pipeline can
    // exceed the 900s MCP request timeout. dryRun ALWAYS stays sync (plan+vote
    // completes fast). Returns `{ status: 'pending', jobId }` immediately.
    if (input.dispatch === 'async' && !input.dryRun) {
      return dispatchAsyncDevPipeline(input, run, logger);
    }

    return await run();
  } catch (error: unknown) {
    // #3726 discoverability: a sync run that times out (or otherwise fails
    // mid-pipeline) should point the caller at async mode — the durable fix
    // for runs that exceed the 900s request timeout.
    return toolStructuredError({
      errorCategory: 'internal',
      message: `${dispatchNoteFor(input.dryRun)} Pipeline error: ${getErrorMessage(error)}`,
    });
  }
}

/**
 * Async-mode dispatcher (#3726). jobId === sessionId ONLY when the caller
 * explicitly supplies one (enables task-state resume); otherwise a fresh
 * `dp-<uuid>` is minted. A reused sessionId surfaces via the EXISTING
 * idempotency envelope (replay/collision) — it NEVER silently returns another
 * run's data. The background runner writes the result to the SIDECAR
 * regardless of jobId (the Stage-2 task-state reader is flag-gated off by
 * default), so `get_job_result({ jobId })` always resolves.
 *
 * Why the manual idempotency pre-check (vs `runAsJob`'s built-in key path):
 * the shared helper's keyed path derives an opaque `job-<tool>-<hash>` jobId,
 * but #3726 needs the jobId to BE the sessionId so a resumed run polls the
 * same key. So we resolve idempotency here with the jobId PINNED to the
 * sessionId, then dispatch through `runAsJob` keyless (freshJobId === the
 * sessionId, used verbatim).
 */
function dispatchAsyncDevPipeline(
  input: DevPipelineInput,
  run: () => Promise<ToolResult>,
  logger: ILogger
): ToolResult {
  // No sessionId → mint a fresh dp-<uuid>; no idempotency surface to track.
  if (input.sessionId === undefined) {
    return runAsJob<DevPipelineInput, ToolResult>({
      toolName: 'run_dev_pipeline',
      input,
      freshJobId: () => `dp-${randomUUID()}`,
      run,
      logger,
    });
  }

  // sessionId provided → jobId === sessionId, with collision-surfacing.
  const sessionId = input.sessionId;
  const resolution = resolveIdempotency('run_dev_pipeline', sessionId, input, () => sessionId);
  if (resolution.kind === 'replay') {
    return defaultReplayEnvelope(resolution.jobId);
  }
  if (resolution.kind === 'collision') {
    return defaultCollisionEnvelope(resolution.existingJobId);
  }
  // Fresh dispatch: pin the index entry to jobId === sessionId so a rerun
  // replays/collides against it, then dispatch keyless on that jobId.
  registerIdempotentJob({
    tool: 'run_dev_pipeline',
    idempotencyKey: sessionId,
    inputs: input,
    jobId: sessionId,
  });
  return runAsJob<DevPipelineInput, ToolResult>({
    toolName: 'run_dev_pipeline',
    input,
    freshJobId: () => sessionId,
    run,
    logger,
  });
}

/**
 * Register the run_dev_pipeline MCP tool.
 *
 * Routed through the standard `createSecureHandler → wrapToolWithTimeout →
 * toSdkCallback` chain like every other tool (#2824): the bare-callback
 * registration it used before had no rate-limiting, no abort-signal /
 * progress-token plumbing, and surfaced a `ZodError` on bad input as a raw
 * JSON-RPC `-32603` instead of a structured `validation` envelope.
 */
export function registerDevPipelineTool(server: McpServer, deps: DevPipelineToolDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run_dev_pipeline' });
  // 2-arg context-aware form (mirrors delegate-to-model.ts): thread the caller's
  // real RequestContext.trustTier into the consensus→execute policy snapshot
  // (#3712). createSecureHandler always supplies a HandlerContext with a derived
  // trustTier; the handler still fail-closes (tier 4) if a tier never reaches
  // the runDevPipeline seam. The server's durable auditLogger (#3710) is threaded
  // so the gate persists policy decisions to the shared hash chain.
  const secureHandler = createSecureHandler(
    (args: unknown, ctx: HandlerContext) =>
      runDevPipelineHandler(args, logger, measuredTrustTier(ctx.requestContext), deps.auditLogger),
    { toolName: 'run_dev_pipeline', rateLimiter: deps.rateLimiter, logger }
  );
  const timeoutMs = getToolTimeout('run_dev_pipeline', deps.security);
  const wrapped = wrapToolWithTimeout('run_dev_pipeline', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'run_dev_pipeline',
    {
      description: RUN_DEV_PIPELINE_DESCRIPTION,
      inputSchema: DevPipelineInputSchema.shape,
      annotations: getToolAnnotations('run_dev_pipeline'),
    },
    toSdkCallback(wrapped)
  );
  logger.info('Registered run_dev_pipeline tool');
}
