/**
 * Tests for `withModelNotFoundFallback` (#2540 PR 8) and the
 * `wrapResilientWithFallback` helper (#2549).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  withModelNotFoundFallback,
  wrapResilientWithFallback,
  type ResilientLike,
} from './model-not-found-fallback.js';
import {
  err,
  ErrorCode,
  ModelError,
  ok,
  type IModelAdapter,
  type CompletionRequest,
  type CompletionResponse,
  type Result,
} from '../core/index.js';
import {
  AvailableModelsCache,
  getDefaultAvailableModelsCache,
  setDefaultAvailableModelsCache,
} from '../config/available-models-cache.js';

function fakeAdapter(
  modelId: string,
  complete: (req: CompletionRequest) => Promise<Result<CompletionResponse, ModelError>>
): IModelAdapter {
  return {
    providerId: 'anthropic',
    modelId,
    capabilities: [],
    complete,
    stream: (): AsyncIterable<never> => {
      throw new Error('not implemented');
    },
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ok(undefined),
  };
}

function successResponse(content = 'ok'): Result<CompletionResponse, ModelError> {
  return ok({
    content: [{ type: 'text', text: content }],
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    stopReason: 'end_turn',
    model: 'mocked',
  });
}

const dummyRequest: CompletionRequest = { messages: [{ role: 'user', content: 'hi' }] };

describe('withModelNotFoundFallback (#2540 PR 8)', () => {
  it('passes through successful complete()', async () => {
    const inner = fakeAdapter('claude-opus-4-7', () => Promise.resolve(successResponse()));
    const cache = new AvailableModelsCache({ sources: [] });
    const wrapped = withModelNotFoundFallback(inner, { cache });
    const r = await wrapped.complete(dummyRequest);
    expect(r.ok).toBe(true);
  });

  it('passes through non-MODEL_NOT_FOUND errors untouched', async () => {
    const inner = fakeAdapter('claude-opus-4-7', () =>
      Promise.resolve(err(new ModelError('rate limited', { code: ErrorCode.MODEL_RATE_LIMITED })))
    );
    const cache = new AvailableModelsCache({ sources: [] });
    const wrapped = withModelNotFoundFallback(inner, { cache });
    const r = await wrapped.complete(dummyRequest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
  });

  it('on MODEL_NOT_FOUND with no factory, surfaces enriched error w/ fallback id', async () => {
    const inner = fakeAdapter('claude-opus-4-6', () =>
      Promise.resolve(
        err(new ModelError('404 model_not_found', { code: ErrorCode.MODEL_NOT_FOUND }))
      )
    );
    const cache = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    const wrapped = withModelNotFoundFallback(inner, { cache });
    const r = await wrapped.complete(dummyRequest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ErrorCode.MODEL_NOT_FOUND);
      expect(r.error.message).toContain('claude-opus-4-7');
    }
  });

  it('on MODEL_NOT_FOUND with factory, retries through new adapter and returns success', async () => {
    const inner = fakeAdapter('claude-opus-4-6', () =>
      Promise.resolve(err(new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })))
    );
    const fallbackComplete = vi.fn(() => Promise.resolve(successResponse('from-fallback')));
    const factory = vi.fn(() => fakeAdapter('claude-opus-4-7', fallbackComplete));
    const cache = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    const wrapped = withModelNotFoundFallback(inner, { cache, adapterFactory: factory });
    const r = await wrapped.complete(dummyRequest);
    expect(r.ok).toBe(true);
    expect(factory).toHaveBeenCalledWith('claude-opus-4-7');
    expect(fallbackComplete).toHaveBeenCalledTimes(1);
  });

  it('returns the second error if the fallback adapter also fails', async () => {
    const inner = fakeAdapter('claude-opus-4-6', () =>
      Promise.resolve(err(new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })))
    );
    const factory = (): IModelAdapter =>
      fakeAdapter('claude-opus-4-7', () =>
        Promise.resolve(err(new ModelError('boom', { code: ErrorCode.MODEL_RATE_LIMITED })))
      );
    const cache = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    const wrapped = withModelNotFoundFallback(inner, { cache, adapterFactory: factory });
    const r = await wrapped.complete(dummyRequest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ErrorCode.MODEL_RATE_LIMITED);
      expect(r.error.message).toContain('Fallback claude-opus-4-7');
    }
  });

  it('surfaces the original error when no fallback can be found', async () => {
    const inner = fakeAdapter('claude-opus-4-6', () =>
      Promise.resolve(err(new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })))
    );
    const cache = new AvailableModelsCache({
      sources: [{ name: 'anthropic', listModels: () => Promise.resolve([]) }],
    });
    const wrapped = withModelNotFoundFallback(inner, { cache });
    const r = await wrapped.complete(dummyRequest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('404');
  });

  it('falls back across vendors only as a last resort (same family preferred)', async () => {
    const inner = fakeAdapter('claude-opus-4-6', () =>
      Promise.resolve(err(new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })))
    );
    const cache = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () =>
            Promise.resolve([
              { id: 'claude-haiku-3.5' }, // same vendor, different family
              { id: 'claude-opus-4-7' }, // same family — should win
            ]),
        },
      ],
    });
    const wrapped = withModelNotFoundFallback(inner, { cache });
    const r = await wrapped.complete(dummyRequest);
    if (r.ok) throw new Error('expected error');
    expect(r.error.message).toContain('claude-opus-4-7');
  });

  it('invokes onRetirement with retired + fallback ids', async () => {
    const inner = fakeAdapter('claude-opus-4-6', () =>
      Promise.resolve(err(new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })))
    );
    const cache = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    const onRetirement = vi.fn();
    const wrapped = withModelNotFoundFallback(inner, { cache, onRetirement });
    await wrapped.complete(dummyRequest);
    expect(onRetirement).toHaveBeenCalledWith(
      expect.objectContaining({
        retiredModelId: 'claude-opus-4-6',
        fallbackModelId: 'claude-opus-4-7',
      })
    );
  });
});

// ============================================================================
// Singleton default cache (#2549)
// ============================================================================

describe('default AvailableModelsCache singleton (#2549)', () => {
  afterEach(() => {
    // Reset the default so test order is irrelevant.
    setDefaultAvailableModelsCache(null);
  });

  it('returns the same instance on repeated calls', () => {
    const a = getDefaultAvailableModelsCache();
    const b = getDefaultAvailableModelsCache();
    expect(a).toBe(b);
  });

  it('honours setDefaultAvailableModelsCache for test injection', () => {
    const custom = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    setDefaultAvailableModelsCache(custom);
    expect(getDefaultAvailableModelsCache()).toBe(custom);
  });

  it('falls back to the default cache when fallback options omit `cache`', async () => {
    const custom = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    setDefaultAvailableModelsCache(custom);

    const inner = fakeAdapter('claude-opus-4-6', () =>
      Promise.resolve(err(new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })))
    );
    const wrapped = withModelNotFoundFallback(inner); // no cache passed
    const r = await wrapped.complete(dummyRequest);
    if (r.ok) throw new Error('expected error');
    expect(r.error.message).toContain('claude-opus-4-7');
  });
});

// ============================================================================
// wrapResilientWithFallback (#2549)
// ============================================================================

function fakeResilient(
  modelId: string,
  complete: (req: CompletionRequest) => Promise<Result<CompletionResponse, ModelError>>
): ResilientLike {
  const getHealth = vi.fn(() => ({ status: 'ok' }));
  const refresh = vi.fn(() => Promise.resolve());
  const setPreferredCli = vi.fn();
  const onFailover = vi.fn(() => () => undefined);
  const dispose = vi.fn();
  return {
    providerId: 'anthropic',
    modelId,
    capabilities: [],
    complete,
    stream: (): AsyncIterable<never> => {
      throw new Error('not implemented');
    },
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ok(undefined),
    getHealth,
    refresh,
    setPreferredCli,
    onFailover,
    dispose,
  };
}

describe('wrapResilientWithFallback (#2549)', () => {
  it('preserves the resilient health/lifecycle methods on the wrapped adapter', () => {
    const inner = fakeResilient('claude-opus-4-7', () => Promise.resolve(successResponse()));
    const cache = new AvailableModelsCache({ sources: [] });
    const wrapped = wrapResilientWithFallback(inner, { cache });

    expect(typeof wrapped.getHealth).toBe('function');
    expect(typeof wrapped.refresh).toBe('function');
    expect(typeof wrapped.setPreferredCli).toBe('function');
    expect(typeof wrapped.onFailover).toBe('function');
    expect(typeof wrapped.dispose).toBe('function');

    // The wrapped methods forward to the inner adapter.
    wrapped.dispose();
    expect((inner.dispose as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    wrapped.setPreferredCli('claude');
    expect((inner.setPreferredCli as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('still applies the MODEL_NOT_FOUND retry path through complete()', async () => {
    const inner = fakeResilient('claude-opus-4-6', () =>
      Promise.resolve(err(new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })))
    );
    const cache = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    const wrapped = wrapResilientWithFallback(inner, { cache });
    const r = await wrapped.complete(dummyRequest);
    if (r.ok) throw new Error('expected error');
    expect(r.error.message).toContain('claude-opus-4-7');
  });
});

// ============================================================================
// Streaming retry (#2550)
// ============================================================================

import type { StreamChunk } from '../core/index.js';

/** Helper: collect all chunks from an AsyncIterable. */
async function collectStream(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of stream) {
    out.push(chunk);
  }
  return out;
}

