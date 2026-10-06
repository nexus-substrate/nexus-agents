/**
 * nexus-agents/cli-adapters - CLI Circuit Breaker Integration
 *
 * Wraps CLI adapter calls with circuit breaker pattern for resilient
 * multi-CLI execution with automatic fallback on failures.
 *
 * (Source: Issue #359 - Integrate circuit breaker with CLI adapters)
 */

import type { Result, ILogger } from '../core/index.js';
import { ok, err, createLogger, getTimeProvider, getErrorMessage } from '../core/index.js';
import type { TaskCategory } from '../config/task-specialization-types.js';
import type { FallbackTaskType } from './task-classifier.js';
import { getFallbackChainForCategory } from './fallback-chains.js';
import type {
  ICliAdapter,
  CliName,
  CliTask,
  CliResponse,
  CliError,
  ObservedArmId,
} from './types.js';
import { breakerKeys } from './breaker-key.js';
import { gatewayServedSlotOf, resolveGatewayServedSlot } from './gateway-slot-arm.js';
import {
  CircuitBreakerRegistry,
  CircuitError,
  CircuitErrorCode,
  mapCliErrorToCategory,
  type CliCircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitBreakerSnapshot,
  type CircuitStateChangeListener,
} from './circuit-breaker.js';
import { isCallerInputCliError } from './cli-error-helpers.js';
import { isCallerCancelled } from '../adapters/abort-utils.js';
import { unenforcedAccessModeRefusal } from './access-mode.js';

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

// #4330: the shared registry now gates voter-panel availability, so a CLI can
// vanish from a panel roster because its circuit opened. Log every transition —
// otherwise the next person debugging a "missing voter" has no trail, and a
// misclassified transient error silently costs the panel its diversity.
const registryLogger = createLogger({ component: 'cli-circuit-breaker' });
defaultCliCircuitBreakerRegistry.addGlobalStateChangeListener((event) => {
  registryLogger.warn('CLI circuit state changed', {
    cli: event.cliName,
    previousState: event.previousState,
    newState: event.newState,
    failureCount: event.failureCount,
    reason: event.reason,
  });
});

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
  return defaultCliCircuitBreakerRegistry.getAllArmSnapshots().get(cliName);
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
      this.breakerFor(adapter);
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

    for (const cli of this.getFallbackClis(primaryCli, taskCategory, task).slice(
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
    const clis: CliCircuitHealthStatus['clis'][number][] = [];
    let healthyCount = 0;
    for (const [name, adapter] of this.adapters) {
      const snapshot = this.breakerFor(adapter).breaker.getSnapshot();
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
    const snapshots = new Map<CliName, CircuitBreakerSnapshot>();
    for (const [name, adapter] of this.adapters) {
      snapshots.set(name, this.breakerFor(adapter).breaker.getSnapshot());
    }
    return snapshots;
  }

  resetCircuit(cliName: CliName): void {
    const adapter = this.adapters.get(cliName);
    this.registry.resetArm(adapter === undefined ? cliName : this.breakerFor(adapter).key);
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
    let { key, breaker } = this.breakerFor(adapter, task);
    let execResult: Result<CliResponse, CliError>;
    let targetResolved = false;
    try {
      await resolveGatewayServedSlot(adapter);
      const refusal = await this.prepareImplicitRoute(adapter, task);
      if (refusal !== undefined) return err(refusal);
      targetResolved = true;
      ({ key, breaker } = this.breakerFor(adapter, task));
      const canRun = breaker.canExecute();
      if (!canRun.ok) return canRun;
      execResult = await adapter.execute(task);
    } catch (error) {
      // A rejected availability probe has not selected a failure domain.
      // Never charge the provisional plain CLI breaker for that probe.
      if (targetResolved) breaker.recordFailure('unknown');
      return err(
        new CircuitError(`CLI execution threw unexpectedly: ${getErrorMessage(error)}`, {
          circuitErrorCode: CircuitErrorCode.EXECUTION_FAILED,
          cliName: adapter.name,
          armId: key,
          circuitState: breaker.getState(),
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      );
    }

    return this.recordOutcome(adapter, breaker, execResult);
  }

  /** Resolve an implicit OpenCode route before gating, preserving access refusals. */
  private async prepareImplicitRoute(
    adapter: ICliAdapter,
    task: CliTask
  ): Promise<CliError | undefined> {
    if (adapter.name !== 'opencode' || task.model !== undefined) return undefined;
    const refusal = unenforcedAccessModeRefusal(adapter, task);
    if (refusal !== undefined) return refusal;
    // A missing/cooled configured model omits --model and runs the default.
    await adapter.initialize();
    return undefined;
  }

  private recordOutcome(
    adapter: ICliAdapter,
    breaker: CliCircuitBreaker,
    execResult: Result<CliResponse, CliError>
  ): Result<CliResponse, CliError> {
    const recordsOutcome = this.ownsBreakerOutcome(adapter);
    if (!execResult.ok) {
      // #6613: caller-input errors (e.g. invalid model requested) must not count
      // against the breaker or exhaust half-open probe capacity. #6691: nor
      // must a call its caller cancelled.
      if (isCallerInputCliError(execResult.error) || isCallerCancelled(execResult.error)) {
        breaker.releaseHalfOpenProbe();
        return err(execResult.error);
      }
      if (recordsOutcome) breaker.recordFailure(mapCliErrorToCategory(execResult.error.code));
      return err(execResult.error);
    }

    if (recordsOutcome) breaker.recordSuccess();
    return ok(execResult.value);
  }

  private breakerFor(
    adapter: Pick<ICliAdapter, 'name'> & Partial<Pick<ICliAdapter, 'getModelInfo'>>,
    task?: CliTask
  ): {
    key: ObservedArmId;
    breaker: CliCircuitBreaker;
  } {
    const key = breakerKeys.forArm({
      name: adapter.name,
      model: task?.model ?? adapter.getModelInfo?.().id,
      gatewayArm: gatewayServedSlotOf(adapter)?.arm,
    });
    return {
      key,
      breaker: this.registry.getArmBreaker(key, this.config.perCliConfig[adapter.name]),
    };
  }

  /** Marked gateway slots record in the shared registry; private registries own their records. */
  private ownsBreakerOutcome(adapter: ICliAdapter): boolean {
    return (
      this.registry !== defaultCliCircuitBreakerRegistry ||
      gatewayServedSlotOf(adapter)?.arm === undefined
    );
  }

  private getFallbackClis(
    excludeCli: CliName,
    taskCategory?: TaskCategory,
    task?: CliTask
  ): CliName[] {
    const chain =
      taskCategory !== undefined
        ? getFallbackChainForCategory(taskCategory, CATEGORY_TO_FALLBACK[taskCategory])
        : this.config.fallbackChain;
    return [...chain].filter((cli) => {
      const adapter = this.adapters.get(cli);
      return (
        cli !== excludeCli &&
        adapter !== undefined &&
        !this.registry.isArmOpen(this.breakerFor(adapter, task).key)
      );
    });
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
