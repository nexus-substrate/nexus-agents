/** Mode evidence survives actual selected-adapter views; queries perform no completion. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionAccessMode, IModelAdapter } from '../core/types/model.js';
import { ok, createLogger } from '../core/index.js';
import type { IResilientAdapter } from './resilient-adapter-types.js';
import {
  createGatewaySlotAdapter,
  setGatewaySlotCatalog,
  _resetGatewaySlotCatalog,
} from './gateway-family-slots.js';
import { withGatewayUsageRecording } from './gateway-usage-recording.js';
import { ModelBoundAdapter } from './model-bound-adapter.js';
import { createGatewayArmAdapter } from './gateway-arm-adapter.js';
import { CircuitBreakerRegistry } from '../cli-adapters/circuit-breaker.js';
import { ResilientAdapter } from './resilient-adapter.js';
import { createAutoAdapter } from './auto-adapter.js';
import { ClaudeAdapter } from './claude-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { OllamaAdapter } from './ollama-adapter.js';
import { SdkAdapter } from './sdk/sdk-adapter.js';
import { queryModelAccessMode } from './access-mode-support.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';
import { BaseAdapter } from './base-adapter.js';
vi.mock('./auto-adapter.js', () => ({ createAutoAdapter: vi.fn() }));
vi.mock('./gateway-rediscovery.js', () => ({
  ensureGatewayDiscovered: () => Promise.resolve(undefined),
  gatewayDiscoveryGeneration: () => 0,
}));
type QueryAdapter = IModelAdapter & {
  supportsAccessMode?: (
    mode: ExecutionAccessMode,
    signal?: AbortSignal
  ) => Promise<boolean | undefined>;
};
const logger = createLogger({ component: 'access-support-test' });
function inner(value: boolean | undefined): QueryAdapter {
  return {
    providerId: 'TEST-api',
    modelId: 'm-0',
    capabilities: [],
    complete: vi.fn(),
    stream: vi.fn(),
    countTokens: () => Promise.resolve(1),
    validateConfig: () => ok(undefined),
    supportsAccessMode: vi.fn(function (this: IModelAdapter) {
      expect(this.providerId).toBe('TEST-api');
      return Promise.resolve(value);
    }),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  _resetGatewaySlotCatalog();
});
const wrappers = {
  family: (model: IModelAdapter) => createGatewaySlotAdapter('gemini', model),
  usage: (model: IModelAdapter) => withGatewayUsageRecording(model, 'api:TEST'),
  bound: (model: IModelAdapter) => new ModelBoundAdapter(model as IResilientAdapter, 'TEST-bound'),
  arm: (model: IModelAdapter) => {
    vi.stubEnv('NEXUS_CUSTOM_MODEL', 'm-0');
    setGatewaySlotCatalog([model]);
    return createGatewayArmAdapter('api:TEST', [model], {
      logger,
      circuitBreakerRegistry: new CircuitBreakerRegistry(),
    });
  },
};
describe('actual wrapper forwarding (#7434)', () => {
  for (const [name, wrap] of Object.entries(wrappers)) {
    it.each([true, false, undefined])(
      `${name} preserves explicit support %s and receiver`,
      async (value) => {
        const model = inner(value);
        const wrapped: QueryAdapter = wrap(model);
        const signal = new AbortController().signal;
        expect(await wrapped.supportsAccessMode?.('read-only-analysis', signal)).toBe(value);
        expect(model.supportsAccessMode).toHaveBeenCalledWith('read-only-analysis', signal);
        expect(model.complete).not.toHaveBeenCalled();
        (wrapped as Partial<IResilientAdapter>).dispose?.();
      }
    );
    it(`${name} preserves absent query as unknown`, async () => {
      const model = inner(true);
      delete model.supportsAccessMode;
      expect(
        await (wrap(model) as QueryAdapter).supportsAccessMode?.('read-only-analysis')
      ).toBeUndefined();
      expect(model.complete).not.toHaveBeenCalled();
    });
  }
});
describe('resilient selected-transport query (#7434)', () => {
  it.each([true, false, undefined])(
    'resolves and forwards %s without completion',
    async (value) => {
      const model = inner(value);
      vi.mocked(createAutoAdapter).mockResolvedValue({
        adapter: model,
        source: 'api',
        name: 'TEST',
        reason: 'fixture',
      });
      const proxy: QueryAdapter = new ResilientAdapter();
      expect(await proxy.supportsAccessMode?.('read-only-analysis')).toBe(value);
      expect(model.supportsAccessMode).toHaveBeenCalledOnce();
      expect(model.complete).not.toHaveBeenCalled();
    }
  );
  it('re-reads the actual selection after refresh', async () => {
    const a = inner(true),
      b = inner(false);
    vi.mocked(createAutoAdapter)
      .mockResolvedValueOnce({ adapter: a, source: 'api', name: 'TEST', reason: 'a' })
      .mockResolvedValueOnce({ adapter: b, source: 'api', name: 'TEST', reason: 'b' });
    const proxy = new ResilientAdapter();
    const view: QueryAdapter = proxy;
    expect(await view.supportsAccessMode?.('read-only-analysis')).toBe(true);
    await proxy.refresh();
    expect(await view.supportsAccessMode?.('read-only-analysis')).toBe(false);
    expect(a.complete).not.toHaveBeenCalled();
    expect(b.complete).not.toHaveBeenCalled();
  });
  it('stops awaiting cancelled acquisition; no completion or late support claim', async () => {
    vi.mocked(createAutoAdapter).mockReturnValue(new Promise(() => undefined));
    const proxy: QueryAdapter = new ResilientAdapter();
    const controller = new AbortController();
    const pending = proxy.supportsAccessMode?.('read-only-analysis', controller.signal);
    controller.abort('TEST cancel');
    await expect(pending).rejects.toThrow(/abort/i);
  });
});
// A concrete public subclass may truthfully deny a mode without narrowing the interface.
const unsupportedQuery: NonNullable<IModelAdapter['supportsAccessMode']> = () =>
  Promise.resolve(false);
class UnsupportedClaude extends ClaudeAdapter {
  override supportsAccessMode = unsupportedQuery;
}
class UnsupportedOpenAI extends OpenAIAdapter {
  override supportsAccessMode = unsupportedQuery;
}
class UnsupportedGemini extends GeminiAdapter {
  override supportsAccessMode = unsupportedQuery;
}
class UnsupportedOllama extends OllamaAdapter {
  override supportsAccessMode = unsupportedQuery;
}
class UnsupportedSdk extends SdkAdapter {
  override supportsAccessMode = unsupportedQuery;
}
describe('only concrete text-only API adapters declare support', () => {
  for (const cls of [ClaudeAdapter, OpenAIAdapter, GeminiAdapter, OllamaAdapter, SdkAdapter]) {
    it(`${cls.name} explicitly supports content-only generation without SDK execution`, async () => {
      const api = Object.create(cls.prototype) as InstanceType<typeof cls>;
      expect(await api.supportsAccessMode('read-only-analysis', new AbortController().signal)).toBe(
        true
      );
      expect(await api.supportsAccessMode('workspace-edit', new AbortController().signal)).toBe(
        true
      );
    });
    it(`${cls.name} does not grant unknown subclasses inherited host access evidence`, async () => {
      const prototype = Object.create(cls.prototype) as object;
      const derived = Object.create(prototype) as QueryAdapter;
      Object.defineProperty(derived, 'constructor', { value: function TestHostAdapter() {} });
      expect(await derived.supportsAccessMode?.('read-only-analysis')).toBeUndefined();
    });
  }
  for (const cls of [
    UnsupportedClaude,
    UnsupportedOpenAI,
    UnsupportedGemini,
    UnsupportedOllama,
    UnsupportedSdk,
  ]) {
    it(`${cls.name} may explicitly deny a mode through the public subclass contract`, async () => {
      const api = Object.create(cls.prototype) as InstanceType<typeof cls>;
      // Class fields run in constructors; bind the real override without constructing provider SDKs.
      api.supportsAccessMode = unsupportedQuery;
      expect(await api.supportsAccessMode('read-only-analysis')).toBe(false);
    });
  }
  it('BaseAdapter does not grant arbitrary subclasses support', () => {
    expect(Reflect.get(BaseAdapter.prototype, 'supportsAccessMode')).toBeUndefined();
  });
});

describe('bounded query evidence', () => {
  it('keeps deadline failure unknown without completing or claiming measured false', async () => {
    vi.useFakeTimers();
    try {
      const model = inner(true);
      vi.mocked(model.supportsAccessMode!).mockReturnValue(new Promise(() => undefined));
      const pending = queryModelAccessMode(model, 'read-only-analysis');
      await vi.advanceTimersByTimeAsync(CLI_SUBPROCESS_TIMEOUTS.spawnMs);
      expect(await pending).toBeUndefined();
      expect(model.complete).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not accept malformed third-party query values as support', async () => {
    const model = inner(true);
    vi.mocked(model.supportsAccessMode!).mockResolvedValue('true' as unknown as boolean);
    expect(await queryModelAccessMode(model, 'read-only-analysis')).toBeUndefined();
    expect(model.complete).not.toHaveBeenCalled();
  });
});