/** Fake adapter that yields N text-delta chunks then optionally throws. */
function streamingFakeAdapter(
  modelId: string,
  chunkTexts: readonly string[],
  throwAfterAll: ModelError | null = null
): IModelAdapter {
  return {
    providerId: 'anthropic',
    modelId,
    capabilities: [],
    complete: () => Promise.resolve(successResponse()),
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ok(undefined),
    // eslint-disable-next-line @typescript-eslint/require-await
    stream: async function* () {
      for (let i = 0; i < chunkTexts.length; i++) {
        const text = chunkTexts[i] ?? '';
        const chunk: StreamChunk = {
          type: 'content_block_delta',
          index: i,
          delta: { type: 'text_delta', text },
        };
        yield chunk;
      }
      if (throwAfterAll !== null) {
        throw throwAfterAll;
      }
    },
  };
}

describe('withModelNotFoundFallback streaming retry (#2550)', () => {
  it('passes through a successful stream unchanged', async () => {
    const inner = streamingFakeAdapter('claude-opus-4-7', ['a', 'b', 'c']);
    const cache = new AvailableModelsCache({ sources: [] });
    const wrapped = withModelNotFoundFallback(inner, { cache });
    const chunks = await collectStream(wrapped.stream(dummyRequest));
    expect(chunks).toHaveLength(3);
  });

  it('passes through non-MODEL_NOT_FOUND throws unchanged', async () => {
    const inner = streamingFakeAdapter(
      'claude-opus-4-7',
      [],
      new ModelError('boom', { code: ErrorCode.MODEL_RATE_LIMITED })
    );
    const cache = new AvailableModelsCache({ sources: [] });
    const wrapped = withModelNotFoundFallback(inner, { cache });
    await expect(collectStream(wrapped.stream(dummyRequest))).rejects.toThrow('boom');
  });

  it('on MODEL_NOT_FOUND throw, restarts from the fallback adapter (restart-from-zero)', async () => {
    const inner = streamingFakeAdapter(
      'claude-opus-4-6',
      ['retired-1'],
      new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })
    );
    const fallbackAdapterImpl = streamingFakeAdapter('claude-opus-4-7', ['new-1', 'new-2']);
    const cache = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    const wrapped = withModelNotFoundFallback(inner, {
      cache,
      adapterFactory: () => fallbackAdapterImpl,
    });
    const chunks = await collectStream(wrapped.stream(dummyRequest));
    // Consumer sees the retired adapter's 1 chunk AND the fallback's 2
    // chunks — restart-from-zero replays the fallback from its start
    // but does NOT drop chunks already yielded.
    expect(chunks).toHaveLength(3);
    expect(
      chunks
        .filter(
          (c): c is Extract<StreamChunk, { type: 'content_block_delta' }> =>
            c.type === 'content_block_delta'
        )
        .map((c) => c.delta.text)
    ).toEqual(['retired-1', 'new-1', 'new-2']);
  });

  it('re-throws original error enriched with fallback id when no adapterFactory is wired', async () => {
    const inner = streamingFakeAdapter(
      'claude-opus-4-6',
      [],
      new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })
    );
    const cache = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    const wrapped = withModelNotFoundFallback(inner, { cache });
    await expect(collectStream(wrapped.stream(dummyRequest))).rejects.toThrow(
      /suggested fallback: claude-opus-4-7/
    );
  });

  it('invokes onRetirement when stream falls back', async () => {
    const inner = streamingFakeAdapter(
      'claude-opus-4-6',
      [],
      new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })
    );
    const fallbackAdapterImpl = streamingFakeAdapter('claude-opus-4-7', ['x']);
    const cache = new AvailableModelsCache({
      sources: [
        {
          name: 'anthropic',
          providerHint: 'anthropic',
          listModels: () => Promise.resolve([{ id: 'claude-opus-4-7' }]),
        },
      ],
    });
    const onRetirement = vi.fn();
    const wrapped = withModelNotFoundFallback(inner, {
      cache,
      adapterFactory: () => fallbackAdapterImpl,
      onRetirement,
    });
    await collectStream(wrapped.stream(dummyRequest));
    expect(onRetirement).toHaveBeenCalledWith(
      expect.objectContaining({
        retiredModelId: 'claude-opus-4-6',
        fallbackModelId: 'claude-opus-4-7',
      })
    );
  });

  it('re-throws original when no fallback model is available', async () => {
    const inner = streamingFakeAdapter(
      'claude-opus-4-6',
      [],
      new ModelError('404', { code: ErrorCode.MODEL_NOT_FOUND })
    );
    // Empty cache → no fallback can be picked → original error propagates.
    const cache = new AvailableModelsCache({ sources: [] });
    const wrapped = withModelNotFoundFallback(inner, {
      cache,
      adapterFactory: () => streamingFakeAdapter('never', []),
    });
    await expect(collectStream(wrapped.stream(dummyRequest))).rejects.toThrow('404');
  });
});
