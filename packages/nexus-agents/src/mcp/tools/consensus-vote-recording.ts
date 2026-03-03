/**
 * Consensus Vote — Recording Helpers
 *
 * Memory and outcome store recording for consensus votes.
 * Extracted from consensus-vote.ts for file size compliance.
 *
 * @module mcp/tools/consensus-vote-recording
 * (Source: Issue #753 memory, Issue #1134 cold start)
 */

import { createLogger, getErrorMessage } from '../../core/index.js';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import { getToolMemory } from './tool-memory.js';
import { getOutcomeStore } from '../../orchestration/outcomes/index.js';
import {
  DEFAULT_CLI,
  CLI_NAMES,
  type CliNameLiteral,
} from '../../config/model-capabilities-types.js';

const logger = createLogger({ tool: 'consensus-vote' });

/** Records a successful consensus vote to session memory. Best-effort. */
export function recordVoteSuccess(
  proposal: string,
  strategy: string,
  outcome: string,
  duration: number
): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Consensus vote: ${strategy} on "${proposal.slice(0, 50)}"`,
      challenges: [],
      durationMs: duration,
    });
    memory.recordLearning({
      pattern: `${strategy} vote → ${outcome}`,
      context: `proposal="${proposal.slice(0, 40)}" duration=${String(duration)}ms`,
      confidence: 0.8,
      source: 'consensus-vote',
    });
    void memory.runPromotionPipeline().catch((error: unknown) => {
      logger.warn('Promotion pipeline failed', { error });
    });
  } catch (error: unknown) {
    logger.warn('Failed to record vote success', { error: getErrorMessage(error) });
  }
}

/** Records a failed consensus vote to session memory. Best-effort. */
export function recordVoteError(proposal: string, errorMessage: string): void {
  try {
    const memory = getToolMemory();
    memory.recordError({
      error: `Consensus vote failed: ${errorMessage.slice(0, 150)}`,
      solution: 'Pending - vote execution failed',
      filePattern: 'mcp/tools/consensus-vote',
    });
  } catch (error: unknown) {
    logger.warn('Failed to record vote error', { error: getErrorMessage(error) });
  }
}

/**
 * Records per-vote outcomes to the outcome store for adaptive routing.
 * Each successful LLM vote contributes a sample to its CLI×category pair.
 * (Issue #1134 — cold start mitigation)
 */
export function recordVoteOutcomes(votes: readonly AgentVoteResult[]): void {
  try {
    const store = getOutcomeStore();
    const now = new Date().toISOString();
    for (const vote of votes) {
      if (vote.source === 'simulation') continue;
      const cliName: CliNameLiteral =
        vote.cli !== undefined && (CLI_NAMES as readonly string[]).includes(vote.cli)
          ? (vote.cli as CliNameLiteral)
          : DEFAULT_CLI;
      store.append({
        id: `vote-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
        cli: cliName,
        category: 'planning',
        model: 'consensus',
        success: vote.source === 'llm',
        durationMs: vote.processingTimeMs,
        timestamp: now,
        source: 'consensus',
      });
    }
  } catch (error: unknown) {
    logger.debug('Best-effort vote outcome recording failed', { error: getErrorMessage(error) });
  }
}
