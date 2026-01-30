/**
 * nexus-agents/testing - Mock CLI Adapter
 *
 * A mock implementation of ICliAdapter for testing purposes.
 * Provides configurable responses, simulated latency, and failure injection.
 *
 * Types are in mock-adapter-types.ts, helpers in mock-adapter-helpers.ts.
 */

import type { Result } from '../../core/index.js';
import { ok, err, getTimeProvider } from '../../core/index.js';
import type {
  ICliAdapter,
  CliName,
  CliTransport,
  CliTask,
  CliResponse,
  CliError,
  HealthStatus,
  CapacityStatus,
  CapabilityProfile,
  ModelInfo,
  ExecutionOptions,
} from '../../cli-adapters/types.js';
import { DEFAULT_CAPABILITIES } from '../../cli-adapters/types.js';
import type { MockAdapterConfig, RecordedRequest, NextResponse } from './mock-adapter-types.js';
import {
  DEFAULT_CONFIG,
  MODEL_INFO_BY_NAME,
  createCliError,
  createCliResponse,
  shouldFailByRate,
  delay,
  mergeResponseMaps,
  calculateEffectiveLatency,
} from './mock-adapter-helpers.js';

// Re-export types for backwards compatibility
export type { MockAdapterConfig, RecordedRequest } from './mock-adapter-types.js';

/**
 * Mock CLI adapter for testing.
 * Tracks all requests and allows configurable responses and failures.
 */
export class MockCliAdapter implements ICliAdapter {
  readonly transport: CliTransport = 'subprocess';

  private readonly config: MockAdapterConfig;
  private readonly calls: RecordedRequest[] = [];
  private nextResponses: NextResponse[] = [];
  private initialized = false;
  private mockVersion = '2.0.76';
  private mockHealthy = true;
  private consecutiveFailures = 0;

