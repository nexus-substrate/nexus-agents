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
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, getErrorMessage, formatZodError, type ILogger } from '../../core/index.js';
import { runDevPipeline } from '../../pipeline/dev-pipeline.js';
import { warnIfSimulatedOutsideTests } from './simulation-guard.js';
import type { DevPipelineResult } from '../../pipeline/dev-pipeline.js';
import { createAgentStages, flushPipelineMemory } from '../../pipeline/agent-executor.js';
import { createTaskTracker, detectBackend } from '../../pipeline/task-tracker.js';
import { getToolAnnotations } from '../tool-annotations.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccessStructured,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';

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
  input: DevPipelineInput
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
  trustTier?: string
): Promise<DevPipelineResult> {
  const input = DevPipelineInputSchema.parse({ task: goal });
  const stages = await createStages(input);
  // #3712: thread the caller's real content-provenance trust tier into the
  // consensus→execute policy snapshot. Undefined ⇒ seam fail-closes to tier 4
  // (never infer trust from absence). The `run` entry point passes the caller's
  // real RequestContext.trustTier here — closing the run-path hole where a
  // possibly-untrusted goal ran a real research stage with an absent tier.
  return runDevPipeline(goal, stages, trustTier !== undefined ? { trustTier } : undefined);
}

// ============================================================================
// Tool Registration
// ============================================================================

/** Build structured JSON output for harness consumption (#1700). */
function buildStructuredOutput(result: DevPipelineResult): Record<string, unknown> {
  return {
    completed: result.completed,
    securityPassed: result.securityPassed,
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
  'Run the multi-agent development pipeline. Accepts direct task instructions, a plan file, or a spec file. Supports dry-run (plan+vote only).';

/**
 * Validates input, runs the dev pipeline, and shapes the result.
 *
 * `trustTier` is the caller's real content-provenance tier, threaded from
 * `RequestContext.trustTier` by the registered 2-arg handler (#3712). When
 * undefined (no caller context), the consensus→execute seam fail-closes to
 * untrusted (tier 4) — absence is never treated as trusted.
 */
async function runDevPipelineHandler(
  args: unknown,
  logger: ILogger,
  trustTier?: string
): Promise<ToolResult> {
  const parsed = DevPipelineInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Invalid input: ${formatZodError(parsed.error)}`,
    });
  }
  const input = parsed.data;
  if (input.simulateVotes) {
    warnIfSimulatedOutsideTests('run_dev_pipeline', logger);
  }

  try {
    const taskText = await resolveTaskInput(input);
    const stages = await createStages(input);
    const pipelineOptions = {
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.dryRun ? { dryRun: true } : {}),
      ...(input.mode === 'harness' ? { mode: 'harness' as const } : {}),
      ...(input.qualityGate !== 'off' ? { qualityGate: input.qualityGate } : {}),
      ...(trustTier !== undefined ? { trustTier } : {}),
    };
    const hasOptions = Object.keys(pipelineOptions).length > 0;
    const result = await runDevPipeline(taskText, stages, hasOptions ? pipelineOptions : undefined);
    // Always flush memory session — including dry-run exits (#1716)
    flushPipelineMemory();
    return toolSuccessStructured(buildStructuredOutput(result));
  } catch (error: unknown) {
    return toolStructuredError({
      errorCategory: 'internal',
      message: `Pipeline error: ${getErrorMessage(error)}`,
    });
  }
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
export function registerDevPipelineTool(server: McpServer, deps: BaseMcpToolDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run_dev_pipeline' });
  // 2-arg context-aware form (mirrors delegate-to-model.ts): thread the caller's
  // real RequestContext.trustTier into the consensus→execute policy snapshot
  // (#3712). createSecureHandler always supplies a HandlerContext with a derived
  // trustTier; the handler still fail-closes (tier 4) if a tier never reaches
  // the runDevPipeline seam.
  const secureHandler = createSecureHandler(
    (args: unknown, ctx: HandlerContext) =>
      runDevPipelineHandler(args, logger, ctx.requestContext.trustTier),
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
