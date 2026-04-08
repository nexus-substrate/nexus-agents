/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string, max-lines-per-function */
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
import { getPipelineEventBus } from './event-bus.js';
import type { PipelineEvent } from './event-types.js';
import { executeExpert } from './expert-bridge.js';

const logger = createLogger({ component: 'agent-executor' });

// Inlined from pipeline-observability.ts (DRY: same pattern as pipeline-runner.ts)
function emitStageEvent(
  stage: string,
  status: 'started' | 'completed' | 'failed',
  details?: Record<string, unknown>
): void {
  const bus = getPipelineEventBus();
  const ts = getTimeProvider().now();
  const execId = `dev-pipeline-${stage}`;
  if (status === 'started')
    bus.emit({
      type: 'stage.started',
      timestamp: ts,
      executionId: execId,
      stageId: stage,
    } as PipelineEvent);
  else if (status === 'completed')
    bus.emit({
      type: 'stage.completed',
      timestamp: ts,
      executionId: execId,
      stageId: stage,
      durationMs: (details?.['durationMs'] as number) || 0,
    } as PipelineEvent);
  else
    bus.emit({
      type: 'stage.failed',
      timestamp: ts,
      executionId: execId,
      stageId: stage,
      error: (details?.['error'] as string) || 'Unknown',
    } as PipelineEvent);
}

function recordOutcome(
  taskId: string,
  category: string,
  success: boolean,
  durationMs: number
): void {
  import('../orchestration/outcomes/outcome-store.js')
    .then(({ getOutcomeStore }) => {
      getOutcomeStore().append({
        id: `pipeline-${taskId}-${String(Date.now())}`,
        cli: 'claude' as const,
        category: category as 'code_generation',
        model: 'pipeline',
        success,
        durationMs,
        timestamp: new Date().toISOString(),
        source: 'delegate' as const,
      });
    })
    .catch(() => {
      /* best effort */
    });
}

/** Configuration for the agent executor. */
export interface AgentExecutorConfig {
  readonly scanTarget?: string | undefined;
  readonly simulateVotes?: boolean | undefined;
  readonly tracker?: ITaskTracker | undefined;
  readonly issueNumber?: number | undefined;
  readonly repo?: string | undefined;
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
      await postProgress(config, 'Research', 'Research expert gathering context...');
      const r = await executeExpert('research', `Gather context for:\n\n${task}`);
      emitStageEvent('research', r.success ? 'completed' : 'failed', { durationMs: r.durationMs });
      recordOutcome('research', 'research', r.success, r.durationMs);
      await postProgress(config, 'Research', `Done (${r.text.length} chars, ${r.durationMs}ms)`);
      return r.text || `[Research failed: ${r.error}] ${task.slice(0, 500)}`;
    },

    plan: async (task, research, feedback) => {
      emitStageEvent('plan', 'started');
      const prompt =
        feedback !== undefined
          ? `Revise plan.\n\nFeedback: ${feedback}\n\nTask: ${task}\n\nResearch: ${research}`
          : `Create implementation plan for:\n\n${task}\n\nResearch: ${research}`;
      await postProgress(config, 'Plan', feedback !== undefined ? 'Revising...' : 'Planning...');
      const r = await executeExpert('architecture', prompt);
      emitStageEvent('plan', r.success ? 'completed' : 'failed', { durationMs: r.durationMs });
      recordOutcome('plan', 'architecture', r.success, r.durationMs);
      await postProgress(config, 'Plan', `Done (${r.text.length} chars, ${r.durationMs}ms)`);
      return r.text || prompt;
    },

    vote: async (plan) => {
      emitStageEvent('vote', 'started');
      const start = getTimeProvider().now();
      await postProgress(config, 'Vote', 'Running consensus with higher_order strategy...');
      try {
        // DRY: use the full consensus_vote pipeline (#1694)
        const { executeVoting } = await import('../mcp/tools/consensus-vote.js');
        const votingResult = await executeVoting(
          {
            proposal: plan.slice(0, 4000),
            strategy: 'higher_order',
            simulateVotes: config.simulateVotes ?? false,
            quickMode: false,
          },
          logger
        );
        const approved = votingResult.result.outcome === 'approved';
        const pct =
          (votingResult.result.voteCounts.approve /
            Math.max(
              1,
              votingResult.result.voteCounts.approve + votingResult.result.voteCounts.reject
            )) *
          100;
        const feedback = votingResult.votes
          .filter((v) => v.vote.decision !== 'approve')
          .map((v) => v.vote.reasoning)
          .join('\n');
        const ms = getTimeProvider().now() - start;
        emitStageEvent('vote', 'completed', { durationMs: ms });
        recordOutcome('vote', 'planning', approved, ms);
        await postProgress(
          config,
          'Vote',
          `${approved ? 'Approved' : 'Rejected'} (${Math.round(pct)}%, ${ms}ms)`
        );
        return { approved, feedback, approvalPercentage: pct };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        emitStageEvent('vote', 'failed', { error: msg });
        recordOutcome('vote', 'planning', false, getTimeProvider().now() - start);
        await postProgress(config, 'Vote', `Error (auto-approved): ${msg.slice(0, 200)}`);
        return { approved: true, feedback: `Vote error: ${msg}`, approvalPercentage: 0 };
      }
    },

    decompose: async (plan) => {
      emitStageEvent('decompose', 'started');
      await postProgress(config, 'PM', 'PM expert decomposing...');
      const r = await executeExpert(
        'pm',
        `Decompose into tasks.\nReturn JSON: [{id,title,description,assignedTo}]\n\n${plan}`
      );
      const tasks = parseTasksFromResponse(r.text, plan);
      emitStageEvent('decompose', 'completed', { durationMs: r.durationMs });
      recordOutcome('decompose', 'planning', r.success, r.durationMs);
      await postProgress(config, 'PM', `${tasks.length} task(s)`);
      return tasks;
    },

    implement: async (task) => {
      emitStageEvent(`impl-${task.id}`, 'started');
      await postProgress(config, `Code [${task.id}]`, task.title);
      const fb = task.feedback !== undefined ? `\n\nQA feedback: ${task.feedback}` : '';
      const r = await executeExpert(
        'code',
        `Implement:\n\n${task.title}\n${task.description}${fb}`
      );
      emitStageEvent(`impl-${task.id}`, r.success ? 'completed' : 'failed', {
        durationMs: r.durationMs,
      });
      recordOutcome(task.id, 'code_generation', r.success, r.durationMs);
      await postProgress(config, `Code [${task.id}]`, `Done (${r.durationMs}ms)`);
      return r.text || `[Implementation failed: ${r.error}]`;
    },

    qaReview: async (task, implementation) => {
      emitStageEvent(`qa-${task.id}`, 'started');
      await postProgress(config, `QA [${task.id}]`, 'QA expert reviewing...');
      const r = await executeExpert(
        'qa',
        `QA:\n\nTask: ${task.title}\n\nImpl:\n${implementation.slice(0, 3000)}\n\nVerdict: PASS/NEEDS_WORK/REJECT`
      );
      const review = parseQaFromResponse(r.text);
      emitStageEvent(`qa-${task.id}`, review.verdict === 'pass' ? 'completed' : 'failed', {
        durationMs: r.durationMs,
      });
      recordOutcome(task.id, 'code_review', review.verdict === 'pass', r.durationMs);
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
      recordOutcome('security', 'security_review', passed, ms);
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
