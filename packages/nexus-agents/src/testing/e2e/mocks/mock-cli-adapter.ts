/**
 * Mock CLI Adapter for E2E Testing
 *
 * Configurable mock adapter with controllable responses and failures.
 *
 * @module testing/e2e/mocks/mock-cli-adapter
 */

import type { Result, Task } from '../../../core/index.js';
import { ok, err, AgentError, getRandomProvider } from '../../../core/index.js';
import { clamp01 } from '../../../utils/math-utils.js';

export interface MockCliAdapterConfig {
  name: 'claude' | 'gemini' | 'codex';
  available?: boolean;
  version?: string;
  responseDelay?: number;
  failureRate?: number;
  responses?: Map<string, string>;
  errorMessage?: string;
}

export interface MockCliResponse {
  content: string;
  tokensUsed: number;
  latencyMs: number;
}

/**
 * Mock CLI Adapter for E2E testing.
 * Provides controllable behavior for testing routing, fallback, and error handling.
 */
export class MockCliAdapter {
  readonly name: 'claude' | 'gemini' | 'codex';
  private _available: boolean;
  private _version: string;
  private responseDelay: number;
  private failureRate: number;
  private responses: Map<string, string>;
  private errorMessage: string;
  private callCount = 0;
  private lastTask: Task | undefined;

  constructor(config: MockCliAdapterConfig) {
    this.name = config.name;
    this._available = config.available ?? true;
    this._version = config.version ?? '1.0.0';
    this.responseDelay = config.responseDelay ?? 0;
    this.failureRate = config.failureRate ?? 0;
    this.responses = config.responses ?? new Map<string, string>();
    this.errorMessage = config.errorMessage ?? 'Mock adapter error';
  }

  get available(): boolean {
    return this._available;
  }

  get version(): string {
    return this._version;
  }

  setAvailable(available: boolean): void {
    this._available = available;
  }

  setFailureRate(rate: number): void {
    this.failureRate = clamp01(rate);
  }

  setResponseDelay(ms: number): void {
    this.responseDelay = ms;
  }

  addResponse(taskPattern: string, response: string): void {
    this.responses.set(taskPattern, response);
  }

  getCallCount(): number {
    return this.callCount;
  }

  getLastTask(): Task | undefined {
    return this.lastTask;
  }

  reset(): void {
    this.callCount = 0;
    this.lastTask = undefined;
  }

  async healthCheck(): Promise<boolean> {
    if (this.responseDelay > 0) {
      await this.delay(this.responseDelay);
    }
    return this._available;
  }

  async execute(task: Task): Promise<Result<MockCliResponse, AgentError>> {
    this.callCount++;
    this.lastTask = task;

    if (!this._available) {
      return err(
        new AgentError(`CLI ${this.name} is not available`, {
          context: { cliName: this.name },
        })
      );
    }

    if (this.responseDelay > 0) {
      await this.delay(this.responseDelay);
    }

    if (getRandomProvider().random() < this.failureRate) {
      return err(
        new AgentError(this.errorMessage, {
          context: { cliName: this.name, taskId: task.id },
        })
      );
    }

    const content = this.findResponse(task.description);
    const tokensUsed = Math.floor(content.length / 4);

    return ok({
      content,
      tokensUsed,
      latencyMs: this.responseDelay,
    });
  }

  private findResponse(taskDescription: string): string {
    for (const [pattern, response] of this.responses) {
      if (taskDescription.includes(pattern)) {
        return response;
      }
    }
    return `Mock response from ${this.name} for: ${taskDescription}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a set of mock CLI adapters for testing.
 */
export function createMockAdapters(): Map<string, MockCliAdapter> {
  const adapters = new Map<string, MockCliAdapter>();

  adapters.set(
    'claude',
    new MockCliAdapter({
      name: 'claude',
      available: true,
      version: '4.5.0',
      responseDelay: 50,
    })
  );

  adapters.set(
    'gemini',
    new MockCliAdapter({
      name: 'gemini',
      available: true,
      version: '2.5.0',
      responseDelay: 30,
    })
  );

  adapters.set(
    'codex',
    new MockCliAdapter({
      name: 'codex',
      available: true,
      version: '5.0.0',
      responseDelay: 20,
    })
  );

  return adapters;
}
