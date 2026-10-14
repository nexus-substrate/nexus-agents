/** Lazy selected-model metadata is independent of completion/served-model evidence. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IModelAdapter } from '../core/types/model.js';
import { UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';
import { warmModelMetadata } from './model-metadata.js';

function fixture(model = UNRESOLVED_MODEL_ID): IModelAdapter {
  return {
    providerId: 'fixture',
    modelId: model,
    capabilities: [],
    countTokens: vi.fn<IModelAdapter['countTokens']>().mockResolvedValue(0),
    complete: vi.fn<IModelAdapter['complete']>(),
    stream: vi.fn<IModelAdapter['stream']>(),
    validateConfig: () => ({ ok: true, value: undefined }),
  };
}

describe('warmModelMetadata (#7411, #7413)', () => {
  afterEach(() => vi.useRealTimers());
  it('warms each distinct unresolved adapter once without completing a prompt', async () => {
    const adapter = fixture();
    await warmModelMetadata([adapter, adapter]);
    expect(adapter.countTokens).toHaveBeenCalledExactlyOnceWith('');
    expect(adapter.complete).not.toHaveBeenCalled();
    // The helper does not invent metadata when detection did not supply it.
    expect(adapter.modelId).toBe(UNRESOLVED_MODEL_ID);
  });
  it('keeps known metadata unchanged without initialization or completion', async () => {
    const adapter = fixture('selected-model');
    await warmModelMetadata([adapter]);
    expect(adapter.countTokens).not.toHaveBeenCalled();
    expect(adapter.complete).not.toHaveBeenCalled();
    expect(adapter.modelId).toBe('selected-model');
  });
  it('allows an empty iterable without claiming any capacity or health', async () => {
    await expect(warmModelMetadata([])).resolves.toBeUndefined();
  });
  it('surfaces token-metadata initialization failure before completion', async () => {
    const adapter = fixture();
    vi.mocked(adapter.countTokens).mockRejectedValue(new Error('fixture detection failed'));
    await expect(warmModelMetadata([adapter])).rejects.toThrow('fixture detection failed');
    expect(adapter.complete).not.toHaveBeenCalled();
  });
  it('bounds a stalled detector with the canonical spawn timeout', async () => {
    vi.useFakeTimers();
    const adapter = fixture();
    vi.mocked(adapter.countTokens).mockImplementation(() => new Promise(() => {}));
    const pending = expect(warmModelMetadata([adapter])).rejects.toThrow(/metadata.*timed out/i);
    await vi.advanceTimersByTimeAsync(CLI_SUBPROCESS_TIMEOUTS.spawnMs);
    await pending;
    expect(adapter.complete).not.toHaveBeenCalled();
  });
  it('does not start metadata work after cancellation', async () => {
    const adapter = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(warmModelMetadata([adapter], controller.signal)).rejects.toThrow(/abort/i);
    expect(adapter.countTokens).not.toHaveBeenCalled();
    expect(adapter.complete).not.toHaveBeenCalled();
  });
  it('stops awaiting metadata when cancellation arrives during detection', async () => {
    const adapter = fixture();
    vi.mocked(adapter.countTokens).mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = expect(warmModelMetadata([adapter], controller.signal)).rejects.toThrow(
      /abort/i
    );
    controller.abort();
    await pending;
    expect(adapter.complete).not.toHaveBeenCalled();
  });
});
