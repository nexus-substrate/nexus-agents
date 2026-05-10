/**
 * Tests for `withModelNotFoundFallback` (#2540 PR 8).
 */
import { describe, it, expect, vi } from 'vitest';
import { withModelNotFoundFallback } from './model-not-found-fallback.js';
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
import { AvailableModelsCache } from '../config/available-models-cache.js';

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
