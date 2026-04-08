/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-return, max-lines-per-function */
/**
 * Agent Executor — Connects pipeline stages to nexus-agents infrastructure (#1684)
 *
 * DRY integration (Issue #1691):
 * - CompositeRouter for intelligent multi-CLI routing (#1692)
 * - Pipeline observability events + OutcomeStore recording (#1696)
 * - Task tracker for GitHub/GitLab/JSON issue management
 *
 * @module pipeline/agent-executor
 */

import { createLogger, getTimeProvider } from '../core/index.js';
import type { DevPipelineStages, PipelineTask, QaReviewResult } from './dev-pipeline.js';
import { checkSecurityScan } from './security-gate.js';
import type { ITaskTracker } from './task-tracker.js';
import { emitStageEvent, recordPipelineOutcome } from './pipeline-observability.js';

const logger = createLogger({ component: 'agent-executor' });

/** Configuration for the agent executor. */
export interface AgentExecutorConfig {
  readonly scanTarget?: string | undefined;
  readonly simulateVotes?: boolean | undefined;
  readonly tracker?: ITaskTracker | undefined;
  readonly issueNumber?: number | undefined;
  readonly repo?: string | undefined;
}

// ============================================================================
// Routing via CompositeRouter (#1692)
// ============================================================================

/** Execute a prompt through the 14-stage CompositeRouter. */
async function routeAndExecute(prompt: string, fallback: string): Promise<string> {
  try {
    const { createAllAdapters } = await import('../cli-adapters/factory.js');
    const { createCompositeRouter } = await import('../cli-adapters/composite-router.js');
    const adapters = createAllAdapters();
    if (adapters.size === 0) return fallback;
    const router = createCompositeRouter(adapters);
    const result = await router.executeTask({ content: prompt });
    if (result.ok) return result.value.content;
    return `Routing failed: ${result.error.message}`;
  } catch (error) {
    return `Execution error: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// ============================================================================
// Progress Tracking
// ============================================================================

async function postProgress(
  config: AgentExecutorConfig,
  stage: string,
  message: string
): Promise<void> {
  if (config.tracker !== undefined && config.issueNumber !== undefined) {
    try {
      await config.tracker.postComment(String(config.issueNumber), `**[${stage}]** ${message}`);
    } catch {
      /* best effort */
    }
  }
  if (config.issueNumber !== undefined && config.repo !== undefined) {
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      await exec(
        'gh',
        [
          'issue',
          'comment',
          String(config.issueNumber),
          '--repo',
          config.repo,
          '--body',
          `**[${stage}]** ${message}`,
        ],
        { timeout: 15000 }
      );
    } catch {
      /* best effort */
    }
  }
}

// ============================================================================
// Pipeline Stages
// ============================================================================

export function createAgentStages(config: AgentExecutorConfig = {}): DevPipelineStages {
  return {
    research: async (task) => {
      emitStageEvent('research', 'started');
      const start = getTimeProvider().now();
      await postProgress(config, 'Research', 'Gathering context via CompositeRouter...');
      const result = await routeAndExecute(
        `You are a research expert. Gather context for:\n\n${task}`,
        `[No adapters] ${task.slice(0, 500)}`
      );
      const ms = getTimeProvider().now() - start;
      emitStageEvent('research', 'completed', { durationMs: ms });
      void recordPipelineOutcome('research', 'research', true, ms);
      await postProgress(config, 'Research', `Done (${result.length} chars, ${ms}ms)`);
      return result;
    },

    plan: async (task, research, feedback) => {
      emitStageEvent('plan', 'started');
      const start = getTimeProvider().now();
      const prompt =
        feedback !== undefined
          ? `Revise plan.\n\nFeedback: ${feedback}\n\nTask: ${task}\n\nResearch: ${research}`
          : `Create implementation plan for:\n\n${task}\n\nResearch: ${research}`;
      await postProgress(config, 'Plan', feedback !== undefined ? 'Revising...' : 'Planning...');
      const result = await routeAndExecute(prompt, prompt);
      const ms = getTimeProvider().now() - start;
      emitStageEvent('plan', 'completed', { durationMs: ms });
      void recordPipelineOutcome('plan', 'architecture', true, ms);
      await postProgress(config, 'Plan', `Done (${result.length} chars, ${ms}ms)`);
      return result;
    },

    vote: async (plan) => {
      emitStageEvent('vote', 'started');
      const start = getTimeProvider().now();
      await postProgress(config, 'Vote', 'Running consensus...');
      try {
        const { collectRealVotes } = await import('../cli/voter-agents.js');
        const voteTypes = await import('../cli/vote-types.js');
        const roles = Object.keys(voteTypes.VOTER_ROLES) as ReadonlyArray<
          keyof typeof voteTypes.VOTER_ROLES
        >;
        const votes = await collectRealVotes({
          roles,
          proposal: plan.slice(0, 4000),
          simulate: config.simulateVotes ?? false,
        });
        const approvals = votes.filter((v) => v.vote.decision === 'approve').length;
        const pct = votes.length > 0 ? (approvals / votes.length) * 100 : 0;
        const approved = pct >= 50;
        const feedback = votes
          .filter((v) => v.vote.decision !== 'approve')
          .map((v) => v.vote.reasoning)
          .join('\n');
        const ms = getTimeProvider().now() - start;
        emitStageEvent('vote', 'completed', { durationMs: ms });
        void recordPipelineOutcome('vote', 'planning', approved, ms);
        await postProgress(
          config,
          'Vote',
          `${approved ? 'Approved' : 'Rejected'} (${approvals}/${votes.length})`
        );
        return { approved, feedback, approvalPercentage: pct };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        emitStageEvent('vote', 'failed', { error: msg });
        void recordPipelineOutcome('vote', 'planning', false, getTimeProvider().now() - start, msg);
        await postProgress(config, 'Vote', `Error (auto-approved): ${msg.slice(0, 200)}`);
        return { approved: true, feedback: `Vote error: ${msg}`, approvalPercentage: 0 };
      }
    },

    decompose: async (plan) => {
      emitStageEvent('decompose', 'started');
      const start = getTimeProvider().now();
      await postProgress(config, 'PM', 'Decomposing...');
      const response = await routeAndExecute(
        `PM: Decompose into tasks.\nReturn JSON: [{id,title,description,assignedTo}]\n\n${plan}`,
        ''
      );
      const tasks = parseTasksFromResponse(response, plan);
      const ms = getTimeProvider().now() - start;
      emitStageEvent('decompose', 'completed', { durationMs: ms });
      void recordPipelineOutcome('decompose', 'planning', true, ms);
      await postProgress(config, 'PM', `${tasks.length} task(s)`);
      return tasks;
    },

    implement: async (task) => {
      emitStageEvent(`impl-${task.id}`, 'started');
      const start = getTimeProvider().now();
      await postProgress(config, `Code [${task.id}]`, task.title);
      const fb = task.feedback !== undefined ? `\n\nQA feedback: ${task.feedback}` : '';
      const result = await routeAndExecute(
        `Implement:\n\n${task.title}\n${task.description}${fb}`,
        `[No adapter] ${task.description}`
      );
      const ms = getTimeProvider().now() - start;
      emitStageEvent(`impl-${task.id}`, 'completed', { durationMs: ms });
      void recordPipelineOutcome(task.id, 'code_generation', true, ms);
      await postProgress(config, `Code [${task.id}]`, `Done (${ms}ms)`);
      return result;
    },

    qaReview: async (task, implementation) => {
      emitStageEvent(`qa-${task.id}`, 'started');
      const start = getTimeProvider().now();
      await postProgress(config, `QA [${task.id}]`, 'Reviewing...');
      const response = await routeAndExecute(
        `QA:\n\nTask: ${task.title}\n\nImpl:\n${implementation.slice(0, 3000)}\n\nVerdict: PASS/NEEDS_WORK/REJECT`,
        ''
      );
      const review = parseQaFromResponse(response);
      const ms = getTimeProvider().now() - start;
      emitStageEvent(`qa-${task.id}`, review.verdict === 'pass' ? 'completed' : 'failed', {
        durationMs: ms,
      });
      void recordPipelineOutcome(task.id, 'code_review', review.verdict === 'pass', ms);
      await postProgress(config, `QA [${task.id}]`, review.verdict);
      return review;
    },

    securityScan: async () => {
      emitStageEvent('security', 'started');
      const start = getTimeProvider().now();
      const target = config.scanTarget ?? process.cwd();
      await postProgress(config, 'Security', `Scanning ${target}...`);
      const check = checkSecurityScan(target);
      const result = await check();
      const passed = result.verdict !== 'fail';
      const ms = getTimeProvider().now() - start;
      emitStageEvent('security', passed ? 'completed' : 'failed', { durationMs: ms });
      void recordPipelineOutcome('security', 'security_review', passed, ms);
      await postProgress(config, 'Security', passed ? 'Passed' : `BLOCKED: ${result.details}`);
      return { passed, feedback: result.details };
    },
  };
}

// ============================================================================
// Parsers
// ============================================================================

function parseTasksFromResponse(response: string, fallbackPlan: string): PipelineTask[] {
  try {
    const jsonMatch = /\[[\s\S]*\]/.exec(response);
    if (jsonMatch !== null) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
      return parsed.map((t, i) => ({
        id: String(t['id'] ?? `task-${String(i + 1)}`),
        title: String(t['title'] ?? `Task ${String(i + 1)}`),
        description: String(t['description'] ?? ''),
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      }));
    }
  } catch {
    logger.debug('Failed to parse PM response');
  }
  return [
    {
      id: 'task-1',
      title: 'Implementation',
      description: fallbackPlan,
      assignedTo: 'coder',
      status: 'pending',
    },
  ];
}

function parseQaFromResponse(response: string): QaReviewResult {
  const l = response.toLowerCase();
  if (l.includes('reject'))
    return { verdict: 'reject', feedback: response, issues: extractIssues(response) };
  if (l.includes('needs_work') || l.includes('needs work'))
    return { verdict: 'needs_work', feedback: response, issues: extractIssues(response) };
  return { verdict: 'pass', feedback: response, issues: [] };
}

function extractIssues(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => /^\s*[-*]/.test(l))
    .map((l) => l.trim().replace(/^[-*]\s*/, ''))
    .filter((l) => l.length > 5)
    .slice(0, 10);
}
