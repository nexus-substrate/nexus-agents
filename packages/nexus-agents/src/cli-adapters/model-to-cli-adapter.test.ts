/**
 * Tests for the Model→CLI adapter bridge (#3422).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createModelToCliAdapter } from './model-to-cli-adapter.js';
import { CapacityFilterStage, assessCapacity } from './routing/stages/capacity-stage.js';
import { createRoutingContext, getRemainingCandidates } from './routing/router-stage.js';
import type { RoutingArmId } from './types.js';
import {
  ok,
  err,
  ModelError,
  FixedTimeProvider,
  setTimeProvider,
  resetTimeProvider,
  type IModelAdapter,
  type CompletionResponse,
} from '../core/index.js';

function makeModelAdapter(overrides: Partial<IModelAdapter> = {}): IModelAdapter {
  return {
    providerId: 'anthropic',
    modelId: 'claude-opus',
    capabilities: [],
    complete: vi.fn(),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(10),
    validateConfig: vi.fn().mockReturnValue(ok(undefined)),
    ...overrides,
  };
}

const COMPLETION: CompletionResponse = {
  content: [{ type: 'text', text: 'hello from the api' }],
  usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
  stopReason: 'end_turn',
  model: 'claude-opus',
};

describe('ModelToCliAdapter (#3422)', () => {
  it('exposes the configured display CLI slot as name (not the arm id)', () => {
    const adapter = createModelToCliAdapter(makeModelAdapter(), { name: 'claude' });
    expect(adapter.name).toBe('claude');
  });

  it('maps a successful complete() to a CliResponse with text/usage/model', async () => {
    const complete = vi.fn().mockResolvedValue(ok(COMPLETION));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'claude' });

    const result = await adapter.execute({ content: 'hi' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('hello from the api');
      expect(result.value.usage).toEqual({ inputTokens: 120, outputTokens: 80, totalTokens: 200 });
      expect(result.value.model).toBe('claude-opus');
    }
  });

  it('forwards systemPrompt, maxTokens, and a per-call timeout into the request', async () => {
    const complete = vi.fn().mockResolvedValue(ok(COMPLETION));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'codex' });

    await adapter.execute(
      { content: 'hi', systemPrompt: 'be terse', maxTokens: 256 },
      { timeoutMs: 9000 }
    );

    const req = complete.mock.calls[0]?.[0];
    expect(req).toMatchObject({
      messages: [{ role: 'user', content: 'hi' }],
      systemPrompt: 'be terse',
      maxTokens: 256,
      timeoutMs: 9000,
    });
  });

  it('maps a rate-limit ModelError to a retryable RATE_LIMITED CliError', async () => {
    const complete = vi.fn().mockResolvedValue(err(new ModelError('429 rate limit exceeded')));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'gemini' });

    const result = await adapter.execute({ content: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.retryable).toBe(true);
      expect(result.error.cli).toBe('gemini');
    }
  });

  it('maps a generic ModelError to a non-retryable EXECUTION_ERROR CliError', async () => {
    const complete = vi.fn().mockResolvedValue(err(new ModelError('upstream 500')));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'claude' });

    const result = await adapter.execute({ content: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXECUTION_ERROR');
      expect(result.error.retryable).toBe(false);
    }
  });

  it('reports healthy when the model adapter config validates', async () => {
    const adapter = createModelToCliAdapter(makeModelAdapter(), { name: 'claude' });
    const health = await adapter.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('reports an untouched arm as unmeasured, not as measured-healthy', async () => {
    // Repointed (#4602). This previously read `cap.rateLimited === false`
    // against a hardcoded literal, so it pinned a value the adapter asserted
    // rather than measured. `rateLimited: false` is still correct on a fresh
    // tracker, but the load-bearing claim is `observed: false` — nothing has
    // been observed about this arm yet, and the reading must say so.
    const adapter = createModelToCliAdapter(makeModelAdapter(), { name: 'claude' });
    const cap = await adapter.getCapacity();
    expect(cap.rateLimited).toBe(false);
    expect(cap.observed).toBe(false);
    expect(assessCapacity(cap)).toBe('unmeasured');
  });

  it('delegates listModels to the model adapter when present', async () => {
    const listModels = vi.fn().mockResolvedValue([{ id: 'claude-opus', ownedBy: 'anthropic' }]);
    const adapter = createModelToCliAdapter(makeModelAdapter({ listModels }), { name: 'claude' });

    const models = await adapter.listModels();

    expect(models).toEqual([{ id: 'claude-opus', provider: 'anthropic' }]);
  });

  it('returns an empty model list when the adapter has no listModels surface', async () => {
    const adapter = createModelToCliAdapter(makeModelAdapter(), { name: 'claude' });
    expect(await adapter.listModels()).toEqual([]);
  });
});

/**
 * Provider-asserted quota on the API/SDK arms (#4602).
 *
 * `getCapacity()` used to return `quotaExhausted: false` as a literal. Since
 * `assessCapacity` reaches `'exhausted'` only through `quotaExhausted`, and
 * every API/SDK arm is wrapped by this bridge, no API arm could ever be
 * excluded for quota no matter what the provider said — a check that cannot
 * fail. `toCliError` compounded it: it classified RATE_LIMITED but never
 * called `parseRetryAfterMs`, so the provider's own horizon — the one piece of
 * evidence `CapacityTracker.recordProviderQuotaExhaustion` requires — was
 * discarded before anything could record it.
 *
 * The subprocess path already does all of this (`base-adapter.ts`
 * `createError` → `recordQuotaSignal` → the tracker). These tests pin the
 * bridge onto that same mechanism rather than a parallel one.
 */
