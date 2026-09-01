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
import { ExecutionTraceEntrySchema } from '../pipeline/trace-schema.js';
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
  let rejected = 0;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const entry = parseTraceLine(trimmed);
    if (entry === null) {
      rejected++;
      continue;
    }
    entries.push(entry);
  }

  // `warn`, not `debug` (#5018 pattern): at debug this is invisible at normal
  // log levels, so a replay run over a trace whose lines were mostly rejected
  // reported a small, clean comparison set with no signal that anything was
  // dropped. A silent skip and a genuinely short trace look identical.
  if (rejected > 0) {
    logger.warn('Skipped trace lines that are not valid trace entries', {
      rejected,
      accepted: entries.length,
    });
  }
  return entries;
}

/**
 * Parse one JSONL line into a trace entry, or `null` if it is not one.
 *
 * This used to be `JSON.parse(line) as ExecutionTraceEntry` (#5328), while
 * `ExecutionTraceEntrySchema` sat unused in the very module this file imports
 * its type from. The cast mattered because `modelId` flows into
 * `TracedDecision.selectedModel`, which `compareDecisions` compares with
 * `===`: a non-string `modelId` made two structurally identical decisions
 * compare unequal, and the replay audit certified a divergence reading
 * `Model changed: [object Object] → [object Object]` — a verdict on a
 * comparison that was never actually made.
 */
function parseTraceLine(line: string): ExecutionTraceEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = ExecutionTraceEntrySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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
