/**
 * Lazy gateway re-discovery (#6608 item 4).
 *
 * Discovery runs once at startup. A gateway that was down at boot used to
 * leave the process on CLI subprocesses for its whole life. When the boot
 * probe fails for a reason that can clear on its own (unreachable, error
 * status, zero models), the bootstrap hands the tools an EMPTY, live adapter
 * list and arms a {@link GatewayRediscovery}; the first gateway-needing call
 * after the backoff re-runs discovery and fills that list in place, so every
 * holder of the reference sees the gateway from then on.
 *
 * Bounds, by construction: never at startup (the boot attempt is the first
 * attempt, and the clock starts there); at most one attempt per
 * {@link GATEWAY_REDISCOVERY_INTERVAL_MS}; concurrent callers share one
 * in-flight attempt; nothing retries on a timer, so an idle process makes no
 * calls; and once the list is filled, the check is a length test.
 *
 * @module adapters/gateway-rediscovery
 */

import type { ILogger, IModelAdapter } from '../core/index.js';
import { getErrorMessage, getTimeProvider } from '../core/index.js';

/** Minimum spacing between discovery attempts, the boot attempt included. */
const GATEWAY_REDISCOVERY_INTERVAL_MS = 60_000;

export interface GatewayRediscoveryOptions {
  /** The live list the tools hold. Filled in place on success; never replaced. */
  readonly target: IModelAdapter[];
  /** One discovery attempt: the adapters, or `undefined` when it failed (already logged). */
  readonly discover: () => Promise<readonly IModelAdapter[] | undefined>;
  /** Runs once, after the target is filled — the bootstrap registers the arm here. */
  readonly onDiscovered?: (adapters: readonly IModelAdapter[]) => void;
  readonly logger: ILogger;
  readonly minIntervalMs?: number;
  /** When the last attempt ran; defaults to now (the boot attempt just failed). */
  readonly lastAttemptAt?: number;
}

export class GatewayRediscovery {
  private readonly minIntervalMs: number;
  private lastAttemptAt: number;
  private inFlight: Promise<void> | undefined;

  constructor(private readonly options: GatewayRediscoveryOptions) {
    this.minIntervalMs = options.minIntervalMs ?? GATEWAY_REDISCOVERY_INTERVAL_MS;
    this.lastAttemptAt = options.lastAttemptAt ?? getTimeProvider().now();
  }

  /**
   * Re-run discovery if the gateway is still missing and the backoff allows.
   * Never rejects: a failed attempt is logged and the caller proceeds on
   * whatever the list holds (empty means the CLI path, as at boot).
   */
  ensure(): Promise<void> {
    if (this.options.target.length > 0) return Promise.resolve();
    if (this.inFlight !== undefined) return this.inFlight;
    const now = getTimeProvider().now();
    if (now - this.lastAttemptAt < this.minIntervalMs) return Promise.resolve();
    this.lastAttemptAt = now;
    this.inFlight = this.attempt().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async attempt(): Promise<void> {
    const { logger, target } = this.options;
    let found: readonly IModelAdapter[] | undefined;
    try {
      found = await this.options.discover();
    } catch (error: unknown) {
      logger.warn('Gateway re-discovery threw; calls stay on CLI subprocesses', {
        error: getErrorMessage(error),
      });
      return;
    }
    if (found === undefined || found.length === 0) {
      logger.warn(
        `Gateway re-discovery found no usable gateway; calls stay on CLI subprocesses. ` +
          `Next attempt no sooner than ${String(Math.round(this.minIntervalMs / 1000))} s, on the next gateway call.`
      );
      return;
    }
    target.push(...found);
    logger.info('OpenAI-compatible gateway re-discovered; gateway calls now go in-process', {
      modelCount: found.length,
    });
    this.options.onDiscovered?.(found);
  }
}

let active: GatewayRediscovery | undefined;

/** Install (or with `undefined`, clear) the process's re-discovery. Set by the bootstrap. */
export function setGatewayRediscovery(rediscovery: GatewayRediscovery | undefined): void {
  active = rediscovery;
}

/**
 * Called on the gateway-needing paths before they read the adapter list. A
 * no-op when no re-discovery is armed: no gateway configured, it wired at
 * boot, or it was refused for a reason retrying cannot fix.
 */
export async function ensureGatewayDiscovered(): Promise<void> {
  await active?.ensure();
}
