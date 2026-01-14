/**
 * nexus-agents/testing - Mock CLI Adapter
 *
 * A mock implementation of ICliAdapter for testing purposes.
 * Provides configurable responses, simulated latency, and failure injection.
 *
 * File length justification: Full ICliAdapter mock implementation with
 * extensive test configuration (responses, latency, failures). Types in
 * cli-adapters/types.js. Splitting would fragment the mock's behavior.
 */

import type { Result } from '../../core/index.js';
import { ok, err } from '../../core/index.js';
import type {
  ICliAdapter,
  CliName,
  CliTransport,
  CliTask,
  CliResponse,
  CliError,
  CliErrorCode,
  HealthStatus,
  CapacityStatus,
  CapabilityProfile,
  ModelInfo,
  ExecutionOptions,
} from '../../cli-adapters/types.js';
import { DEFAULT_CAPABILITIES } from '../../cli-adapters/types.js';

/**
 * Configuration for mock adapter behavior.
 */
export interface MockAdapterConfig {
  /** CLI name to emulate */
  readonly name: CliName;
  /** Default response text when no specific response is configured */
  readonly defaultResponse: string;
  /** Default simulated latency in milliseconds */
  readonly defaultLatencyMs: number;
  /** Probability of failure (0-1), for circuit breaker testing */
  readonly failureRate: number;
  /** Specific responses keyed by task content or session ID */
  readonly responses: Map<string, string>;
}

/**
 * Recorded request for test assertions.
 */
export interface RecordedRequest {
  /** The task that was executed */
  readonly task: CliTask;
  /** Options passed to execute */
  readonly options?: ExecutionOptions | undefined;
  /** Timestamp of the request */
  readonly timestamp: Date;
}

/**
 * Pending response override.
 * Can be a string (success) or Error (failure).
 */
type NextResponse = string | Error;

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: MockAdapterConfig = {
  name: 'claude',
  defaultResponse: 'Mock response',
  defaultLatencyMs: 0,
  failureRate: 0,
  responses: new Map(),
};

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
    // Merge responses Maps
    const mergedResponses = new Map<string, string>();
    for (const [key, value] of DEFAULT_CONFIG.responses.entries()) {
      mergedResponses.set(key, value);
    }
    if (config?.responses !== undefined) {
      for (const [key, value] of config.responses.entries()) {
        mergedResponses.set(key, value);
      }
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      responses: mergedResponses,
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
    // Record the request
    this.calls.push({
      task,
      options,
      timestamp: new Date(),
    });

    // Simulate latency
    const latency =
      task.timeoutMs !== undefined && task.timeoutMs < this.config.defaultLatencyMs
        ? task.timeoutMs
        : this.config.defaultLatencyMs;

    if (latency > 0) {
      await this.delay(latency);
    }

    // Check for timeout (simulated)
    if (options?.timeoutMs !== undefined && latency > options.timeoutMs) {
      return err(this.createError('TIMEOUT', 'Request timed out'));
    }

    // Check for queued response override
    const queuedResponse = this.processQueuedResponse(latency);
    if (queuedResponse !== undefined) {
      return queuedResponse;
    }

    // Check for configured failure rate
    if (this.shouldFail()) {
      this.consecutiveFailures++;
      return err(this.createError('EXECUTION_ERROR', 'Simulated failure'));
    }

    // Return specific or default response
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
      lastChecked: new Date(),
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
      resetTime: new Date(Date.now() + 3600_000),
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
    const modelInfoByName: Record<CliName, ModelInfo> = {
      claude: {
        id: 'claude-sonnet-4',
        name: 'Claude Sonnet 4',
        contextWindow: 200_000,
        maxOutput: 64_000,
        costPerMillionInput: 3.0,
        costPerMillionOutput: 15.0,
      },
      gemini: {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        contextWindow: 1_000_000,
        maxOutput: 8_192,
        costPerMillionInput: 0.075,
        costPerMillionOutput: 0.3,
      },
      codex: {
        id: 'gpt-5-codex',
        name: 'GPT-5 Codex',
        contextWindow: 400_000,
        maxOutput: 32_000,
        costPerMillionInput: 2.0,
        costPerMillionOutput: 8.0,
      },
    };

    return modelInfoByName[this.config.name];
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
      return err(this.createError('EXECUTION_ERROR', next.message));
    }
    this.consecutiveFailures = 0;
    return ok(this.createResponse(next, latency));
  }

  /**
   * Gets configured response based on task key or default.
   */
  private getConfiguredResponse(task: CliTask, latency: number): Result<CliResponse, CliError> {
    const responseKey = task.sessionId ?? task.content;
    const specificResponse = this.config.responses.get(responseKey);
    if (specificResponse !== undefined) {
      this.consecutiveFailures = 0;
      return ok(this.createResponse(specificResponse, latency));
    }
    this.consecutiveFailures = 0;
    return ok(this.createResponse(this.config.defaultResponse, latency));
  }

  /**
   * Determines if this request should fail based on failure rate.
   */
  private shouldFail(): boolean {
    if (this.config.failureRate <= 0) {
      return false;
    }
    if (this.config.failureRate >= 1) {
      return true;
    }
    return Math.random() < this.config.failureRate;
  }

  /**
   * Creates a CLI error.
   */
  private createError(code: CliErrorCode, message: string): CliError {
    const retryable = ['RATE_LIMITED', 'TIMEOUT', 'CONNECTION_ERROR'].includes(code);

    return {
      code,
      message,
      cli: this.config.name,
      retryable,
    };
  }

  /**
   * Creates a CLI response.
   */
  private createResponse(text: string, latencyMs: number): CliResponse {
    return {
      text,
      durationMs: latencyMs,
      model: this.getModelInfo().id,
      usage: {
        inputTokens: Math.floor(text.length / 4),
        outputTokens: Math.floor(text.length / 4),
      },
    };
  }

  /**
   * Delays for the specified milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    failureRate: 1.0, // Always fail
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
