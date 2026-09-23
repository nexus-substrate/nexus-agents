/**
 * The router arm for a vendor slot in gateway mode whose CLI binary IS on
 * PATH (#6604 review, item 2).
 *
 * An installed binary is not an available CLI: `createAutoAdapter` asks
 * `isCliAvailable` (health AND auth), so a logged-out CLI is served from the
 * gateway on the registry path. The router factory is synchronous and cannot
 * ask that at construction, so this arm asks the SAME predicate on first use
 * and then commits: to the CLI's subprocess adapter when it is available,
 * otherwise to the gateway-served adapter. Without this the router kept a
 * dead subprocess arm for a slot the registry served from the gateway, and
 * both wrote outcomes under one slot key.
 *
 * This is a one-time choice, not failover: the arm never switches after it
 * has resolved, so it does not nest a second failover layer inside the router
 * (#5191). Until it resolves it reports the CLI's identity.
 *
 * @module cli-adapters/gateway-slot-arm
 */

import type {
  CapabilityProfile,
  CapacityStatus,
  CliError,
  CliName,
  CliResponse,
  CliTask,
  CliTransport,
  ExecutionOptions,
  HealthStatus,
  ICliAdapter,
  ModelInfo,
} from './types.js';
import type { ILogger, IModelAdapter, Result } from '../core/index.js';
import {
  createGatewaySlotAdapter,
  clearSlotServedByGateway,
  markSlotServedByGateway,
  resolveGatewaySlot,
} from '../adapters/gateway-family-slots.js';
import { buildCliCapabilityProfiles } from '../config/model-config-helpers.js';
import { isCliBinaryOnPath } from './cli-binary-on-path.js';
import { createModelToCliAdapter } from './model-to-cli-adapter.js';

/** What the arm needs: both candidate targets and the availability predicate. */
interface GatewaySlotArmDeps {
  readonly cli: CliName;
  /** The CLI's subprocess adapter, built once. */
  readonly cliAdapter: ICliAdapter;
  /** Builds the gateway-served adapter; called only if the CLI is unavailable. */
  readonly createGatewayAdapter: () => ICliAdapter;
  /** The shared availability predicate (`isCliAvailable`). */
  readonly isAvailable: (cli: CliName) => Promise<boolean>;
  /** Told which target the arm committed to (`'gateway'` or `'cli'`). */
  readonly onResolved: (served: 'gateway' | 'cli') => void;
}

class GatewaySlotArm implements ICliAdapter {
  readonly name: CliName;
  private resolved: ICliAdapter | undefined;
  private resolving: Promise<ICliAdapter> | undefined;

  constructor(private readonly deps: GatewaySlotArmDeps) {
    this.name = deps.cli;
  }

  get transport(): CliTransport {
    return (this.resolved ?? this.deps.cliAdapter).transport;
  }

  get capabilities(): CapabilityProfile {
    return (this.resolved ?? this.deps.cliAdapter).capabilities;
  }

  private target(): Promise<ICliAdapter> {
    if (this.resolved !== undefined) return Promise.resolve(this.resolved);
    this.resolving ??= this.deps.isAvailable(this.deps.cli).then((available) => {
      const chosen = available ? this.deps.cliAdapter : this.deps.createGatewayAdapter();
      this.resolved = chosen;
      this.deps.onResolved(available ? 'cli' : 'gateway');
      return chosen;
    });
    return this.resolving;
  }

  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    return (await this.target()).execute(task, options);
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
    return (this.resolved ?? this.deps.cliAdapter).getModelInfo();
  }

  async initialize(): Promise<void> {
    await (await this.target()).initialize();
  }

  async dispose(): Promise<void> {
    await this.deps.cliAdapter.dispose();
    if (this.resolved !== undefined && this.resolved !== this.deps.cliAdapter) {
      await this.resolved.dispose();
    }
  }
}

/** Build the arm; see the module doc. */
function createGatewaySlotArm(deps: GatewaySlotArmDeps): ICliAdapter {
  return new GatewaySlotArm(deps);
}

/** The gateway-served router arm for `cli`: its gateway model under the SLOT name. */
function gatewayServedArm(cli: CliName, model: IModelAdapter): ICliAdapter {
  return createModelToCliAdapter(createGatewaySlotAdapter(cli, model), {
    name: cli,
    capabilities: buildCliCapabilityProfiles()[cli],
  });
}

/**
 * The router arm for a vendor slot in gateway mode (#6604), or what to do
 * instead. `undefined` keeps the plain subprocess arm: no gateway catalogue
 * (the pre-#6604 path, unchanged), or a gateway without this family while the
 * binary is installed (the CLI may still serve it). `'unavailable'` is no arm:
 * no binary and no family model, exactly like a disabled CLI.
 *
 * With no binary on PATH, `isCliAvailable` cannot be true (its health check
 * runs the binary), so the gateway arm is chosen outright; with a binary, the
 * {@link createGatewaySlotArm} asks `isAvailable` on first use.
 */
export function buildGatewaySlotRouterArm(
  cli: CliName,
  createCli: () => ICliAdapter,
  isAvailable: (cli: CliName) => Promise<boolean>,
  logger?: ILogger
): ICliAdapter | 'unavailable' | undefined {
  const slot = resolveGatewaySlot(cli, process.env, logger);
  if (slot.kind === 'inactive') return undefined;
  const onPath = isCliBinaryOnPath(cli);
  if (slot.kind === 'unavailable') return onPath ? undefined : 'unavailable';
  const model = slot.adapter;
  if (!onPath) {
    markSlotServedByGateway(cli, model);
    return gatewayServedArm(cli, model);
  }
  return createGatewaySlotArm({
    cli,
    cliAdapter: createCli(),
    createGatewayAdapter: () => gatewayServedArm(cli, model),
    isAvailable,
    onResolved: (served) => {
      if (served === 'gateway') markSlotServedByGateway(cli, model);
      else clearSlotServedByGateway(cli);
    },
  });
}
