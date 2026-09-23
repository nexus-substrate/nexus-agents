/**
 * The router arm for a vendor slot in gateway mode (#6604).
 *
 * The arm keeps the SLOT key and serves the slot from one of two targets: the
 * CLI's subprocess adapter or the slot's family gateway model. Which one is
 * decided by the predicate `createAutoAdapter` uses, `isCliAvailable` (health
 * AND auth), so the router and the registry agree on a logged-out CLI.
 *
 * - No binary on PATH: the gateway target, outright. `isCliAvailable` runs
 *   the binary, so it cannot be true.
 * - Binary on PATH: the arm asks the predicate on first use and commits.
 * - A committed CLI target that fails with an availability error
 *   (`NOT_FOUND`, `NOT_AUTHENTICATED`, `UNSUPPORTED_VERSION`) drops the
 *   commitment, and the NEXT call re-asks the predicate with a fresh probe.
 *   The router caches its arms for the process (`expert-bridge.ts`), so
 *   without this an expired login stranded the slot on a dead CLI.
 *
 * This is not failover: a failed call returns its own error, and no call is
 * retried on the other target, so the router stays the only failover layer
 * (#5191). A gateway commitment is not re-checked.
 *
 * Which target serves the arm is state of THIS arm instance
 * ({@link gatewayServedSlotOf}); the budget router reads it to price a
 * gateway-served slot by the gateway's declaration.
 *
 * @module cli-adapters/gateway-slot-arm
 */

import type {
  CapabilityProfile,
  CapacityStatus,
  CliError,
  CliErrorCode,
  CliName,
  CliResponse,
  CliTask,
  CliTransport,
  EndpointArmId,
  ExecutionOptions,
  HealthStatus,
  ICliAdapter,
  ModelInfo,
} from './types.js';
import { isEndpointArmId } from './types.js';
import type { ILogger, IModelAdapter, Result } from '../core/index.js';
import { createGatewaySlotAdapter, resolveGatewaySlot } from '../adapters/gateway-family-slots.js';
import { buildCliCapabilityProfiles } from '../config/model-config-helpers.js';
import { isCliBinaryOnPath } from './cli-binary-on-path.js';
import { createModelToCliAdapter } from './model-to-cli-adapter.js';

/** The gateway serving an arm: the model that runs and the arm it is priced by. */
export interface GatewayServedSlot {
  readonly modelId: string;
  /** Undefined when the model carries no gateway-arm marker; the slot is then unpriced. */
  readonly arm: EndpointArmId | undefined;
}

/** Availability predicate; `fresh` asks it to bypass any cached answer. */
type SlotAvailability = (cli: CliName, fresh: boolean) => Promise<boolean>;

/** CLI failures that mean "the CLI is not available", not "this task failed". */
const AVAILABILITY_ERRORS: ReadonlySet<CliErrorCode> = new Set([
  'NOT_FOUND',
  'NOT_AUTHENTICATED',
  'UNSUPPORTED_VERSION',
]);

interface GatewaySlotArmDeps {
  readonly cli: CliName;
  /** The CLI's subprocess adapter; undefined when its binary is not on PATH. */
  readonly cliAdapter: ICliAdapter | undefined;
  /** The family gateway model serving the slot when the CLI does not. */
  readonly gatewayModel: IModelAdapter;
  readonly isAvailable: SlotAvailability;
}

class GatewaySlotArm implements ICliAdapter {
  readonly name: CliName;
  private readonly gatewayAdapter: ICliAdapter;
  private resolved: ICliAdapter | undefined;
  private resolving: Promise<ICliAdapter> | undefined;
  private freshProbe = false;

  constructor(private readonly deps: GatewaySlotArmDeps) {
    this.name = deps.cli;
    this.gatewayAdapter = createModelToCliAdapter(
      createGatewaySlotAdapter(deps.cli, deps.gatewayModel),
      { name: deps.cli, capabilities: buildCliCapabilityProfiles()[deps.cli] }
    );
    if (deps.cliAdapter === undefined) this.resolved = this.gatewayAdapter;
  }

