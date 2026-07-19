/**
 * nexus-agents/cli-adapters - CLI Circuit Breaker Integration
 *
 * Wraps CLI adapter calls with circuit breaker pattern for resilient
 * multi-CLI execution with automatic fallback on failures.
 *
 * (Source: Issue #359 - Integrate circuit breaker with CLI adapters)
 */

import type { Result, ILogger } from '../core/index.js';
import { ok, err, createLogger, getTimeProvider } from '../core/index.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import type { FallbackTaskType } from './task-classifier.js';
import { getFallbackChainForCategory } from './fallback-chains.js';
import type { ICliAdapter, CliName, CliTask, CliResponse, CliError } from './types.js';
import {
  CircuitBreakerRegistry,
  CircuitError,
  mapCliErrorToCategory,
  type CircuitBreakerConfig,
  type CircuitBreakerSnapshot,
  type CircuitStateChangeListener,
} from './circuit-breaker.js';

/** Maps canonical TaskCategory (10 types) to FallbackTaskType (5 types). */
const CATEGORY_TO_FALLBACK: Record<TaskCategory, FallbackTaskType> = {
  code_generation: 'code',
  code_review: 'code',
  testing: 'code',
  research: 'research',
  exploration: 'research',
  documentation: 'documentation',
  architecture: 'analysis',
  security_review: 'analysis',
  planning: 'analysis',
  devops: 'general',
};

/** Configuration for CLI circuit breaker integration. */
export interface CliCircuitBreakerConfig {
  readonly perCliConfig?: Partial<Record<CliName, Partial<CircuitBreakerConfig>>>;
  readonly fallbackChain?: ReadonlyArray<CliName>;
  readonly enableFallback?: boolean;
  readonly maxFallbackAttempts?: number;
}

/** Result of a circuit-protected execution with fallback info. */
export interface CircuitProtectedResult {
  readonly response: CliResponse;
  readonly executedBy: CliName;
  readonly usedFallback: boolean;
  readonly fallbackAttempts?: ReadonlyArray<CliName>;
}

/** Health status for all CLIs with circuit state. */
export interface CliCircuitHealthStatus {
  readonly clis: ReadonlyArray<{
    readonly name: CliName;
    readonly healthy: boolean;
    readonly circuitState: 'closed' | 'open' | 'half-open';
    readonly failureCount: number;
    readonly lastFailureTime: number | null;
  }>;
  readonly systemHealthy: boolean;
  readonly healthyCount: number;
  readonly timestamp: number;
}

/** Interface for CLI circuit breaker integration. */
export interface ICliCircuitBreakerIntegration {
  execute(
    adapter: ICliAdapter,
    task: CliTask,
    taskCategory?: TaskCategory
  ): Promise<Result<CircuitProtectedResult, CircuitError | CliError>>;
  getHealthStatus(): CliCircuitHealthStatus;
  getCircuitSnapshots(): Map<CliName, CircuitBreakerSnapshot>;
  resetCircuit(cliName: CliName): void;
  resetAllCircuits(): void;
  addStateChangeListener(listener: CircuitStateChangeListener): void;
}

const DEFAULT_FALLBACK_CHAIN: ReadonlyArray<CliName> = ['claude', 'gemini', 'codex', 'opencode'];
const DEFAULT_CONFIG: Required<CliCircuitBreakerConfig> = {
  perCliConfig: {},
  fallbackChain: DEFAULT_FALLBACK_CHAIN,
  enableFallback: true,
  maxFallbackAttempts: 2,
};
const defaultCliCircuitBreakerRegistry = new CircuitBreakerRegistry();

/** Returns the shared CLI circuit-breaker registry used by default integrations. */
export function getDefaultCliCircuitBreakerRegistry(): CircuitBreakerRegistry {
  return defaultCliCircuitBreakerRegistry;
}

/**
 * Reads the current snapshot for a CLI without creating a new breaker.
 *
 * `undefined` means no circuit state is known yet, so callers should fail open.
 */
export function getCliCircuitBreakerSnapshot(cliName: CliName): CircuitBreakerSnapshot | undefined {
  return defaultCliCircuitBreakerRegistry.getAllSnapshots().get(cliName);
}

/**
 * Integrates circuit breaker pattern with CLI adapters.
 * Provides automatic fallback when a CLI's circuit opens.
 */
export class CliCircuitBreakerIntegration implements ICliCircuitBreakerIntegration {
  private readonly registry: CircuitBreakerRegistry;
  private readonly adapters: Map<CliName, ICliAdapter> = new Map();
  private readonly config: Required<CliCircuitBreakerConfig>;
  private readonly logger: ILogger;

