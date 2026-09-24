/**
 * One failure, one breaker record (#6712).
 *
 * In production (`getGlobalRegistry()`), a `ResilientAdapter` and every CLI
 * adapter's retry loop write to the SAME registry,
 * `getDefaultCliCircuitBreakerRegistry()`, under the SAME key, the CLI name.
 * The retry loop already recorded each CLI failure (with the CliError's
 * category), and `ResilientAdapter.recordBreakerFailure` recorded it a second
 * time, so a breaker with threshold N opened after about N/2 real timeouts.
 *
 * Only `createAutoAdapter` is replaced, so the selection it returns is built
 * from the real bridge (`createCliToModelAdapter`) over a real
 * `BaseCliAdapter` subclass, and the breaker read is the shared default one.
 *
 * @module adapters/resilient-adapter-breaker-count.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./auto-adapter.js', () => ({ createAutoAdapter: vi.fn() }));

import type { CliName, CliTransport, CliTask, ModelInfo } from '../cli-adapters/types.js';
import type { CliResponse, CliError, ResolvedExecutionOptions } from '../cli-adapters/types.js';
import type { CompletionRequest, CompletionResponse, IModelAdapter } from '../core/types/model.js';
import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import { ModelError, ErrorCode } from '../core/errors.js';
import { BaseCliAdapter } from '../cli-adapters/base-adapter.js';
import { createCliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import { getDefaultCliCircuitBreakerRegistry } from '../cli-adapters/cli-circuit-breaker.js';
import { createAutoAdapter } from './auto-adapter.js';
import { ResilientAdapter } from './resilient-adapter.js';

/** A CLI adapter that fails every task with the error the test sets. */
class FailingCliAdapter extends BaseCliAdapter {
  readonly name: CliName = 'claude';
  readonly transport: CliTransport = 'subprocess';
  failure: CliError = {
    code: 'TIMEOUT',
    message: 'claude timed out after 60000ms',
    cli: 'claude',
    retryable: true,
  };

  /** One attempt, as a subprocess adapter with its own transient retry has. */
  protected override shouldOuterRetry(): boolean {
    return false;
  }

  executeTask(
    _task: CliTask,
    _options: ResolvedExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    return Promise.resolve(err(this.failure));
  }

  getModelInfo(): ModelInfo {
    return {
      id: 'failing',
      name: 'Failing',
      contextWindow: 1000,
      maxOutput: 100,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    };
  }

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

/** A direct-API adapter (no inner breaker recorder) that fails every call. */
function failingApiAdapter(error: ModelError): IModelAdapter {
  return {
    providerId: 'anthropic',
    modelId: 'claude-sonnet',
    capabilities: ['completion'],
    complete: (): Promise<Result<CompletionResponse, ModelError>> => Promise.resolve(err(error)),
    stream: async function* () {
      await Promise.resolve();
      throw error;
    },
    countTokens: () => Promise.resolve(0),
    validateConfig: () => ok(undefined),
  };
}

const REQUEST: CompletionRequest = { messages: [{ role: 'user', content: 'hi' }] };

function failureCount(name: CliName): number {
  return getDefaultCliCircuitBreakerRegistry().getBreaker(name).getSnapshot().failureCount;
}

describe('ResilientAdapter breaker count over the production registry (#6712)', () => {
  beforeEach(() => {
    getDefaultCliCircuitBreakerRegistry().getBreaker('claude').reset();
  });

  it('records one CLI timeout ONCE on the CLI breaker', async () => {
    const cli = new FailingCliAdapter();
    vi.mocked(createAutoAdapter).mockResolvedValue({
      adapter: createCliToModelAdapter(cli),
      source: 'cli',
      name: 'claude',
      reason: 'test',
    });
    const adapter = new ResilientAdapter({
      circuitBreakerRegistry: getDefaultCliCircuitBreakerRegistry(),
    });

    const result = await adapter.complete(REQUEST);

    expect(result.ok).toBe(false);
    expect(failureCount('claude')).toBe(1);
    adapter.dispose();
  });

  it('still records a direct-API failure once (no inner recorder)', async () => {
    vi.mocked(createAutoAdapter).mockResolvedValue({
      adapter: failingApiAdapter(
        new ModelError('request timed out', { code: ErrorCode.MODEL_TIMEOUT })
      ),
      source: 'api',
      name: 'claude',
      reason: 'test',
    });
    const adapter = new ResilientAdapter({
      circuitBreakerRegistry: getDefaultCliCircuitBreakerRegistry(),
    });

    const result = await adapter.complete(REQUEST);

    expect(result.ok).toBe(false);
    expect(failureCount('claude')).toBe(1);
    adapter.dispose();
  });
});
