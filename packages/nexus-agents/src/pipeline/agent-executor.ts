/* eslint-disable @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-base-to-string, max-lines-per-function, max-lines */
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
import { executeExpert } from './expert-bridge.js';
import { getOutcomeStore, getOutcomeSummaryText } from '../orchestration/outcomes/outcome-store.js';
import { detectTrend } from '../orchestration/outcomes/adaptive-thresholds.js';
import { emitPipelineStageEvent } from './pipeline-observability.js';

const logger = createLogger({ component: 'agent-executor' });

// DRY: delegate to shared pipeline-observability.ts (#1734 Phase 1.1)
function emitStageEvent(
  stage: string,
  status: 'started' | 'completed' | 'failed',
  details?: Record<string, unknown>
): void {
  emitPipelineStageEvent('dev-pipeline', stage, status, details);
}

function recordOutcome(
  taskId: string,
  category: string,
  success: boolean,
  durationMs: number
): void {
  try {
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
  } catch (error) {
    logger.debug('Failed to record outcome', { taskId, error: String(error) });
  }
}

/** Configuration for the agent executor. */
export interface AgentExecutorConfig {
  readonly scanTarget?: string | undefined;
  readonly simulateVotes?: boolean | undefined;
  /** Voting strategy for consensus stages (default: higher_order). */
  readonly votingStrategy?:
    | 'simple_majority'
    | 'supermajority'
    | 'unanimous'
    | 'higher_order'
    | 'proof_of_learning'
    | 'opinion_wise'
    | undefined;
  /** Use 3 agents instead of 6 for faster voting (default: false). */
  readonly quickMode?: boolean | undefined;
  readonly tracker?: ITaskTracker | undefined;
  readonly issueNumber?: number | undefined;
  readonly repo?: string | undefined;
}

// ============================================================================
// Memory Write-Back (#1716 — Async Cached Pipeline Memory)
// ============================================================================

/** Pending memory operations queued before init completes. */
interface MemoryOps {
  recordLearning: (l: { pattern: string; confidence: number; context: string }) => void;
  recordError: (e: { error: string; solution: string }) => void;
  flush: () => void;
}

let cachedMemory: MemoryOps | null = null;
let memoryInitPromise: Promise<MemoryOps | null> | null = null;

/** Async lazy init of pipeline session memory — ESM-safe dynamic import. */
async function initPipelineMemory(): Promise<MemoryOps | null> {
  if (cachedMemory !== null) return cachedMemory;
  try {
    const { createSessionMemory } = await import('../context/session-memory.js');
    const { LEARNING_DIR } = await import('../config/learning-persistence.js');
    const mem = createSessionMemory(LEARNING_DIR);
    mem.startSession(`pipeline-${String(Date.now())}`);
    cachedMemory = {
      recordLearning: (l) => {
        try {
          mem.recordLearning(l);
        } catch {
          /* best effort */
        }
      },
      recordError: (e) => {
        try {
          mem.recordError(e);
        } catch {
          /* best effort */
        }
      },
      flush: () => {
        try {
          mem.endSession('pipeline session');
        } catch {
          /* best effort */
        }
        cachedMemory = null;
        memoryInitPromise = null;
      },
    };
    return cachedMemory;
  } catch {
    memoryInitPromise = null; // Clear so next call retries
    return null;
  }
}

/** Get or create pipeline memory (deduplicates concurrent init). */
function getPipelineMemoryAsync(): Promise<MemoryOps | null> {
  if (cachedMemory !== null) return Promise.resolve(cachedMemory);
  memoryInitPromise ??= initPipelineMemory();
  return memoryInitPromise;
}

/** Record a learning to the cached pipeline session. Fire-and-forget. */
function recordLearning(pattern: string, confidence: number, context: string): void {
  void getPipelineMemoryAsync().then((m) => m?.recordLearning({ pattern, confidence, context }));
}

/** Record an error to the cached pipeline session. Fire-and-forget. */
function recordMemoryError(error: string, solution: string): void {
  void getPipelineMemoryAsync().then((m) => m?.recordError({ error, solution }));
}

