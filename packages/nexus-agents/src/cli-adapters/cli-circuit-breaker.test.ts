/**
 * nexus-agents/cli-adapters - CLI Circuit Breaker Integration Tests
 *
 * Unit tests for circuit breaker integration with CLI adapters.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { ICliAdapter, CliName, CliTask, CliResponse, CliError } from './types.js';
import {
  CliCircuitBreakerIntegration,
  createCliCircuitBreakerIntegration,
  getCliCircuitBreakerSnapshot,
  getDefaultCliCircuitBreakerRegistry,
  type CliCircuitBreakerConfig,
} from './cli-circuit-breaker.js';
import { CircuitError, CircuitErrorCode, type CircuitStateChangeEvent } from './circuit-breaker.js';
import { createCallerAbortCliError, createCallerInputCliError } from './cli-error-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockAdapter(
  name: CliName,
  behavior: 'success' | 'error' | 'circuit-error' = 'success'
) {
  const execute = vi.fn<(task: CliTask) => Promise<Result<CliResponse, CliError>>>();

  if (behavior === 'success') {
    execute.mockImplementation(() =>
      Promise.resolve(
        ok({
          text: `Response from ${name}`,
          usage: { inputTokens: 10, outputTokens: 20 },
        })
      )
    );
  } else if (behavior === 'error') {
    execute.mockImplementation(() =>
      Promise.resolve(
        err({
          code: 'EXECUTION_ERROR',
          message: `Error from ${name}`,
          cli: name,
          retryable: true,
        })
      )
    );
  } else {
    execute.mockImplementation(() =>
      Promise.resolve(
        err({
          code: 'TIMEOUT',
          message: `Timeout from ${name}`,
          cli: name,
          retryable: true,
        })
      )
    );
  }

  return {
    name,
    execute,
  } as unknown as ICliAdapter;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createTask(content = 'test task') {
  return {
    prompt: content,
    model: 'claude-sonnet-4',
    maxTokens: 1000,
  } as unknown as CliTask;
}

function createAdapterReturningError(name: CliName, error: CliError): ICliAdapter {
  return {
    name,
    execute: vi.fn<() => Promise<Result<CliResponse, CliError>>>().mockResolvedValue(err(error)),
  } as unknown as ICliAdapter;
}

// ============================================================================
// Tests
// ============================================================================

describe('CliCircuitBreakerIntegration', () => {
  let adapters: ICliAdapter[];
  let integration: CliCircuitBreakerIntegration;

  beforeEach(() => {
    vi.useFakeTimers();
    getDefaultCliCircuitBreakerRegistry().resetAll();
    adapters = [
      createMockAdapter('claude', 'success'),
      createMockAdapter('gemini', 'success'),
      createMockAdapter('codex', 'success'),
    ];
    integration = new CliCircuitBreakerIntegration(adapters);
  });

  afterEach(() => {
    getDefaultCliCircuitBreakerRegistry().resetAll();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with all adapters and config', () => {
      const health = integration.getHealthStatus();
      expect(health.clis).toHaveLength(3);
      expect(health.systemHealthy).toBe(true);
      expect(health.healthyCount).toBe(3);

      const snapshots = integration.getCircuitSnapshots();
      expect(snapshots.size).toBe(3);
      expect(snapshots.has('claude')).toBe(true);
    });

    it('should apply per-CLI config and custom logger', () => {
      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn(),
        setLevel: vi.fn(),
      };
      const config: CliCircuitBreakerConfig = {
        perCliConfig: { claude: { failureThreshold: 3 } },
      };
      const custom = new CliCircuitBreakerIntegration(adapters, config, mockLogger);
      const snapshot = custom.getCircuitSnapshots().get('claude');
      expect(snapshot?.config.failureThreshold).toBe(3);
    });
  });

  describe('execute - success path', () => {
    it('should execute successfully and track usage', async () => {
      const task = createTask();
      const result = await integration.execute(adapters[0]!, task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.response.text).toBe('Response from claude');
        expect(result.value.executedBy).toBe('claude');
        expect(result.value.usedFallback).toBe(false);
        expect(result.value.response.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
      }
    });
  });

  describe('execute - error handling', () => {
    it('should return CLI error without fallback for non-circuit errors', async () => {
      const failingAdapter = createMockAdapter('claude', 'error');
      const result = await integration.execute(failingAdapter, createTask());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toHaveProperty('code', 'EXECUTION_ERROR');
        expect(result.error).toHaveProperty('cli', 'claude');
      }

      // Even with fallback enabled, non-circuit errors don't trigger fallback
      const config: CliCircuitBreakerConfig = { enableFallback: true };
      const custom = new CliCircuitBreakerIntegration(adapters, config);
      const result2 = await custom.execute(failingAdapter, createTask());
      expect(result2.ok).toBe(false);
    });

    it.each([
      ['OpenRouter quota exhaustion', 'OpenRouter error: Key limit exceeded'],
      ['HTTP 5xx with no response body', 'HTTP 503 with no response body'],
    ])('records %s as a breaker failure', async (_label, message) => {
      const quotaAdapter = createAdapterReturningError('opencode', {
        code: 'EXECUTION_ERROR',
        message,
        cli: 'opencode',
        retryable: true,
      });
      const custom = new CliCircuitBreakerIntegration([quotaAdapter], {
        perCliConfig: { opencode: { failureThreshold: 1 } },
      });

      const result = await custom.execute(quotaAdapter, createTask());

      expect(result.ok).toBe(false);
      expect(custom.getCircuitSnapshots().get('opencode')?.state).toBe('open');
    });

    it('exposes default integration failures through the shared breaker snapshot', async () => {
      const quotaAdapter = createAdapterReturningError('opencode', {
        code: 'EXECUTION_ERROR',
        message: 'OpenRouter error: Key limit exceeded',
        cli: 'opencode',
        retryable: true,
      });
      const defaultIntegration = new CliCircuitBreakerIntegration([quotaAdapter]);

      for (let i = 0; i < 5; i++) {
        await defaultIntegration.execute(quotaAdapter, createTask());
      }

      expect(getCliCircuitBreakerSnapshot('opencode')?.state).toBe('open');
    });

    it('does not count caller-input CLI errors against the breaker (#6613)', async () => {
      const callerInputError = createCallerInputCliError(
        'unknown model requested: unsupported-model',
        'opencode'
      );
      const invalidInputAdapter = createAdapterReturningError('opencode', callerInputError);
      const custom = new CliCircuitBreakerIntegration([invalidInputAdapter], {
        perCliConfig: { opencode: { failureThreshold: 2 } },
      });

      for (let i = 0; i < 5; i++) {
        const result = await custom.execute(invalidInputAdapter, createTask());
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe(callerInputError);
        }
      }

      const snapshot = custom.getCircuitSnapshots().get('opencode');
      expect(snapshot?.state).toBe('closed');
      expect(snapshot?.failureCount).toBe(0);
    });

    it('does not count a caller-cancelled CLI call against the breaker (#6691)', async () => {
      const cancelled = createCallerAbortCliError(
        'cancelled via cancel_job',
        'Aborted by caller signal',
        'opencode'
      );
      const cancelledAdapter = createAdapterReturningError('opencode', cancelled);
      const custom = new CliCircuitBreakerIntegration([cancelledAdapter], {
        perCliConfig: { opencode: { failureThreshold: 2 } },
      });

      for (let i = 0; i < 5; i++) {
        const result = await custom.execute(cancelledAdapter, createTask());
        expect(result.ok).toBe(false);
      }

      const snapshot = custom.getCircuitSnapshots().get('opencode');
      expect(snapshot?.state).toBe('closed');
      expect(snapshot?.failureCount).toBe(0);
    });

    it('does not double-count standard CLI failures (#6613)', async () => {
      const failingAdapter = createMockAdapter('claude', 'circuit-error');
      const custom = new CliCircuitBreakerIntegration([failingAdapter], {
        perCliConfig: { claude: { failureThreshold: 2 } },
      });

      // 1 failure should increment failureCount to 1, keeping circuit closed
      await custom.execute(failingAdapter, createTask());
      expect(custom.getCircuitSnapshots().get('claude')?.failureCount).toBe(1);
      expect(custom.getCircuitSnapshots().get('claude')?.state).toBe('closed');

      // 2nd failure reaches threshold 2, opening the circuit
      await custom.execute(failingAdapter, createTask());
      expect(custom.getCircuitSnapshots().get('claude')?.failureCount).toBe(2);
      expect(custom.getCircuitSnapshots().get('claude')?.state).toBe('open');
    });

    it('releases half-open probe budget on caller-input error (#6613)', async () => {
      const callerInputError = createCallerInputCliError('invalid model', 'claude');
      let returnCallerInput = false;
      const alternatingAdapter: ICliAdapter = {
        name: 'claude',
        execute: vi.fn().mockImplementation(() => {
          if (returnCallerInput) {
            return Promise.resolve(err(callerInputError));
          }
          return Promise.resolve(
            err({ code: 'TIMEOUT', message: 'timeout', cli: 'claude', retryable: true })
          );
        }),
      } as unknown as ICliAdapter;

      const custom = new CliCircuitBreakerIntegration([alternatingAdapter], {
        perCliConfig: {
          claude: {
            failureThreshold: 1,
            resetTimeoutMs: 1000,
            halfOpenMaxRequests: 1,
            halfOpenSuccessThreshold: 1,
          },
        },
      });

      // 1 timeout failure opens the circuit
      await custom.execute(alternatingAdapter, createTask());
      expect(custom.getCircuitSnapshots().get('claude')?.state).toBe('open');

      // Advance past reset timeout into half-open
      vi.advanceTimersByTime(1001);

      // In half-open state, a caller-input error occurs
      returnCallerInput = true;
      const callerResult = await custom.execute(alternatingAdapter, createTask());
      expect(callerResult.ok).toBe(false);

      // The circuit should still be half-open and probe request should not be exhausted
      expect(custom.getCircuitSnapshots().get('claude')?.state).toBe('half-open');
      expect(custom.getCircuitSnapshots().get('claude')?.halfOpenRequests).toBe(0);
    });
  });

  describe('execute - fallback behavior', () => {
    it('should fallback when circuit opens', async () => {
      const config: CliCircuitBreakerConfig = {
        enableFallback: true,
        fallbackChain: ['claude', 'gemini', 'codex'],
        perCliConfig: {
          claude: { failureThreshold: 2 },
        },
      };
      const custom = new CliCircuitBreakerIntegration(adapters, config);
      const failingAdapter = createMockAdapter('claude', 'circuit-error');
      const task = createTask();

      // Open the circuit
      await custom.execute(failingAdapter, task);
      await custom.execute(failingAdapter, task);

      // Next execution should fallback
      const result = await custom.execute(failingAdapter, task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executedBy).toBe('gemini');
        expect(result.value.usedFallback).toBe(true);
        expect(result.value.fallbackAttempts).toContain('gemini');
      }
    });

    it('should respect maxFallbackAttempts', async () => {
      const config: CliCircuitBreakerConfig = {
        enableFallback: true,
        maxFallbackAttempts: 1,
        fallbackChain: ['claude', 'gemini', 'codex'],
        perCliConfig: {
          claude: { failureThreshold: 1 },
        },
      };
      const failingAdapters = [
        createMockAdapter('claude', 'circuit-error'),
        createMockAdapter('gemini', 'circuit-error'),
        createMockAdapter('codex', 'success'),
      ];
      const custom = new CliCircuitBreakerIntegration(failingAdapters, config);
      const task = createTask();

      // Open claude circuit
      await custom.execute(failingAdapters[0]!, task);

      // Should try gemini but not codex - gemini also fails, returns CliError
      const result = await custom.execute(failingAdapters[0]!, task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // When fallback exhausted, returns last error (CliError from gemini)
        expect(result.error).toHaveProperty('cli');
      }
    });

    it('should skip fallback CLIs with open circuits', async () => {
      const config: CliCircuitBreakerConfig = {
        enableFallback: true,
        fallbackChain: ['claude', 'gemini', 'codex'],
        perCliConfig: {
          claude: { failureThreshold: 1 },
          gemini: { failureThreshold: 1 },
        },
      };
      const failingAdapters = [
        createMockAdapter('claude', 'circuit-error'),
        createMockAdapter('gemini', 'circuit-error'),
        createMockAdapter('codex', 'success'),
      ];
      const custom = new CliCircuitBreakerIntegration(failingAdapters, config);
      const task = createTask();

      // Open claude circuit
      await custom.execute(failingAdapters[0]!, task);

      // Open gemini circuit
      await custom.execute(failingAdapters[1]!, task);

      // Should skip gemini and use codex
      const result = await custom.execute(failingAdapters[0]!, task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executedBy).toBe('codex');
        expect(result.value.fallbackAttempts).not.toContain('gemini');
        expect(result.value.fallbackAttempts).toContain('codex');
      }
    });

    it('should not fallback when disabled', async () => {
      const config: CliCircuitBreakerConfig = {
        enableFallback: false,
        perCliConfig: {
          claude: { failureThreshold: 1 },
        },
      };
      const custom = new CliCircuitBreakerIntegration(adapters, config);
      const failingAdapter = createMockAdapter('claude', 'circuit-error');
      const task = createTask();

      // Open the circuit
      await custom.execute(failingAdapter, task);

      const result = await custom.execute(failingAdapter, task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(CircuitError);
        expect((result.error as CircuitError).circuitErrorCode).toBe(CircuitErrorCode.CIRCUIT_OPEN);
      }
    });
  });

  describe('getHealthStatus', () => {
    it('should report health status with all details', () => {
      const health = integration.getHealthStatus();
      expect(health.systemHealthy).toBe(true);
      expect(health.healthyCount).toBe(3);
      expect(health.clis).toHaveLength(3);
      expect(health.clis.every((cli) => cli.healthy && cli.circuitState === 'closed')).toBe(true);
      expect(health.timestamp).toBeGreaterThan(0);
    });

    it('should track failures and unhealthy circuits', async () => {
      const config: CliCircuitBreakerConfig = {
        perCliConfig: { claude: { failureThreshold: 1 } },
      };
      const custom = new CliCircuitBreakerIntegration(adapters, config);
      const failingAdapter = createMockAdapter('claude', 'circuit-error');
      await custom.execute(failingAdapter, createTask());

      const health = custom.getHealthStatus();
      const claudeStatus = health.clis.find((cli) => cli.name === 'claude');
      expect(claudeStatus?.healthy).toBe(false);
      expect(claudeStatus?.circuitState).toBe('open');
      expect(claudeStatus?.failureCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getCircuitSnapshots', () => {
    it('should return snapshots with circuit details', async () => {
      const snapshots = integration.getCircuitSnapshots();
      expect(snapshots.size).toBe(3);
      expect(snapshots.get('claude')).toBeDefined();

      const config: CliCircuitBreakerConfig = {
        perCliConfig: { claude: { failureThreshold: 10 } },
      };
      const custom = new CliCircuitBreakerIntegration(adapters, config);
      await custom.execute(createMockAdapter('claude', 'circuit-error'), createTask());

      const claudeSnapshot = custom.getCircuitSnapshots().get('claude');
      expect(claudeSnapshot?.state).toBe('closed');
      expect(claudeSnapshot?.failureCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('reset operations', () => {
    it('should reset specific circuit without affecting others', async () => {
      const config: CliCircuitBreakerConfig = {
        perCliConfig: { claude: { failureThreshold: 1 }, gemini: { failureThreshold: 1 } },
      };
      const failingAdapters = [
        createMockAdapter('claude', 'circuit-error'),
        createMockAdapter('gemini', 'circuit-error'),
        createMockAdapter('codex', 'success'),
      ];
      const custom = new CliCircuitBreakerIntegration(failingAdapters, config);

      await custom.execute(failingAdapters[0]!, createTask());
      await custom.execute(failingAdapters[1]!, createTask());

      custom.resetCircuit('claude');

      const health = custom.getHealthStatus();
      expect(health.clis.find((cli) => cli.name === 'claude')?.circuitState).toBe('closed');
      expect(health.clis.find((cli) => cli.name === 'gemini')?.circuitState).toBe('open');
    });

    it('should reset all circuits at once', async () => {
      const config: CliCircuitBreakerConfig = {
        perCliConfig: { claude: { failureThreshold: 1 }, gemini: { failureThreshold: 1 } },
      };
      const failingAdapters = [
        createMockAdapter('claude', 'circuit-error'),
        createMockAdapter('gemini', 'circuit-error'),
      ];
      const custom = new CliCircuitBreakerIntegration(failingAdapters, config);

      await custom.execute(failingAdapters[0]!, createTask());
      await custom.execute(failingAdapters[1]!, createTask());

      custom.resetAllCircuits();

      const health = custom.getHealthStatus();
      expect(health.clis.every((cli) => cli.circuitState === 'closed')).toBe(true);
    });
  });

  describe('addStateChangeListener', () => {
    it('should notify all listeners on state changes', async () => {
      const listener1 = vi.fn<(event: CircuitStateChangeEvent) => void>();
      const listener2 = vi.fn<(event: CircuitStateChangeEvent) => void>();
      const config: CliCircuitBreakerConfig = { perCliConfig: { claude: { failureThreshold: 1 } } };
      const custom = new CliCircuitBreakerIntegration(adapters, config);
      custom.addStateChangeListener(listener1);
      custom.addStateChangeListener(listener2);

      await custom.execute(createMockAdapter('claude', 'circuit-error'), createTask());

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      const event = listener1.mock.calls[0]![0];
      expect(event.cliName).toBe('claude');
      expect(event.previousState).toBe('closed');
      expect(event.newState).toBe('open');
    });
  });

  describe('execute - task-aware fallback', () => {
    it('should use generic chain when no taskCategory is provided', async () => {
      const config: CliCircuitBreakerConfig = {
        enableFallback: true,
        fallbackChain: ['claude', 'gemini', 'codex'],
        perCliConfig: {
          claude: { failureThreshold: 2 },
        },
      };
      const custom = new CliCircuitBreakerIntegration(adapters, config);
      const failingAdapter = createMockAdapter('claude', 'circuit-error');
      const task = createTask();

      // Open the circuit
      await custom.execute(failingAdapter, task);
      await custom.execute(failingAdapter, task);

      // Without taskCategory, should use generic chain (gemini first after claude)
      const result = await custom.execute(failingAdapter, task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executedBy).toBe('gemini');
        expect(result.value.usedFallback).toBe(true);
      }
    });

    it('should prefer codex for code_generation tasks', async () => {
      const config: CliCircuitBreakerConfig = {
        enableFallback: true,
        fallbackChain: ['claude', 'gemini', 'codex'],
        perCliConfig: {
          claude: { failureThreshold: 2 },
        },
      };
      const custom = new CliCircuitBreakerIntegration(adapters, config);
      const failingAdapter = createMockAdapter('claude', 'circuit-error');
      const task = createTask();

      // Open the circuit
      await custom.execute(failingAdapter, task);
      await custom.execute(failingAdapter, task);

      // With code_generation, should use code chain: codex first
      const result = await custom.execute(failingAdapter, task, 'code_generation');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executedBy).toBe('codex');
        expect(result.value.usedFallback).toBe(true);
      }
    });

    it('should prefer gemini for research tasks', async () => {
      const config: CliCircuitBreakerConfig = {
        enableFallback: true,
        fallbackChain: ['claude', 'gemini', 'codex'],
        perCliConfig: {
          claude: { failureThreshold: 2 },
        },
      };
      const custom = new CliCircuitBreakerIntegration(adapters, config);
      const failingAdapter = createMockAdapter('claude', 'circuit-error');
      const task = createTask();

      // Open the circuit
      await custom.execute(failingAdapter, task);
      await custom.execute(failingAdapter, task);

      // With research, should use research chain: gemini first
      const result = await custom.execute(failingAdapter, task, 'research');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.executedBy).toBe('gemini');
        expect(result.value.usedFallback).toBe(true);
      }
    });
  });
});

describe('createCliCircuitBreakerIntegration', () => {
  it('should create integration with config and logger', () => {
    const adapters = [createMockAdapter('claude')];
    const config: CliCircuitBreakerConfig = { enableFallback: false };
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
      setLevel: vi.fn(),
    };

    const integration1 = createCliCircuitBreakerIntegration(adapters);
    expect(integration1).toBeInstanceOf(CliCircuitBreakerIntegration);

    const integration2 = createCliCircuitBreakerIntegration(adapters, config, mockLogger);
    expect(integration2).toBeDefined();
  });
});
