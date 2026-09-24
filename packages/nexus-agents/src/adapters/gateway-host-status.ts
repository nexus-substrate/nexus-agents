/**
 * Whether the private-address guard lets the gateway's host through (#6608
 * item 3), as a value a report surface can read.
 *
 * A corporate gateway commonly resolves to a 10.x address, which the SSRF
 * guard refuses unless `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1`. Outside a sandbox
 * that used to surface as a generic "probe failed" warn line while the server
 * quietly fell back to CLI subprocesses. {@link checkGatewayHost} is the one
 * place the refusal and its remedy are phrased; discovery refuses with
 * {@link GatewayHostRefusedError}, the bootstrap reports it by name, and
 * `doctor` can call {@link checkGatewayHost} directly (#6609).
 *
 * @module adapters/gateway-host-status
 */

import { ConfigError } from '../core/index.js';
import { assertCustomApiHostResolvesPublic } from './sdk/custom-api-validation.js';
import { hostnameOf } from './sdk/gateway-env.js';
import { CUSTOM_API_ALLOW_PRIVATE_ENV } from './sdk/types.js';

/** The guard refused the host: the gateway is not used. */
export interface GatewayHostRefused {
  readonly state: 'refused_private_host';
  readonly host: string;
  /** The guard's classification (private, loopback, link-local, …). */
  readonly reason: string;
  /** What the operator sets to allow it; names the variable. */
  readonly remedy: string;
}

export type GatewayHostStatus =
  | { readonly state: 'allowed'; readonly host: string }
  | GatewayHostRefused
  /**
   * The guard's lookup did not answer in time. Unlike a DNS error (the
   * connection could not resolve either), the connection's own lookup may
   * still answer, with a private address, so the host is NOT allowed. Not a
   * refusal: the next attempt runs the guard again.
   */
  | { readonly state: 'lookup_timed_out'; readonly host: string };

/** The message discovery fails with on `lookup_timed_out`; lazy re-discovery retries it. */
export const GATEWAY_HOST_LOOKUP_TIMED_OUT =
  'gateway host check timed out; the gateway is not wired this attempt, will retry';

const REMEDY =
  `Set ${CUSTOM_API_ALLOW_PRIVATE_ENV}=1 if the gateway runs on a trusted internal host, ` +
  'then restart the server.';

/**
 * Run the private-address guard against `baseUrl`'s host. The guard fails
 * OPEN on a DNS error (a flaky resolver must not break a legitimate gateway),
 * so `allowed` means "not refused", not "reachable". It fails CLOSED on a
 * lookup that does not answer within the bound: `lookup_timed_out`.
 */
export async function checkGatewayHost(
  baseUrl: string,
  options: { readonly lookupTimeoutMs?: number } = {}
): Promise<GatewayHostStatus> {
  const host = hostnameOf(baseUrl);
  const guard = await withLookupTimeout(
    assertCustomApiHostResolvesPublic(host),
    options.lookupTimeoutMs ?? GATEWAY_HOST_LOOKUP_TIMEOUT_MS
  );
  if (guard === 'timed_out') return { state: 'lookup_timed_out', host };
  if (guard.ok) return { state: 'allowed', host };
  return { state: 'refused_private_host', host, reason: guard.error.message, remedy: REMEDY };
}

/**
 * Upper bound on the guard's DNS lookup (#6671 review). `dns.lookup` has no
 * timeout of its own, and discovery (at boot and on lazy re-discovery) runs
 * the guard before its bounded HTTP request, so an unresponsive resolver
 * would otherwise hold discovery open indefinitely.
 */
const GATEWAY_HOST_LOOKUP_TIMEOUT_MS = 5_000;

async function withLookupTimeout<T>(work: Promise<T>, ms: number): Promise<T | 'timed_out'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timed_out'>((resolve) => {
    timer = setTimeout(() => {
      resolve('timed_out');
    }, ms);
    timer.unref();
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Discovery's refusal when {@link checkGatewayHost} says `refused_private_host`. */
export class GatewayHostRefusedError extends ConfigError {
  readonly status: GatewayHostRefused;

  constructor(status: GatewayHostRefused) {
    super(`Gateway URL rejected: ${status.reason}`);
    this.name = 'GatewayHostRefusedError';
    this.status = status;
  }
}