  constructor(
    adapters: ReadonlyArray<ICliAdapter>,
    config?: CliCircuitBreakerConfig,
    logger?: ILogger
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'cli-circuit-breaker-integration' });
    this.registry =
      config === undefined ? defaultCliCircuitBreakerRegistry : new CircuitBreakerRegistry();
    for (const adapter of adapters) {
      this.adapters.set(adapter.name, adapter);
      this.registry.getBreaker(adapter.name, this.config.perCliConfig[adapter.name]);
    }
  }

  async execute(
    adapter: ICliAdapter,
    task: CliTask,
    taskCategory?: TaskCategory
  ): Promise<Result<CircuitProtectedResult, CircuitError | CliError>> {
    const primaryCli = adapter.name;
    const fallbackAttempts: CliName[] = [];
    let lastError: CircuitError | CliError | undefined;

    const primaryResult = await this.executeWithBreaker(adapter, task);
    if (primaryResult.ok) {
      return ok({ response: primaryResult.value, executedBy: primaryCli, usedFallback: false });
    }
    lastError = primaryResult.error;

    if (!this.config.enableFallback || !(lastError instanceof CircuitError)) {
      return err(lastError);
    }

    for (const cli of this.getFallbackClis(primaryCli, taskCategory).slice(
      0,
      this.config.maxFallbackAttempts
    )) {
      const fallbackAdapter = this.adapters.get(cli);
      if (!fallbackAdapter) continue;
      fallbackAttempts.push(cli);
      this.logger.info('Attempting fallback', { from: primaryCli, to: cli });
      const result = await this.executeWithBreaker(fallbackAdapter, task);
      if (result.ok) {
        return ok({
          response: result.value,
          executedBy: cli,
          usedFallback: true,
          fallbackAttempts,
        });
      }
      lastError = result.error;
    }

    this.logger.warn('All fallback attempts failed', { primaryCli, fallbackAttempts });
    return err(lastError);
  }

  getHealthStatus(): CliCircuitHealthStatus {
    const snapshots = this.registry.getAllSnapshots();
    const clis: CliCircuitHealthStatus['clis'][number][] = [];
    let healthyCount = 0;
    for (const name of this.adapters.keys()) {
      const snapshot = snapshots.get(name);
      if (!snapshot) continue;
      const healthy = snapshot.state === 'closed';
      if (healthy) healthyCount++;
      clis.push({
        name,
        healthy,
        circuitState: snapshot.state,
        failureCount: snapshot.failureCount,
        lastFailureTime: snapshot.lastFailureTime,
      });
    }
    return {
      clis,
      systemHealthy: healthyCount > 0,
      healthyCount,
      timestamp: getTimeProvider().now(),
    };
  }

  getCircuitSnapshots(): Map<CliName, CircuitBreakerSnapshot> {
    const allSnapshots = this.registry.getAllSnapshots();
    const snapshots = new Map<CliName, CircuitBreakerSnapshot>();
    for (const name of this.adapters.keys()) {
      const snapshot = allSnapshots.get(name);
      if (snapshot !== undefined) {
        snapshots.set(name, snapshot);
      }
    }
    return snapshots;
  }

  resetCircuit(cliName: CliName): void {
    this.registry.reset(cliName);
    this.logger.info('Circuit reset', { cliName });
  }

  resetAllCircuits(): void {
    this.registry.resetAll();
    this.logger.info('All circuits reset');
  }

  addStateChangeListener(listener: CircuitStateChangeListener): void {
    this.registry.addGlobalStateChangeListener(listener);
  }

  private async executeWithBreaker(
    adapter: ICliAdapter,
    task: CliTask
  ): Promise<Result<CliResponse, CircuitError | CliError>> {
    const breaker = this.registry.getBreaker(adapter.name);
    const result = await breaker.execute(async () => {
      const execResult = await adapter.execute(task);
      if (!execResult.ok) {
        breaker.recordFailure(mapCliErrorToCategory(execResult.error.code));
        const wrappedError = new Error(execResult.error.message);
        (wrappedError as Error & { cliError: CliError }).cliError = execResult.error;
        throw wrappedError;
      }
      return execResult.value;
    });

    if (!result.ok) {
      if (result.error.circuitErrorCode === 'CIRCUIT_OPEN') return err(result.error);
      const wrapped = result.error.cause as (Error & { cliError?: CliError }) | undefined;
      if (wrapped?.cliError) return err(wrapped.cliError);
      return err(result.error);
    }
    return ok(result.value);
  }

  private getFallbackClis(excludeCli: CliName, taskCategory?: TaskCategory): CliName[] {
    const chain =
      taskCategory !== undefined
        ? getFallbackChainForCategory(taskCategory, CATEGORY_TO_FALLBACK[taskCategory])
        : this.config.fallbackChain;
    return [...chain].filter(
      (cli) => cli !== excludeCli && !this.registry.isOpen(cli) && this.adapters.has(cli)
    );
  }
}

/** Creates a CLI circuit breaker integration with the specified adapters. */
export function createCliCircuitBreakerIntegration(
  adapters: ReadonlyArray<ICliAdapter>,
  config?: CliCircuitBreakerConfig,
  logger?: ILogger
): CliCircuitBreakerIntegration {
  return new CliCircuitBreakerIntegration(adapters, config, logger);
}
