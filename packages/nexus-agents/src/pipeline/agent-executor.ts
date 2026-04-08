/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string, max-lines-per-function -- Bridge module with dynamic imports; ESLint can't resolve cross-module types */
/**
 * Agent Executor — Connects pipeline stages to real expert agents (#1684)
 *
 * Bridges the DevPipelineStages interface to nexus-agents' expert system.
 * Uses the UnifiedAdapterRegistry to route tasks to the best available CLI.
 * Posts updates to GitHub issues for tracking when issueNumber is provided.
 *
 * @module pipeline/agent-executor
 */

import { createLogger } from '../core/index.js';
import type { DevPipelineStages, PipelineTask, QaReviewResult } from './dev-pipeline.js';
import { checkSecurityScan } from './security-gate.js';

const logger = createLogger({ component: 'agent-executor' });

/** Configuration for the agent executor. */
export interface AgentExecutorConfig {
  /** Directory to security scan. */
  readonly scanTarget?: string | undefined;
  /** Whether to use simulated votes (for testing without CLIs). */
  readonly simulateVotes?: boolean | undefined;
  /** GitHub issue number to post progress updates to. */
  readonly issueNumber?: number | undefined;
  /** GitHub repo (owner/name) for issue updates. */
  readonly repo?: string | undefined;
}

/** Post a progress update to a GitHub issue if configured. */
async function postProgress(
  config: AgentExecutorConfig,
  stage: string,
  message: string
): Promise<void> {
  if (config.issueNumber === undefined || config.repo === undefined) return;
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    const body = `**[${stage}]** ${message}`;
    await exec(
      'gh',
      ['issue', 'comment', String(config.issueNumber), '--repo', config.repo, '--body', body],
      { timeout: 15000 }
    );
    logger.info('Posted progress to GitHub', { issue: config.issueNumber, stage });
  } catch (error) {
    logger.debug('Failed to post GitHub progress', { error: String(error) });
  }
}

/** Get an adapter from the registry, or undefined if unavailable. */
async function getAdapter(
  category: string
): Promise<
  | {
      execute: (opts: {
        content: string;
      }) => Promise<{ ok: boolean; value: { content: string }; error: { message: string } }>;
    }
  | undefined
> {
  try {
    const { getGlobalRegistry } = await import('../adapters/unified-registry.js');
    const registry = getGlobalRegistry();
    return registry.getAdapter(category as never);
  } catch {
    return undefined;
  }
}

/** Execute a prompt via an adapter, returning the response text or a fallback. */
async function executeWithAdapter(
  category: string,
  prompt: string,
  fallback: string
): Promise<string> {
  const adapter = await getAdapter(category);
  if (adapter === undefined) return fallback;
  try {
    const result = await adapter.execute({ content: prompt });
    return result.ok ? result.value.content : `${category} failed: ${result.error.message}`;
  } catch (error) {
    return `${category} error: ${String(error)}`;
  }
}

/**
 * Create pipeline stages wired to real nexus-agents infrastructure.
 * Posts progress updates to GitHub issues when configured.
 */