/** Flush pipeline memory session. Called at end of pipeline run. Exported for dry-run cleanup. */
export function flushPipelineMemory(): void {
  void getPipelineMemoryAsync().then((m) => m?.flush());
}

// Cached RoutingMemory — lazy-initialized, one per process
let routingMemoryCache: unknown = null;

/** Record to RoutingMemory after expert calls (#1716). Fire-and-forget, cached. */
function recordRoutingExperience(category: string, success: boolean, durationMs: number): void {
  const metrics = { durationMs, tokensUsed: 0 };
  const callRecord = (rm: unknown): void => {
    (
      rm as { recordExperience: (w: string, m: string[], s: boolean, met: typeof metrics) => void }
    ).recordExperience(category, ['claude'], success, metrics);
  };
  if (routingMemoryCache !== null) {
    callRecord(routingMemoryCache);
    return;
  }
  void import('../context/routing-memory.js')
    .then(({ createRoutingMemory }) => {
      routingMemoryCache = createRoutingMemory();
      callRecord(routingMemoryCache);
    })
    .catch(() => {
      /* best effort */
    });
}

// ============================================================================
// Progress Tracking
// ============================================================================

async function postProgress(
  config: AgentExecutorConfig,
  stage: string,
  message: string
): Promise<void> {
  // DRY: tracker.postComment() is the canonical path — delegates to GitHubProvider/GitLabProvider
  // Raw gh CLI calls removed (#1711): tracker already handles this via scm/github-provider.ts
  if (config.tracker !== undefined && config.issueNumber !== undefined) {
    try {
      await config.tracker.postComment(String(config.issueNumber), `**[${stage}]** ${message}`);
    } catch {
      logger.debug('Failed to post progress', { stage, issueNumber: config.issueNumber });
    }
  }
}

// ============================================================================
// Context Enrichment (#1711 — Central Workflow Hub)
// ============================================================================

/** Query outcome store for recent performance context (#1714). */
function getOutcomeContext(): string {
  try {
    const text = getOutcomeSummaryText();
    return text.length > 0 ? `\n\n${text}` : '';
  } catch {
    return '';
  }
}

/** Query weather report for CLI health context (#1713). */
async function getWeatherContext(): Promise<string> {
  try {
    const { generateWeatherReport } = await import('../mcp/tools/weather-report.js');
    const report = generateWeatherReport({ includeAdaptive: true });
    const mappings = 'recommendedMappings' in report ? report.recommendedMappings : [];
    if (!Array.isArray(mappings) || mappings.length === 0) return '';
    const lines = (mappings as Array<{ category: string; cli: string }>)
      .map((m) => `  ${m.category} → ${m.cli}`)
      .join('\n');
    return (
      `\n\n## CLI Health (${String(report.overall.totalTasks)} tasks, ` +
      `${String(Math.round(report.overall.successRate * 100))}% success)\n` +
      `Recommended mappings:\n${lines}\n`
    );
  } catch {
    return '';
  }
}

/**
 * Query SessionMemory for prior learnings relevant to the task (#1716).
 * DRY: follows swe-bench/memory-enrichment.ts pattern.
 */
async function getMemoryContext(task: string): Promise<string> {
  try {
    const { createSessionMemory } = await import('../context/session-memory.js');
    const { LEARNING_DIR } = await import('../config/learning-persistence.js');
    const memory = createSessionMemory(LEARNING_DIR, { maxLearningsInContext: 10 });
    const learnings = memory.searchLearnings(task.slice(0, 200));
    if (learnings.length === 0) return '';
    const lines = learnings
      .slice(0, 8)
      .map((l) => `- ${l.pattern}`)
      .join('\n');
    return `\n\n## Prior Learnings (${String(learnings.length)} relevant)\n${lines}\n`;
  } catch {
    return '';
  }
}