  /** What serves this arm now: the gateway, or `undefined` for the CLI or an undecided arm. */
  get gatewayServedSlot(): GatewayServedSlot | undefined {
    if (this.resolved !== this.gatewayAdapter) return undefined;
    const arm: unknown = (this.deps.gatewayModel as { gatewayArm?: unknown }).gatewayArm;
    return {
      modelId: this.deps.gatewayModel.modelId,
      arm: typeof arm === 'string' && isEndpointArmId(arm) ? arm : undefined,
    };
  }

  private get current(): ICliAdapter {
    return this.resolved ?? this.deps.cliAdapter ?? this.gatewayAdapter;
  }

  get transport(): CliTransport {
    return this.current.transport;
  }

  get capabilities(): CapabilityProfile {
    return this.current.capabilities;
  }

  private target(): Promise<ICliAdapter> {
    if (this.resolved !== undefined) return Promise.resolve(this.resolved);
    const cliAdapter = this.deps.cliAdapter;
    if (cliAdapter === undefined) return Promise.resolve(this.gatewayAdapter);
    const fresh = this.freshProbe;
    this.resolving ??= this.deps.isAvailable(this.deps.cli, fresh).then((available) => {
      this.resolved = available ? cliAdapter : this.gatewayAdapter;
      this.resolving = undefined;
      this.freshProbe = false;
      return this.resolved;
    });
    return this.resolving;
  }

  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    const target = await this.target();
    const result = await target.execute(task, options);
    if (
      !result.ok &&
      target === this.deps.cliAdapter &&
      AVAILABILITY_ERRORS.has(result.error.code)
    ) {
      // Re-check on the NEXT call; this call keeps its own error (no failover).
      this.resolved = undefined;
      this.freshProbe = true;
    }
    return result;
  }

  async healthCheck(): Promise<HealthStatus> {
    return (await this.target()).healthCheck();
  }

  async getCapacity(): Promise<CapacityStatus> {
    return (await this.target()).getCapacity();
  }

  async getVersion(): Promise<string> {
    return (await this.target()).getVersion();
  }

  getModelInfo(): ModelInfo {
    return this.current.getModelInfo();
  }

  async initialize(): Promise<void> {
    await (await this.target()).initialize();
  }

  async dispose(): Promise<void> {
    await this.deps.cliAdapter?.dispose();
    await this.gatewayAdapter.dispose();
  }
}

/**
 * The gateway serving `adapter` when it is a gateway-mode slot arm that a
 * gateway model serves right now; otherwise `undefined`.
 */
export function gatewayServedSlotOf(adapter: unknown): GatewayServedSlot | undefined {
  return adapter instanceof GatewaySlotArm ? adapter.gatewayServedSlot : undefined;
}

/**
 * The router arm for a vendor slot in gateway mode (#6604), or what to do
 * instead. `undefined` keeps the plain subprocess arm: no gateway catalogue
 * (the pre-#6604 path, unchanged), or a gateway without this family while the
 * binary is installed (the CLI may still serve it). `'unavailable'` is no arm:
 * no binary and no family model, exactly like a disabled CLI.
 */
export function buildGatewaySlotRouterArm(
  cli: CliName,
  createCli: () => ICliAdapter,
  isAvailable: SlotAvailability,
  logger?: ILogger
): ICliAdapter | 'unavailable' | undefined {
  const slot = resolveGatewaySlot(cli, process.env, logger);
  if (slot.kind === 'inactive') return undefined;
  const onPath = isCliBinaryOnPath(cli);
  if (slot.kind === 'unavailable') return onPath ? undefined : 'unavailable';
  return new GatewaySlotArm({
    cli,
    cliAdapter: onPath ? createCli() : undefined,
    gatewayModel: slot.adapter,
    isAvailable,
  });
}
