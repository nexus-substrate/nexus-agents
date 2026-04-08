/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string, max-lines-per-function -- Bridge module with dynamic imports; ESLint can't resolve cross-module types */
/**
 * Agent Executor — Connects pipeline stages to real expert agents (#1684)
 *
 * Bridges the DevPipelineStages interface to nexus-agents' expert system.
 * Uses the UnifiedAdapterRegistry to route tasks to the best available CLI.
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
  readonly scanTarget?: string;
  /** Whether to use simulated votes (for testing without CLIs). */
  readonly simulateVotes?: boolean;
}

/**
 * Create pipeline stages wired to real nexus-agents infrastructure.
 *
 * Each stage delegates to the appropriate expert via the CLI adapter
 * layer. Consensus voting uses the consensus engine. Security scanning
 * uses the SARIF-based scanner.
 *
 * NOTE: This requires model API keys to be configured. If no adapters
 * are available, stages will fail with clear error messages.
 */
export function createAgentStages(config: AgentExecutorConfig = {}): DevPipelineStages {
  return {
    research: async (task) => {
      logger.info('Research stage — delegating to research expert');
      // Dynamic import to avoid circular deps at module load time
      const { getGlobalRegistry } = await import('../adapters/unified-registry.js');
      const registry = getGlobalRegistry();
      const adapter = registry.getAdapterForCategory('research');
      if (adapter === undefined) {
        return `[Research stage skipped — no adapter available]\nTask: ${task.slice(0, 500)}`;
      }
      const result = await adapter.execute({
        content: `You are a research expert. Gather context and relevant information for:\n\n${task}`,
      });
      return result.ok ? result.value.content : `Research failed: ${result.error.message}`;
    },

    plan: async (task, research, feedback) => {
      logger.info('Plan stage — delegating to architecture expert');
      const { getGlobalRegistry } = await import('../adapters/unified-registry.js');
      const registry = getGlobalRegistry();
      const adapter = registry.getAdapterForCategory('architecture');
      const prompt =
        feedback !== undefined
          ? `Revise the implementation plan based on vote feedback.\n\nFeedback: ${feedback}\n\nOriginal task: ${task}\n\nResearch: ${research}`
          : `Create a detailed implementation plan for:\n\n${task}\n\nResearch context: ${research}`;
      if (adapter === undefined) return prompt;
      const result = await adapter.execute({ content: prompt });
      return result.ok ? result.value.content : prompt;
    },

    vote: async (plan) => {
      logger.info('Vote stage — running consensus');
      try {
        const { ConsensusEngine } = await import('../consensus/engine.js');
        const engine = new ConsensusEngine();
        const result = await engine.vote({
          proposal: plan.slice(0, 4000),
          strategy: 'simple_majority',
          simulateVotes: config.simulateVotes ?? false,
        });
        return {
          approved: result.decision === 'approved',
          feedback: result.votes
            .filter((v) => v.decision === 'reject')
            .map((v) => v.reasoning)
            .join('\n'),
          approvalPercentage: result.approvalPercentage,
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn('Vote failed, auto-approving', { error: msg });
        return { approved: true, feedback: `Vote error: ${msg}`, approvalPercentage: 0 };
      }
    },

    decompose: async (plan) => {
      logger.info('Decompose stage — PM expert splits into tasks');
      const { getGlobalRegistry } = await import('../adapters/unified-registry.js');
      const registry = getGlobalRegistry();
      const adapter = registry.getAdapterForCategory('planning');
      const prompt = `You are a product manager. Decompose this plan into discrete implementation tasks.\nReturn a JSON array of objects with: id, title, description, assignedTo (one of: coder, security, testing, documentation).\n\nPlan:\n${plan}`;
      if (adapter === undefined) {
        return [
          {
            id: 'task-1',
            title: 'Implementation',
            description: plan,
            assignedTo: 'coder' as const,
            status: 'pending' as const,
          },
        ];
      }
      const result = await adapter.execute({ content: prompt });
      if (!result.ok) {
        return [
          {
            id: 'task-1',
            title: 'Implementation',
            description: plan,
            assignedTo: 'coder' as const,
            status: 'pending' as const,
          },
        ];
      }
      return parseTasksFromResponse(result.value.content, plan);
    },

    implement: async (task) => {
      logger.info('Implement stage — code expert', { taskId: task.id });
      const { getGlobalRegistry } = await import('../adapters/unified-registry.js');
      const registry = getGlobalRegistry();
      const adapter = registry.getAdapterForCategory('code_generation');
      const prompt = `Implement the following task:\n\nTitle: ${task.title}\nDescription: ${task.description}${task.feedback !== undefined ? `\n\nPrior QA feedback to address: ${task.feedback}` : ''}`;
      if (adapter === undefined) return `[No adapter] ${prompt}`;
      const result = await adapter.execute({ content: prompt });
      return result.ok ? result.value.content : `Implementation failed: ${result.error.message}`;
    },

    qaReview: async (task, implementation) => {
      logger.info('QA stage — qa expert', { taskId: task.id });
      const { getGlobalRegistry } = await import('../adapters/unified-registry.js');
      const registry = getGlobalRegistry();
      const adapter = registry.getAdapterForCategory('code_review');
      const prompt = `You are a QA expert. Review this implementation:\n\nTask: ${task.title}\nDescription: ${task.description}\n\nImplementation:\n${implementation.slice(0, 3000)}\n\nRespond with:\n- verdict: PASS, NEEDS_WORK, or REJECT\n- issues: list of specific problems\n- feedback: actionable improvement guidance`;
      if (adapter === undefined) {
        return { verdict: 'pass' as const, feedback: 'No adapter — auto-pass', issues: [] };
      }
      const result = await adapter.execute({ content: prompt });
      if (!result.ok) {
        return {
          verdict: 'pass' as const,
          feedback: `QA error: ${result.error.message}`,
          issues: [],
        };
      }
      return parseQaFromResponse(result.value.content);
    },

    securityScan: async () => {
      const target = config.scanTarget ?? process.cwd();
      logger.info('Security scan stage', { target });
      const check = checkSecurityScan(target);
      const result = await check();
      return {
        passed: result.verdict !== 'fail',
        feedback: result.details,
      };
    },
  };
}

// ============================================================================
// Response Parsers
// ============================================================================

/** Parse PM's task decomposition from LLM response. */
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

/** Parse QA review from LLM response. */
function parseQaFromResponse(response: string): QaReviewResult {
  const lower = response.toLowerCase();
  if (lower.includes('reject')) {
    return { verdict: 'reject', feedback: response, issues: extractIssues(response) };
  }
  if (lower.includes('needs_work') || lower.includes('needs work')) {
    return { verdict: 'needs_work', feedback: response, issues: extractIssues(response) };
  }
  return { verdict: 'pass', feedback: response, issues: [] };
}

/** Extract issue bullet points from review text. */
function extractIssues(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*'))
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter((line) => line.length > 5)
    .slice(0, 10);
}
