/**
 * The router arm for a vendor slot in gateway mode (#6604).
 *
 * The arm keeps the SLOT key and serves the slot from one of two targets: the
 * CLI's subprocess adapter or the slot's family gateway model. Which one is
 * decided by the predicate `createAutoAdapter` uses, `isCliAvailable` (health
 * AND auth), so the router and the registry agree on a logged-out CLI.
 *
 * - No binary on PATH, or the CLI disabled by `NEXUS_DISABLED_CLIS` (#6720):
 *   the gateway target, outright. The CLI adapter is not constructed.
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
import { isCliName, isEndpointArmId } from './types.js';
import type { ILogger, IModelAdapter, Result } from '../core/index.js';
import {
  createGatewaySlotAdapter,
  resolveGatewaySlot,
  type GatewaySlotResolution,
} from '../adapters/gateway-family-slots.js';
import { isCliDisabled } from './disabled-clis.js';
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

  /** The CLI's subprocess adapter; undefined when its binary is not on PATH. */
  get cliBinaryAdapter(): ICliAdapter | undefined {
    return this.deps.cliAdapter;
  }

  /** Make an undecided arm decide its target (the availability predicate; no completion). */
  async decide(): Promise<void> {
    await this.target();
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

  /**
   * Whether this arm enforces read-only analysis mode (#6768). Either target
   * can serve a call, so the arm declares enforcement only when BOTH do: the
   * gateway target always does (it runs nothing on the host), and the CLI
   * target, when there is one, must declare it itself.
   */
  get enforcesReadOnlyAnalysis(): boolean {
    const cliEnforces =
      this.deps.cliAdapter === undefined || this.deps.cliAdapter.enforcesReadOnlyAnalysis === true;
    return cliEnforces && this.gatewayAdapter.enforcesReadOnlyAnalysis === true;
  }

  /** Whether this arm enforces workspace-edit mode (#6792); composed the same way. */
  get enforcesWorkspaceEdit(): boolean {
    const cliEnforces =
      this.deps.cliAdapter === undefined || this.deps.cliAdapter.enforcesWorkspaceEdit === true;
    return cliEnforces && this.gatewayAdapter.enforcesWorkspaceEdit === true;
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
 * The CLI binary's own adapter behind `adapter`, for a check that measures the
 * CLI rather than the slot (#6782). A gateway slot arm answers `healthCheck`
 * from whichever target it picks, so `doctor`'s CLI list credited a CLI with
 * the gateway model's health. For a gateway slot arm this is its CLI adapter,
 * or `undefined` when the binary is not on PATH; any other adapter IS the CLI.
 */
export function cliBinaryAdapterOf(adapter: ICliAdapter): ICliAdapter | undefined {
  return adapter instanceof GatewaySlotArm ? adapter.cliBinaryAdapter : adapter;
}

/**
 * {@link gatewayServedSlotOf} after an undecided arm has decided, so the
 * answer names the target the NEXT call goes to. The synchronous read returns
 * `undefined` for an undecided arm, which `doctor --live` read as "the CLI
 * serves" while its probe then went to the gateway (#6781).
 */
export async function resolveGatewayServedSlot(
  adapter: unknown
): Promise<GatewayServedSlot | undefined> {
  if (!(adapter instanceof GatewaySlotArm)) return undefined;
  await adapter.decide();
  return adapter.gatewayServedSlot;
}

/**
 * How a vendor slot is served (#6720): the ONE decision the router arm
 * ({@link buildGatewaySlotRouterArm}) and `doctor --gateway` both read.
 *
 * - `cli`: the plain subprocess arm.
 * - `cli-or-gateway`: the binary is installed and the gateway has a family
 *   model; the availability probe decides on first use (#6604).
 * - `gateway`: the family gateway model, outright.
 * - `unavailable`: no arm.
 */
type SlotServing = 'cli' | 'cli-or-gateway' | 'gateway' | 'unavailable';

/** What {@link decideSlotServing} needs to know about one slot. */
interface SlotServingInput {
  /** Disabled by `NEXUS_DISABLED_CLIS`. */
  readonly disabled: boolean;
  /** The CLI's binary is installed. Never consulted for a disabled CLI. */
  readonly onPath: () => boolean;
  /** The gateway's answer for the slot's family; `inactive` = no gateway catalogue. */
  readonly gateway: GatewaySlotResolution['kind'];
}

/**
 * The serving decision for one slot. `NEXUS_DISABLED_CLIS` is
 * TRANSPORT-scoped (#6720, panel option A): a disabled CLI is treated as
 * "CLI not available", so its family's gateway model still serves the slot.
 * Without a gateway catalogue a disabled CLI has no arm (the #6590
 * behaviour); an enabled one keeps its subprocess arm whether or not the
 * binary exists (the pre-#6604 path).
 */
export function decideSlotServing(input: SlotServingInput): SlotServing {
  if (input.gateway === 'inactive') return input.disabled ? 'unavailable' : 'cli';
  // A disabled binary is never looked up, spawned or probed.
  const cliUsable = !input.disabled && input.onPath();
  if (input.gateway === 'unavailable') return cliUsable ? 'cli' : 'unavailable';
  return cliUsable ? 'cli-or-gateway' : 'gateway';
}

/**
 * Whether `cli` is disabled by `NEXUS_DISABLED_CLIS` AND its slot has no arm
 * because the gateway does not serve its family (#6720). The sites that name
 * a slot without building its arm (the expert fallback chain,
 * `delegate_to_model` scoring) exclude exactly these, so they never name a
 * slot the router and the registry cannot serve. A name that is not a CLI is
 * never excluded.
 */
export function isDisabledSlotUnserved(cli: string | undefined): boolean {
  if (cli === undefined || !isCliName(cli) || !isCliDisabled(cli)) return false;
  const serving = decideSlotServing({
    disabled: true,
    onPath: () => false,
    gateway: resolveGatewaySlot(cli).kind,
  });
  return serving === 'unavailable';
}

/**
 * The router arm for a vendor slot, or what to do instead. `undefined` keeps
 * the plain subprocess arm: no gateway catalogue (the pre-#6604 path,
 * unchanged), or a gateway without this family while the binary is installed
 * (the CLI may still serve it). `'unavailable'` is no arm: a CLI disabled by
 * `NEXUS_DISABLED_CLIS` or missing, whose family the gateway does not serve.
 * A disabled CLI whose family the gateway DOES serve is served by the gateway
 * (#6720), and its subprocess adapter is never constructed.
 */
export function buildGatewaySlotRouterArm(
  cli: CliName,
  createCli: () => ICliAdapter,
  isAvailable: SlotAvailability,
  logger?: ILogger
): ICliAdapter | 'unavailable' | undefined {
  const slot = resolveGatewaySlot(cli, process.env, logger);
  const serving = decideSlotServing({
    disabled: isCliDisabled(cli),
    onPath: () => isCliBinaryOnPath(cli),
    gateway: slot.kind,
  });
  if (serving === 'unavailable') return 'unavailable';
  if (serving === 'cli' || slot.kind !== 'resolved') return undefined;
  return new GatewaySlotArm({
    cli,
    cliAdapter: serving === 'cli-or-gateway' ? createCli() : undefined,
    gatewayModel: slot.adapter,
    isAvailable,
  });
}
