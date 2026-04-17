/**
 * nexus-agents/core - `withStep` helper
 *
 * Wraps an async operation in a `step.started` / `step.completed` /
 * `step.failed` trio, propagating parent context via AsyncLocalStorage so
 * nested `withStep` calls get correct parentStepId without threading.
 *
 * @module core/with-step
 * (Source: #1930 — human console notifications; ux-expert design.)
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { getTimeProvider } from './time-provider.js';
import { stepBus } from './step-bus.js';
import type { StepEvent, StepErrorCategory, StepKind } from './step-events.js';
import { truncateSummary } from './step-events.js';

export interface StepOptions {
  /** Operator-facing name, e.g. 'research'. */
  readonly name: string;
  /** Semantic kind for routing/coloring. */
  readonly kind: StepKind;
  /** Optional attrs surfaced into events. */
  readonly attrs?: Record<string, unknown>;
  /**
   * Override parent. Default: ambient value from AsyncLocalStorage.
   * Pass `null` to explicitly start a new root.
   */
  readonly parent?: string | null;
}

export interface StepContext {
  readonly stepId: string;
  /** Attach a one-line human summary shown on completion. */
  setSummary(text: string): void;
  /** Convenience factory for nested steps that inherit this parent. */
  child(opts: Omit<StepOptions, 'parent'>): StepOptions;
}

/** AsyncLocalStorage carrying just the parent step id. */
const als = new AsyncLocalStorage<string>();

/** Expose the current ambient parent id (undefined at root). */
export function currentStepId(): string | undefined {
  return als.getStore();
}

/** Compact base62-ish id suitable for stepId. */
function newStepId(): string {
  // 8 random bytes → 16 hex chars; enough for a process lifetime.
  return randomBytes(8).toString('hex');
}

/** Keyword → category table for categorizeError. Evaluated in order. */
const ERROR_CATEGORY_KEYWORDS: ReadonlyArray<{ match: readonly string[]; cat: StepErrorCategory }> =
  [
    { match: ['timeout', 'timed out'], cat: 'timeout' },
    { match: ['rate limit', 'rate-limited'], cat: 'rate_limit' },
    { match: ['parse', 'json'], cat: 'parse' },
    { match: ['connection', 'econnref', 'network'], cat: 'connection' },
    { match: ['policy', 'not allowed', 'forbidden'], cat: 'policy' },
  ];

/** Classify an error into one of the known StepErrorCategory values. */
function categorizeError(err: unknown): StepErrorCategory {
  if (!(err instanceof Error)) return 'unknown';
  const m = err.message.toLowerCase();
  for (const { match, cat } of ERROR_CATEGORY_KEYWORDS) {
    if (match.some((kw) => m.includes(kw))) return cat;
  }
  return 'execution';
}

/**
 * Emit a `step.started` / `step.completed` / `step.failed` trio around `fn`.
 *
 * The step is reified in AsyncLocalStorage so any nested `withStep` inside
 * `fn` (even through await points) inherits this step as parent.
 *
 * Semantics:
 * - Emits `step.started` synchronously before `fn` runs.
 * - On resolve: emits `step.completed` with durationMs + optional summary.
 * - On reject: emits `step.failed` with durationMs + errorCategory and
 *   rethrows the original error unchanged.
 *
 * Never swallows errors.
 */
interface StepRuntime {
  readonly stepId: string;
  readonly parentStepId: string | undefined;
  readonly opts: StepOptions;
  readonly startNs: number;
}

function resolveParent(opts: StepOptions): string | undefined {
  if (opts.parent === null) return undefined;
  return opts.parent ?? als.getStore();
}

function emitStarted(rt: StepRuntime): void {
  const event: StepEvent = {
    event: 'step.started',
    stepId: rt.stepId,
    name: rt.opts.name,
    kind: rt.opts.kind,
    startedAt: new Date(rt.startNs).toISOString(),
    ...(rt.parentStepId !== undefined ? { parentStepId: rt.parentStepId } : {}),
    ...(rt.opts.attrs !== undefined ? { attrs: rt.opts.attrs } : {}),
  };
  stepBus.emit('step', event);
}

function emitCompleted(rt: StepRuntime, summary: string | undefined): void {
  const event: StepEvent = {
    event: 'step.completed',
    stepId: rt.stepId,
    name: rt.opts.name,
    kind: rt.opts.kind,
    durationMs: getTimeProvider().now() - rt.startNs,
    status: 'ok',
    ...(rt.parentStepId !== undefined ? { parentStepId: rt.parentStepId } : {}),
    ...(rt.opts.attrs !== undefined ? { attrs: rt.opts.attrs } : {}),
    ...(summary !== undefined ? { summary } : {}),
  };
  stepBus.emit('step', event);
}

function emitFailed(rt: StepRuntime, err: unknown, summary: string | undefined): void {
  const errSummary = summary ?? (err instanceof Error ? truncateSummary(err.message) : undefined);
  const event: StepEvent = {
    event: 'step.failed',
    stepId: rt.stepId,
    name: rt.opts.name,
    kind: rt.opts.kind,
    durationMs: getTimeProvider().now() - rt.startNs,
    status: 'failed',
    errorCategory: categorizeError(err),
    ...(rt.parentStepId !== undefined ? { parentStepId: rt.parentStepId } : {}),
    ...(rt.opts.attrs !== undefined ? { attrs: rt.opts.attrs } : {}),
    ...(errSummary !== undefined ? { summary: errSummary } : {}),
  };
  stepBus.emit('step', event);
}

export async function withStep<T>(
  opts: StepOptions,
  fn: (ctx: StepContext) => Promise<T>
): Promise<T> {
  const rt: StepRuntime = {
    stepId: newStepId(),
    parentStepId: resolveParent(opts),
    opts,
    startNs: getTimeProvider().now(),
  };
  let summary: string | undefined;
  const ctx: StepContext = {
    stepId: rt.stepId,
    setSummary(text: string): void {
      summary = truncateSummary(text);
    },
    child(childOpts: Omit<StepOptions, 'parent'>): StepOptions {
      return { ...childOpts, parent: rt.stepId };
    },
  };

  emitStarted(rt);
  try {
    const result = await als.run(rt.stepId, () => fn(ctx));
    emitCompleted(rt, summary);
    return result;
  } catch (err: unknown) {
    emitFailed(rt, err, summary);
    throw err;
  }
}