  constructor(config?: Partial<MockAdapterConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      responses: mergeResponseMaps(DEFAULT_CONFIG.responses, config?.responses),
    };
  }

  /**
   * Gets the CLI name being emulated.
   */
  get name(): CliName {
    return this.config.name;
  }

  /**
   * Gets the capability profile for this CLI.
   */
  get capabilities(): CapabilityProfile {
    return DEFAULT_CAPABILITIES[this.config.name];
  }

  /**
   * Executes a task with configurable response behavior.
   */
  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    this.recordCall(task, options);

    const latency = calculateEffectiveLatency(this.config.defaultLatencyMs, task.timeoutMs);
    if (latency > 0) {
      await delay(latency);
    }

    if (this.isTimedOut(options, latency)) {
      return err(createCliError('TIMEOUT', 'Request timed out', this.config.name));
    }

    const queuedResponse = this.processQueuedResponse(latency);
    if (queuedResponse !== undefined) {
      return queuedResponse;
    }

    if (shouldFailByRate(this.config.failureRate)) {
      this.consecutiveFailures++;
      return err(createCliError('EXECUTION_ERROR', 'Simulated failure', this.config.name));
    }

    return this.getConfiguredResponse(task, latency);
  }

  /**
   * Performs a health check.
   */
  healthCheck(): Promise<HealthStatus> {
    const status: HealthStatus = {
      healthy: this.mockHealthy,
      version: this.mockVersion,
      versionStatus: 'supported',
      lastChecked: new Date(getTimeProvider().now()),
    };

    if (!this.mockHealthy) {
      return Promise.resolve({ ...status, message: 'Mock unhealthy state' });
    }

    return Promise.resolve(status);
  }

  /**
   * Gets current capacity status.
   */
  getCapacity(): Promise<CapacityStatus> {
    return Promise.resolve({
      remainingTokens: Number.MAX_SAFE_INTEGER,
      remainingRequests: Number.MAX_SAFE_INTEGER,
      resetTime: new Date(getTimeProvider().now() + 3600_000),
      utilizationPercent: 0,
      exhausted: false,
    });
  }

  /**
   * Gets CLI version.
   */
  getVersion(): Promise<string> {
    return Promise.resolve(this.mockVersion);
  }

  /**
   * Gets model information.
   */
  getModelInfo(): ModelInfo {
    return MODEL_INFO_BY_NAME[this.config.name];
  }

  /**
   * Initializes the adapter.
   */
  initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  /**
   * Cleans up resources.
   */
  dispose(): Promise<void> {
    this.initialized = false;
    return Promise.resolve();
  }

  // ----- Test Helper Methods -----

  /**
   * Gets all recorded requests for assertions.
   */
  getCalls(): RecordedRequest[] {
    return [...this.calls];
  }

  /**
   * Gets the number of times execute was called.
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Gets the last recorded request.
   */
  getLastCall(): RecordedRequest | undefined {
    return this.calls[this.calls.length - 1];
  }

  /**
   * Sets the next response to return.
   * Can be called multiple times to queue responses.
   * @param response - String for success, Error for failure
   */
  setNextResponse(response: string | Error): void {
    this.nextResponses.push(response);
  }

  /**
   * Sets multiple responses to return in sequence.
   * @param responses - Array of strings or Errors
   */
  setNextResponses(responses: Array<string | Error>): void {
    this.nextResponses.push(...responses);
  }

  /**
   * Resets all recorded calls and queued responses.
   */
  reset(): void {
    this.calls.length = 0;
    this.nextResponses.length = 0;
    this.consecutiveFailures = 0;
  }

  /**
   * Sets the mock version for health checks.
   */
  setVersion(version: string): void {
    this.mockVersion = version;
  }

  /**
   * Sets the healthy status for health checks.
   */
  setHealthy(healthy: boolean): void {
    this.mockHealthy = healthy;
  }

  /**
   * Adds a specific response for a task content or session ID.
   */
  addResponse(key: string, response: string): void {
    this.config.responses.set(key, response);
  }

  /**
   * Removes a specific response mapping.
   */
  removeResponse(key: string): void {
    this.config.responses.delete(key);
  }

  /**
   * Gets the number of consecutive failures (for circuit breaker testing).
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Checks if the adapter has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ----- Private Methods -----

  /**
   * Records a request for test assertions.
   */
  private recordCall(task: CliTask, options?: ExecutionOptions): void {
    this.calls.push({ task, options, timestamp: new Date(getTimeProvider().now()) });
  }

  /**
   * Checks if request has timed out.
   */
  private isTimedOut(options: ExecutionOptions | undefined, latency: number): boolean {
    return options?.timeoutMs !== undefined && latency > options.timeoutMs;
  }

  /**
   * Processes queued response override if available.
   */
  private processQueuedResponse(latency: number): Result<CliResponse, CliError> | undefined {
    if (this.nextResponses.length === 0) {
      return undefined;
    }
    const next = this.nextResponses.shift();
    if (next === undefined) {
      return undefined;
    }
    if (next instanceof Error) {
      this.consecutiveFailures++;
      return err(createCliError('EXECUTION_ERROR', next.message, this.config.name));
    }
    this.consecutiveFailures = 0;
    return ok(createCliResponse(next, latency, this.getModelInfo().id));
  }

  /**
   * Gets configured response based on task key or default.
   */
  private getConfiguredResponse(task: CliTask, latency: number): Result<CliResponse, CliError> {
    const responseKey = task.sessionId ?? task.content;
    const specificResponse = this.config.responses.get(responseKey);
    const text = specificResponse ?? this.config.defaultResponse;
    this.consecutiveFailures = 0;
    return ok(createCliResponse(text, latency, this.getModelInfo().id));
  }
}

/**
 * Creates a mock adapter with defaults suitable for unit tests.
 * No latency, no failures, predictable responses.
 */
export function createTestAdapter(
  name: CliName = 'claude',
  defaultResponse = 'Test response'
): MockCliAdapter {
  return new MockCliAdapter({
    name,
    defaultResponse,
    defaultLatencyMs: 0,
    failureRate: 0,
    responses: new Map(),
  });
}

/**
 * Creates a mock adapter configured for circuit breaker testing.
 * Always fails to trigger circuit breaker logic.
 */
export function createFailingAdapter(name: CliName = 'claude'): MockCliAdapter {
  return new MockCliAdapter({
    name,
    defaultResponse: '',
    defaultLatencyMs: 0,
    failureRate: 1.0,
    responses: new Map(),
  });
}

/**
 * Creates a mock adapter configured for latency testing.
 * @param latencyMs - Simulated response latency
 */
export function createSlowAdapter(name: CliName = 'claude', latencyMs: number): MockCliAdapter {
  return new MockCliAdapter({
    name,
    defaultResponse: 'Slow response',
    defaultLatencyMs: latencyMs,
    failureRate: 0,
    responses: new Map(),
  });
}
