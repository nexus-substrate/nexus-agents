/**
 * Agent Executor memory write-back — pipeline session memory and routing
 * memory, lazily initialised once per process (#1716, #2971, #6331).
 *
 * @module pipeline/agent-executor-memory
 */

import { createLogger, getTimeProvider } from '../core/index.js';

const logger = createLogger({ component: 'agent-executor' });

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
    const { getLearningDir } = await import('../config/learning-persistence.js');
    const mem = createSessionMemory(getLearningDir());
    mem.startSession(`pipeline-${String(getTimeProvider().now())}`);
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
export function recordLearning(pattern: string, confidence: number, context: string): void {
  void getPipelineMemoryAsync().then((m) => m?.recordLearning({ pattern, confidence, context }));
}

/** Record an error to the cached pipeline session. Fire-and-forget. */
export function recordMemoryError(error: string, solution: string): void {
  void getPipelineMemoryAsync().then((m) => m?.recordError({ error, solution }));
}

/** Flush pipeline memory session. */
export function flushPipelineMemory(): void {
  void getPipelineMemoryAsync().then((m) => m?.flush());
  // #2719 / Phase 4: persistence is now handled by MobiMem's SQLite
  // mirror in mobimem-impl.ts — every `observe`/`recordExecution`/`cache`
  // call writes through to mobimem.db inline. The old persistMobiMemState
  // path created a fresh empty MobiMem and saved its stats to JSON, which
  // didn't actually preserve any data. Removed.
}

// Cached RoutingMemory — lazy-initialized, one per process
let routingMemoryCache: unknown = null;
// Coalesces concurrent init under cold-start fan-out (closes #2971). Without this,
// N concurrent recordRoutingExperience calls each enter the dynamic-import path and
// each build their own RoutingMemory, leaking handles / double-counting events.
// Mirrors the memoryInitPromise pattern above (line 120).
let routingMemoryInitPromise: Promise<unknown> | null = null;

/** Record to RoutingMemory after expert calls (#1716). Fire-and-forget, cached. */
export function recordRoutingExperience(
  category: string,
  success: boolean,
  durationMs: number,
  tokensUsed = 0,
  researchMaturity?: number
): void {
  const metrics = {
    durationMs,
    tokensUsed,
    // #3234: record the run's research-maturity (RECORD + measure; #3815 gates use).
    ...(researchMaturity !== undefined ? { researchMaturity } : {}),
  };
  const callRecord = (rm: unknown): void => {
    (
      rm as { recordExperience: (w: string, m: string[], s: boolean, met: typeof metrics) => void }
    ).recordExperience(category, ['claude'], success, metrics);
  };
  if (routingMemoryCache !== null) {
    callRecord(routingMemoryCache);
    return;
  }
  routingMemoryInitPromise ??= import('../context/routing-memory.js')
    .then(({ createRoutingMemory }) => {
      routingMemoryCache ??= createRoutingMemory();
      return routingMemoryCache;
    })
    .catch((error: unknown) => {
      // Best-effort: routing-memory is optional persistence; log so we
      // can diagnose if it silently stops recording.
      routingMemoryInitPromise = null; // allow retry on next call
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug('Routing memory init failed; continuing without it', { error: msg });
      return null;
    });
  void routingMemoryInitPromise.then((rm) => {
    if (rm !== null) callRecord(rm);
  });
}
