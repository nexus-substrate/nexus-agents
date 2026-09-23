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
  { readonly state: 'allowed'; readonly host: string } | GatewayHostRefused;

const REMEDY =
  `Set ${CUSTOM_API_ALLOW_PRIVATE_ENV}=1 if the gateway runs on a trusted internal host, ` +
  'then restart the server.';

/**
 * Run the private-address guard against `baseUrl`'s host. The guard fails
 * OPEN on a DNS error (a flaky resolver must not break a legitimate gateway),
 * so `allowed` means "not refused", not "reachable".
 */
export async function checkGatewayHost(baseUrl: string): Promise<GatewayHostStatus> {
  const host = hostnameOf(baseUrl);
  const guard = await assertCustomApiHostResolvesPublic(host);
  if (guard.ok) return { state: 'allowed', host };
  return { state: 'refused_private_host', host, reason: guard.error.message, remedy: REMEDY };
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
