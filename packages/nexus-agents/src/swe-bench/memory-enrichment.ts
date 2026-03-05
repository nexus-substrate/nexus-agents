/**
 * nexus-agents/swe-bench - Memory Enrichment
 *
 * Integrates nexus-agents' session memory into SWE-bench agent prompts.
 * Records per-instance outcomes and injects relevant learnings from
 * prior runs into system prompts for future attempts.
 *
 * @module swe-bench/memory-enrichment
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import { createLogger } from '../core/logger.js';
import { createSessionMemory } from '../context/session-memory.js';
import type { SessionMemory } from '../context/session-memory.js';
import type { SessionLearning } from '../context/session-memory-types.js';
import type { SWEBenchInstance, SWEBenchRunResult } from './types.js';
import { SWE_BENCH_SYSTEM_PROMPT } from './prompt-template.js';

const log = createLogger({ component: 'SWEBenchMemory' });

const MEMORY_DIR = '/tmp/swe-bench-memory';

/**
 * Create a session memory instance for SWE-bench runs.
 */
export function createBenchmarkMemory(memoryDir?: string): SessionMemory {
  return createSessionMemory(memoryDir ?? MEMORY_DIR, {
    maxEpisodesToLoad: 10,
    maxLearningsInContext: 20,
  });
}

/**
 * Extract repo name from instance ID (e.g., "django__django-12345" -> "django/django").
 */
export function extractRepoName(instanceId: string): string {
  const parts = instanceId.split('-');
  parts.pop(); // Remove issue number
  const repoSlug = parts.join('-');
  return repoSlug.replace('__', '/');
}

/**
 * Build an enriched system prompt by injecting relevant learnings
 * from past SWE-bench runs.
 */
export function buildEnrichedPrompt(
  learnings: readonly SessionLearning[],
  instance: SWEBenchInstance
): string {
  if (learnings.length === 0) {
    return SWE_BENCH_SYSTEM_PROMPT;
  }

  const repo = extractRepoName(instance.instance_id);

  // Filter learnings relevant to this repo or general SWE-bench patterns
  const relevant = learnings.filter(
    (l) => l.context === repo || l.context === 'swe-bench' || l.context === ''
  );

  if (relevant.length === 0) {
    return SWE_BENCH_SYSTEM_PROMPT;
  }

  const learningLines = relevant
    .slice(0, 10) // Max 10 learnings to avoid prompt bloat
    .map((l) => `- ${l.pattern}`)
    .join('\n');

  return `${SWE_BENCH_SYSTEM_PROMPT}

## Learnings from Prior Runs

The following insights were gathered from previous benchmark runs and may help:

${learningLines}

Use these learnings to inform your approach, but always analyze the specific issue independently.`;
}

/**
 * Record the outcome of a SWE-bench instance for future learning.
 */
export function recordOutcome(
  memory: SessionMemory,
  instance: SWEBenchInstance,
  result: SWEBenchRunResult
): void {
  const repo = extractRepoName(instance.instance_id);

  if (result.completed) {
    const durationSec = Math.round(result.duration_ms / 1000);
    memory.recordLearning({
      pattern: `Instance ${instance.instance_id} solved in ${String(durationSec)}s with ${String(result.tokens_used ?? 0)} tokens`,
      confidence: 0.8,
      context: repo,
    });
  } else if (result.error !== undefined) {
    memory.recordError({
      error: `${instance.instance_id}: ${result.error}`,
      solution: 'unresolved',
    });
  }

  log.debug('Recorded outcome', {
    instanceId: instance.instance_id,
    completed: result.completed,
  });
}

/** Regex to extract instance IDs from learning patterns. */
const INSTANCE_ID_RE = /Instance ([\w/._-]+__[\w._-]+-\d+)/;

/**
 * Extract past success rates from memory learnings.
 * Returns a Map of instance_id -> success rate (1.0 = solved, 0.0 = failed).
 * Used by instance-sorter to prioritize easier instances.
 */
export function extractPastSuccessRates(
  learnings: readonly SessionLearning[]
): Map<string, number> {
  const rates = new Map<string, number>();

  for (const learning of learnings) {
    const match = INSTANCE_ID_RE.exec(learning.pattern);
    if (match?.[1] !== undefined) {
      // Learnings with "solved" come from recordOutcome on success
      rates.set(match[1], learning.pattern.includes('solved') ? 1.0 : 0.0);
    }
  }

  return rates;
}