/** Detect quality trend from outcome store (#1716). */
function getTrendContext(): string {
  try {
    const store = getOutcomeStore();
    const outcomes = store.query();
    if (outcomes.length < 10) return '';
    const trend = detectTrend(outcomes);
    if (trend === 'stable') return '';
    if (trend === 'declining') {
      return '\n\n⚠ **Quality trend: DECLINING** — recent success rate is lower than historical. Consider conservative approaches.\n';
    }
    return '\n\n✓ **Quality trend: IMPROVING** — recent success rate is higher than historical.\n';
  } catch {
    return '';
  }
}

// ============================================================================
// Pipeline Stages
// ============================================================================

export function createAgentStages(config: AgentExecutorConfig = {}): DevPipelineStages {
  return {
    research: async (task) => {
      emitStageEvent('research', 'started');
      await postProgress(config, 'Research', 'Querying memory + research tools...');
      // Seed with prior learnings from memory (#1716)
      const memoryCtx = await getMemoryContext(task);
      const discover = await executeExpert(
        'research',
        `Use research_discover to find papers and repos related to:\n\n${task}${memoryCtx}`
      );
      const analyze = await executeExpert(
        'research',
        `Use research_analyze focus=gaps to identify what is missing for:\n\n${task}`
      );
      const combined = [discover.text, analyze.text].filter(Boolean).join('\n\n');
      const totalMs = discover.durationMs + analyze.durationMs;
      const success = discover.success || analyze.success;
      emitStageEvent('research', success ? 'completed' : 'failed', { durationMs: totalMs });
      recordOutcome('research', 'research', success, totalMs);
      // Write-back: persist research findings to memory (#1716)
      if (success && combined.length > 50) {
        recordLearning(
          `Research for "${task.slice(0, 80)}": ${combined.slice(0, 200)}`,
          0.7,
          'pipeline-research'
        );
      }
      await postProgress(config, 'Research', `Done (${combined.length} chars, ${totalMs}ms)`);
      return combined || `[Research failed] ${task.slice(0, 500)}`;
    },

    plan: async (task, research, feedback) => {
      emitStageEvent('plan', 'started');
      const outcomeCtx = getOutcomeContext();
      const trendCtx = getTrendContext();
      const weatherCtx = await getWeatherContext();
      const contextBlock = `${research}${outcomeCtx}${trendCtx}${weatherCtx}`;
      const prompt =
        feedback !== undefined
          ? `Revise plan.\n\nFeedback: ${feedback}\n\nTask: ${task}\n\n${contextBlock}`
          : `Create implementation plan for:\n\n${task}\n\n${contextBlock}`;
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
      const strategy = config.votingStrategy ?? 'higher_order';
      await postProgress(config, 'Vote', `Running consensus with ${strategy} strategy...`);
      try {
        // DRY: use the full consensus_vote pipeline (#1694)
        const { executeVoting } = await import('../mcp/tools/consensus-vote.js');
        const votingResult = await executeVoting(
          {
            proposal: plan.slice(0, 4000),
            strategy,
            simulateVotes: config.simulateVotes ?? false,
            quickMode: config.quickMode ?? false,
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
        if (!approved) {
          return { kind: 'rejected' as const, feedback, approvalPercentage: pct };
        }
        return { kind: 'approved' as const, approvalPercentage: pct };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        emitStageEvent('vote', 'failed', { error: msg });
        recordOutcome('vote', 'planning', false, getTimeProvider().now() - start);
        await postProgress(config, 'Vote', `Error (auto-approved): ${msg.slice(0, 200)}`);
        return { kind: 'approved' as const, approvalPercentage: 0 };
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
      recordRoutingExperience('code_generation', r.success, r.durationMs);
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
      // Write-back: persist QA outcomes to memory (#1716)
      if (review.verdict === 'pass') {
        recordLearning(`Task "${task.title}" passed QA`, 0.8, 'pipeline-qa');
      } else {
        recordMemoryError(
          `QA rejected "${task.title}": ${review.feedback.slice(0, 150)}`,
          'needs rework'
        );
      }
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
      // Flush pipeline memory session at end of run
      flushPipelineMemory();
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
