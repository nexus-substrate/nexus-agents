/**
 * Replay Executor (#1688)
 *
 * Reads decision traces from JSONL and verifies that the current
 * routing pipeline produces the same decisions. Reports divergences
 * for debugging non-deterministic behavior.
 *
 * @module replay/replay-executor
 */

import { createLogger } from '../core/index.js';
import type { ExecutionTraceEntry } from '../pipeline/trace-schema.js';

const logger = createLogger({ component: 'ReplayExecutor' });

/** A single routing decision extracted from a trace. */
export interface TracedDecision {
  readonly tick: number;
  readonly taskId: string;
  readonly selectedModel: string;
  readonly reasoning: string;
  readonly decisionPath: readonly string[];
}

/** Result of comparing a traced decision against a replayed one. */
export interface ReplayComparison {
  readonly tick: number;
  readonly taskId: string;
  readonly originalModel: string;
  readonly replayedModel: string | null;
  readonly match: boolean;
  readonly divergenceReason: string;
}

/** Summary of a replay run. */
export interface ReplaySummary {
  readonly runId: string;
  readonly totalDecisions: number;
  readonly matches: number;
  readonly divergences: number;
  readonly comparisons: readonly ReplayComparison[];
}

/**
 * Extract routing decisions from trace entries.
 */
export function extractDecisions(entries: readonly ExecutionTraceEntry[]): TracedDecision[] {
  const decisions: TracedDecision[] = [];
  for (const entry of entries) {
    if (entry.eventType !== 'routing.decision') continue;
    const modelId = entry.modelId;
    if (modelId === undefined) continue;
    decisions.push({
      tick: entry.timestamp,
      taskId: entry.executionId ?? 'unknown',
      selectedModel: modelId,
      reasoning: entry.reasoning ?? '',
      decisionPath: entry.decisionPath ?? [],
    });
  }
  return decisions;
}

/**
 * Parse trace JSONL content into entries.
 */
export function parseTraceJsonl(content: string): ExecutionTraceEntry[] {
  const entries: ExecutionTraceEntry[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      entries.push(JSON.parse(trimmed) as ExecutionTraceEntry);
    } catch {
      logger.debug('Skipping malformed trace line');
    }
  }
  return entries;
}

/**
 * Compare traced decisions against expected models.
 * This is the simple form — compares model selection only.
 * A full replay would re-run the routing pipeline with the same inputs.
 */
export function compareDecisions(
  original: readonly TracedDecision[],
  replayed: readonly TracedDecision[]
): ReplaySummary {
  const comparisons: ReplayComparison[] = [];
  let matches = 0;
  let divergences = 0;

  for (let i = 0; i < original.length; i++) {
    const orig = original[i];
    if (orig === undefined) continue;
    const replay = i < replayed.length ? replayed[i] : undefined;

    if (replay === undefined) {
      comparisons.push({
        tick: orig.tick,
        taskId: orig.taskId,
        originalModel: orig.selectedModel,
        replayedModel: null,
        match: false,
        divergenceReason: 'No replayed decision at this index',
      });
      divergences++;
      continue;
    }

    const match = orig.selectedModel === replay.selectedModel;
    if (match) {
      matches++;
    } else {
      divergences++;
    }

    comparisons.push({
      tick: orig.tick,
      taskId: orig.taskId,
      originalModel: orig.selectedModel,
      replayedModel: replay.selectedModel,
      match,
      divergenceReason: match
        ? ''
        : `Model changed: ${orig.selectedModel} → ${replay.selectedModel}`,
    });
  }

  return {
    runId: original[0]?.taskId ?? 'unknown',
    totalDecisions: original.length,
    matches,
    divergences,
    comparisons,
  };
}