export function createAgentStages(config: AgentExecutorConfig = {}): DevPipelineStages {
  return {
    research: async (task) => {
      await postProgress(config, 'Research', 'Gathering context...');
      const result = await executeWithAdapter(
        'research',
        `You are a research expert. Gather context for:\n\n${task}`,
        `[Research skipped] ${task.slice(0, 500)}`
      );
      await postProgress(config, 'Research', `Complete (${result.length} chars)`);
      return result;
    },

    plan: async (task, research, feedback) => {
      const hasFeedback = feedback !== undefined;
      await postProgress(
        config,
        'Plan',
        hasFeedback ? `Revising plan based on feedback...` : 'Creating implementation plan...'
      );
      const prompt = hasFeedback
        ? `Revise the plan based on vote feedback.\n\nFeedback: ${feedback}\n\nTask: ${task}\n\nResearch: ${research}`
        : `Create a detailed implementation plan for:\n\n${task}\n\nResearch: ${research}`;
      const result = await executeWithAdapter('architecture', prompt, prompt);
      await postProgress(config, 'Plan', `Plan created (${result.length} chars)`);
      return result;
    },

    vote: async (plan) => {
      await postProgress(config, 'Vote', 'Running consensus vote...');
      try {
        const { collectRealVotes } = await import('../cli/voter-agents.js');
        const { DEFAULT_VOTER_ROLES } = await import('../cli/voter-prompts.js');
        const votes = await collectRealVotes({
          roles: DEFAULT_VOTER_ROLES,
          proposal: plan.slice(0, 4000),
          simulate: config.simulateVotes ?? false,
        });
        const approvals = votes.filter((v) => v.decision === 'approve').length;
        const total = votes.length;
        const pct = total > 0 ? (approvals / total) * 100 : 0;
        const approved = pct >= 50;
        const feedback = votes
          .filter((v) => v.decision !== 'approve')
          .map((v) => v.reasoning)
          .join('\n');
        await postProgress(
          config,
          'Vote',
          `${approved ? 'Approved' : 'Rejected'} (${approvals}/${total}, ${Math.round(pct)}%)`
        );
        return { approved, feedback, approvalPercentage: pct };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn('Vote failed, auto-approving', { error: msg });
        await postProgress(config, 'Vote', `Vote error (auto-approved): ${msg.slice(0, 200)}`);
        return { approved: true, feedback: `Vote error: ${msg}`, approvalPercentage: 0 };
      }
    },

    decompose: async (plan) => {
      await postProgress(config, 'PM Decompose', 'Splitting plan into tasks...');
      const prompt = `You are a product manager. Decompose this plan into discrete tasks.\nReturn a JSON array: [{id, title, description, assignedTo}]\n\nPlan:\n${plan}`;
      const response = await executeWithAdapter('planning', prompt, '');
      const tasks = parseTasksFromResponse(response, plan);
      await postProgress(
        config,
        'PM Decompose',
        `Created ${tasks.length} task(s): ${tasks.map((t) => t.title).join(', ')}`
      );
      return tasks;
    },

    implement: async (task) => {
      await postProgress(config, `Implement [${task.id}]`, `Working on: ${task.title}`);
      const feedbackSection =
        task.feedback !== undefined ? `\n\nQA feedback to address: ${task.feedback}` : '';
      const prompt = `Implement:\n\nTitle: ${task.title}\nDescription: ${task.description}${feedbackSection}`;
      const result = await executeWithAdapter('code_generation', prompt, `[No adapter] ${prompt}`);
      await postProgress(config, `Implement [${task.id}]`, `Complete (${result.length} chars)`);
      return result;
    },

    qaReview: async (task, implementation) => {
      await postProgress(config, `QA [${task.id}]`, `Reviewing: ${task.title}`);
      const prompt = `QA review:\n\nTask: ${task.title}\n\nImplementation:\n${implementation.slice(0, 3000)}\n\nVerdict: PASS, NEEDS_WORK, or REJECT\nList specific issues.`;
      const response = await executeWithAdapter('code_review', prompt, '');
      const review = parseQaFromResponse(response);
      await postProgress(
        config,
        `QA [${task.id}]`,
        `Verdict: ${review.verdict}${review.issues.length > 0 ? ` (${review.issues.length} issues)` : ''}`
      );
      return review;
    },

    securityScan: async () => {
      const target = config.scanTarget ?? process.cwd();
      await postProgress(config, 'Security', `Scanning ${target}...`);
      const check = checkSecurityScan(target);
      const result = await check();
      const passed = result.verdict !== 'fail';
      await postProgress(config, 'Security', passed ? 'Passed' : `BLOCKED: ${result.details}`);
      return { passed, feedback: result.details };
    },
  };
}

// ============================================================================
// Response Parsers
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
    logger.debug('Failed to parse task JSON from PM response');
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
  const lower = response.toLowerCase();
  if (lower.includes('reject'))
    return { verdict: 'reject', feedback: response, issues: extractIssues(response) };
  if (lower.includes('needs_work') || lower.includes('needs work'))
    return { verdict: 'needs_work', feedback: response, issues: extractIssues(response) };
  return { verdict: 'pass', feedback: response, issues: [] };
}

function extractIssues(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'))
    .map((l) => l.trim().replace(/^[-*]\s*/, ''))
    .filter((l) => l.length > 5)
    .slice(0, 10);
}
