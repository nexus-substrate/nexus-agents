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
import { getErrorMessage } from '../../core/index.js';
import { runDevPipeline } from '../../pipeline/dev-pipeline.js';
import type { DevPipelineResult } from '../../pipeline/dev-pipeline.js';
import { createAgentStages, flushPipelineMemory } from '../../pipeline/agent-executor.js';
import { createTaskTracker, detectBackend } from '../../pipeline/task-tracker.js';
// toolSuccessStructured not used directly — server.tool() expects different return type
import type { TrackerBackend } from '../../pipeline/task-tracker.js';

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
  /** When true, use simulated votes instead of real CLI consensus (for testing). */
  simulateVotes: z
    .boolean()
    .default(false)
    .describe('Use simulated votes (for testing without real CLIs)'),
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
  /** Pipeline execution mode. */
  mode: z
    .enum(['autonomous', 'harness'])
    .default('autonomous')
    .describe(
      "'autonomous': full pipeline. 'harness': stops after decompose, returns tasks for caller to implement."
    ),
});

export type DevPipelineInput = z.infer<typeof DevPipelineInputSchema>;

// ============================================================================
// Input Resolution
// ============================================================================

/** Resolve task input from direct instructions or file. */
function resolveTaskInput(input: DevPipelineInput): string {
  if (input.task !== undefined && input.task.trim() !== '') {
    return input.task;
  }
  if (input.planFile !== undefined) {
    const resolved = path.resolve(input.planFile);
    // Path traversal guard — restrict to cwd subtree (security audit 2026-04-10)
    const cwdRoot = path.resolve('.');
    if (!resolved.startsWith(cwdRoot)) {
      throw new Error(`Path traversal denied: planFile must be within ${cwdRoot}`);
    }
    if (!fs.existsSync(resolved)) {
      throw new Error(`Plan file not found: ${resolved}`);
    }
    return fs.readFileSync(resolved, 'utf-8');
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
  const backendChoice = input.trackerBackend as TrackerBackend;
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
  });
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

/** Register the run_dev_pipeline MCP tool. */
export function registerDevPipelineTool(
  server: McpServer,
  _deps: { logger: unknown; rateLimiter: unknown }
): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- matches existing tool registration pattern
  server.tool('run_dev_pipeline', DevPipelineInputSchema.shape, async (args) => {
    const input = DevPipelineInputSchema.parse(args);

    try {
      const taskText = resolveTaskInput(input);
      const stages = await createStages(input);
      const pipelineOptions = {
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
        ...(input.dryRun ? { dryRun: true } : {}),
        ...(input.mode === 'harness' ? { mode: 'harness' as const } : {}),
      };
      const hasOptions = Object.keys(pipelineOptions).length > 0;
      const result = await runDevPipeline(
        taskText,
        stages,
        hasOptions ? pipelineOptions : undefined
      );
      // Always flush memory session — including dry-run exits (#1716)
      flushPipelineMemory();
      const structured = buildStructuredOutput(result);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
        structuredContent: structured,
      };
    } catch (error: unknown) {
      return {
        content: [{ type: 'text' as const, text: `Pipeline error: ${getErrorMessage(error)}` }],
        isError: true,
      };
    }
  });
}