describe('ModelToCliAdapter provider quota signal (#4602)', () => {
  /** Longer than the tracker's own 60s window, so it means quota, not throttle. */
  const DURABLE_RETRY_SECONDS = 3_600;

  function rateLimitAdapter(message: string): ReturnType<typeof createModelToCliAdapter> {
    const complete = vi.fn().mockResolvedValue(err(new ModelError(message)));
    return createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'claude' });
  }

  beforeEach(() => {
    setTimeProvider(new FixedTimeProvider(1_700_000_000_000));
  });

  afterEach(() => {
    resetTimeProvider();
  });

  it('parses the provider retry-after onto the CliError, as the subprocess path does', async () => {
    const adapter = rateLimitAdapter('429 rate limit exceeded; retry after 3600 seconds');

    const result = await adapter.execute({ content: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED');
      expect(result.error.retryAfterMs).toBe(DURABLE_RETRY_SECONDS * 1_000);
    }
  });

  it('omits retryAfterMs when the provider stated no horizon', async () => {
    const adapter = rateLimitAdapter('429 too many requests');

    const result = await adapter.execute({ content: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.retryAfterMs).toBeUndefined();
  });

  it('never carries retryAfterMs on a non-retryable error', async () => {
    // Mirrors base-adapter's `retryable ? parse : undefined` guard: a wait hint
    // inside a 500 body is not a rate-limit assertion.
    const adapter = rateLimitAdapter('upstream 500: try again in 30 seconds');

    const result = await adapter.execute({ content: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EXECUTION_ERROR');
      expect(result.error.retryAfterMs).toBeUndefined();
    }
  });

  it('reports the arm exhausted after a durable provider assertion', async () => {
    // The mutation check: an arm handed a real rate-limit error must be able to
    // reach 'exhausted'. Pre-fix this was unreachable by construction.
    const adapter = rateLimitAdapter('rate limit reached; retry after 3600 s');

    await adapter.execute({ content: 'hi' });
    const cap = await adapter.getCapacity();

    expect(cap.quotaExhausted).toBe(true);
    expect(cap.observed).toBe(true);
    expect(assessCapacity(cap)).toBe('exhausted');
  });

  it('does not report quota exhaustion for a sub-window throttle', async () => {
    // A 5s retry-after is an ordinary per-minute throttle. Escalating it would
    // empty the candidate pool for a condition that clears within the minute.
    const adapter = rateLimitAdapter('rate limit; retry after 5 seconds');

    await adapter.execute({ content: 'hi' });

    expect((await adapter.getCapacity()).quotaExhausted).toBe(false);
  });

  it('does not report quota exhaustion when the provider gave no horizon', async () => {
    const adapter = rateLimitAdapter('429 too many requests');

    await adapter.execute({ content: 'hi' });

    expect((await adapter.getCapacity()).quotaExhausted).toBe(false);
  });

  it('marks the arm observed once a call succeeds, and records its usage', async () => {
    const complete = vi.fn().mockResolvedValue(ok(COMPLETION));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'claude' });

    await adapter.execute({ content: 'hi' });
    const cap = await adapter.getCapacity();

    expect(cap.observed).toBe(true);
    expect(assessCapacity(cap)).toBe('healthy');
    // 200 tokens off the claude 100k/min estimate.
    expect(cap.remainingTokens).toBe(100_000 - COMPLETION.usage!.totalTokens);
  });

  it('lets a later success overturn a stale provider assertion', async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce(err(new ModelError('rate limit; retry after 3600 s')))
      .mockResolvedValueOnce(ok(COMPLETION));
    const adapter = createModelToCliAdapter(makeModelAdapter({ complete }), { name: 'claude' });

    await adapter.execute({ content: 'hi' });
    expect((await adapter.getCapacity()).quotaExhausted).toBe(true);

    await adapter.execute({ content: 'hi again' });

    expect((await adapter.getCapacity()).quotaExhausted).toBe(false);
  });

  it('keeps per-adapter isolation: one arm exhausted does not exhaust another', async () => {
    const exhausted = rateLimitAdapter('rate limit; retry after 3600 s');
    const fresh = createModelToCliAdapter(makeModelAdapter(), { name: 'claude' });

    await exhausted.execute({ content: 'hi' });

    expect((await exhausted.getCapacity()).quotaExhausted).toBe(true);
    expect((await fresh.getCapacity()).quotaExhausted).toBe(false);
  });

  it('still routes an exhausted arm under the shipped defaults', async () => {
    // Hard constraint on #4602: `enforceHardLimits` defaults false, so making
    // the signal reportable must not start excluding anyone by default.
    const adapter = rateLimitAdapter('rate limit; retry after 3600 s');
    await adapter.execute({ content: 'hi' });

    // `createRoutingContext` types its candidate list as CliName[], so the
    // stage is exercised on the display slot; the api:* arm-id distinction is
    // the router's Map key and is not what this test is about.
    const armId: RoutingArmId = 'claude';
    const stage = new CapacityFilterStage(new Map([[armId, adapter]]));
    const result = await stage.route(createRoutingContext('x', ['claude']));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getRemainingCandidates(result.value.context)).toEqual([armId]);
    }
  });

  it('excludes the exhausted arm once a caller opts into enforcement', async () => {
    // The other half of the same guard: the signal is real, not inert.
    const adapter = rateLimitAdapter('rate limit; retry after 3600 s');
    await adapter.execute({ content: 'hi' });

    const armId: RoutingArmId = 'claude';
    const stage = new CapacityFilterStage(new Map([[armId, adapter]]), {
      enforceHardLimits: true,
    });
    const result = await stage.route(createRoutingContext('x', ['claude']));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getRemainingCandidates(result.value.context)).toEqual([]);
    }
  });
});
