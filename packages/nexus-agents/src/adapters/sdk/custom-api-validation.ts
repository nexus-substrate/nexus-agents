/**
 * Validation for the `custom-openai` SDK adapter's gateway URL.
 *
 * The base URL is user-provided, so without validation the adapter becomes
 * an SSRF vector: a malicious prompt that reshaped env vars, or a typo in
 * the config, could point nexus-agents at `http://169.254.169.254/` (AWS
 * metadata) or `http://localhost:5432/` (internal services). This module
 * rejects such URLs unless the user explicitly opts in via
 * `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1`.
 *
 * Called out in the #2119 consensus vote by the Security Engineer role.
 *
 * @module adapters/sdk/custom-api-validation
 */

import { isIPv4, isIPv6 } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { ConfigError, ok, err, createLogger, type Result } from '../../core/index.js';
import { CUSTOM_API_ALLOW_PRIVATE_ENV } from './types.js';

const logger = createLogger({ module: 'custom-api-validation' });

/**
 * Why a given URL was rejected. Machine-readable so error messages can
 * distinguish root causes in downstream tooling.
 */
export type BaseUrlRejectionReason =
  | 'empty'
  | 'not_a_url'
  | 'not_http_https'
  | 'loopback'
  | 'link_local'
  | 'private_range'
  | 'reserved';

interface RejectionDetail {
  readonly reason: BaseUrlRejectionReason;
  readonly message: string;
}

/**
 * Validates a user-provided custom-gateway base URL. Returns the URL as an
 * `ok` Result if it passes, or a `ConfigError` with a machine-readable
 * reason if it fails.
 *
 * Pass `{ allowPrivate: true }` (or set the env var) to bypass the SSRF
 * checks — use this only when the gateway is on a trusted internal host
 * and you accept the risk.
 */
export function validateCustomApiBaseUrl(
  raw: string | undefined,
  opts: { readonly allowPrivate?: boolean } = {}
): Result<URL, ConfigError> {
  if (raw === undefined || raw.trim() === '') {
    return err(
      new ConfigError(
        'Custom API base URL is required but missing. Set NEXUS_CUSTOM_API_BASE_URL or pass `baseUrl` in config.'
      )
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return err(new ConfigError(`Custom API base URL is not a valid URL: ${raw}`));
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return err(
      new ConfigError(`Custom API base URL must use http or https, got "${url.protocol}" in ${raw}`)
    );
  }

  const allowPrivate = opts.allowPrivate === true || resolveAllowPrivateFromEnv();
  if (!allowPrivate) {
    const rejection = classifyPrivateHost(url.hostname);
    if (rejection !== null) {
      return err(
        new ConfigError(
          `Custom API base URL rejected (SSRF guard, reason="${rejection.reason}"): ${rejection.message}. ` +
            `Set ${CUSTOM_API_ALLOW_PRIVATE_ENV}=1 to bypass if the gateway runs on a trusted internal host.`
        )
      );
    }
  }

  return ok(url);
}

function resolveAllowPrivateFromEnv(): boolean {
  // Deliberately strict (case-sensitive, not parseBoolEnv): this disables an
  // SSRF guard, so we don't want extra case variants (e.g. `TRUE`) to loosen
  // the control. Fail-closed on anything but exact `1`/`true` (#3297).
  const v = process.env[CUSTOM_API_ALLOW_PRIVATE_ENV];
  return v === '1' || v === 'true';
}

/**
 * Returns a rejection reason if the hostname resolves (by string form) to
 * a loopback, link-local, or RFC 1918 private address; `null` otherwise.
 *
 * Note: this is a string-level check. It does NOT perform DNS resolution,
 * so a public DNS name that secretly resolves to a private IP will pass.
 * For that level of defense, callers should additionally run
 * {@link assertCustomApiHostResolvesPublic}, which performs a DNS lookup
 * and classifies each resolved address with the same range tables below.
 */
function classifyPrivateHost(hostname: string): RejectionDetail | null {
  const normalized = normalizeHost(hostname);

  // Literal IP addresses — classify directly against the range tables.
  const literal = classifyIpAddress(normalized);
  if (literal !== 'not_an_ip') {
    return literal;
  }

  // Hostname literals that resolve to loopback without needing DNS
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') // mDNS
  ) {
    return {
      reason: 'loopback',
      message: `hostname "${hostname}" resolves to loopback/mDNS`,
    };
  }

  return null;
}

/**
 * Strips IPv6 bracket wrapping (URL.hostname yields "[::1]") and lowercases,
 * giving the bare form the `node:net` checks expect. Shared by the sync and
 * async guards so the normalization rule lives in one place.
 */
function normalizeHost(hostname: string): string {
  const stripped =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return stripped.toLowerCase();
}

/**
 * Classifies a single (already normalized, bracket-stripped) address string.
 * Returns:
 *  - a {@link RejectionDetail} if it is a private/loopback/link-local/reserved IP,
 *  - `null` if it is a public IP literal (safe),
 *  - the sentinel `'not_an_ip'` if the string is not an IP literal at all.
 *
 * This is the shared per-address classifier reused by both the sync
 * string-level guard ({@link classifyPrivateHost}) and the async
 * DNS-resolve-time guard ({@link assertCustomApiHostResolvesPublic}), so the
 * IPv4/IPv6 range tables live in exactly one place.
 */
function classifyIpAddress(normalized: string): RejectionDetail | null | 'not_an_ip' {
  if (isIPv4(normalized)) {
    return classifyIPv4(normalized);
  }
  if (isIPv6(normalized)) {
    return classifyIPv6(normalized);
  }
  return 'not_an_ip';
}

/**
 * DNS-resolve-time SSRF guard for the custom-openai gateway.
 *
 * The sync {@link validateCustomApiBaseUrl} only inspects the hostname as a
 * string, so a PUBLIC DNS name that resolves to a PRIVATE/loopback/link-local
 * IP (e.g. an attacker-controlled `gateway.evil.test` pointing at
 * `169.254.169.254`) slips past it. This function closes that gap: it resolves
 * the hostname and runs the EXISTING IP classification against every returned
 * address, failing closed if ANY of them is private.
 *
 * Behaviour:
 *  - `allowPrivate` (opt or env) → bypass, returns `ok` (matches the sync guard).
 *  - hostname is already an IP literal → no DNS needed; the sync guard already
 *    classified literals at construction, so return `ok`.
 *  - otherwise `dns.lookup(hostname, { all: true })` and classify each address.
 *    If ANY resolves private → `err(ConfigError)`.
 *  - on a `dns.lookup` THROW (transient/NXDOMAIN/network error) → log debug and
 *    return `ok`. Failing closed here is too aggressive: it would break legit
 *    gateways on a flaky resolver, and this is additive defense-in-depth layered
 *    on top of the sync string guard that already ran at construction. We only
 *    REJECT on a SUCCESSFUL resolution to a private address.
 *
 * Residual risk (TOCTOU): this is RESOLVE-time, not socket-connect-time. A name
 * that passes here could rebind to a private IP before the actual connect
 * (DNS rebinding). A full fix needs a custom `fetch` `lookup` hook validating
 * the peer address at the socket layer — out of scope for this LOW
 * defense-in-depth pass (#3426).
 */
export async function assertCustomApiHostResolvesPublic(
  hostname: string,
  opts: { readonly allowPrivate?: boolean } = {}
): Promise<Result<void, ConfigError>> {
  const allowPrivate = opts.allowPrivate === true || resolveAllowPrivateFromEnv();
  if (allowPrivate) {
    return ok(undefined);
  }

  const normalized = normalizeHost(hostname);

  // IP literals are already handled by the sync guard at construction; no DNS.
  if (isIPv4(normalized) || isIPv6(normalized)) {
    return ok(undefined);
  }

  // Only `address` is read; the resolver's `family` is intentionally NOT
  // trusted — `classifyIpAddress` re-derives v4/v6 from the address string, so
  // a mislabeled family in the lookup result cannot let a private IP slip past.
  let addresses: ReadonlyArray<{ readonly address: string }>;
  try {
    addresses = await dnsLookup(hostname, { all: true });
  } catch (error) {
    // Fail OPEN: transient/NXDOMAIN/network errors must not break legit
    // gateways. The sync string guard already ran; this is additive only.
    logger.debug('custom-api SSRF resolve check: DNS lookup failed, skipping (fail-open)', {
      hostname,
      error: error instanceof Error ? error.message : String(error),
    });
    return ok(undefined);
  }

  const rejection = firstPrivateAddress(addresses);
  if (rejection !== null) {
    return err(
      new ConfigError(
        `Custom API base URL rejected (SSRF resolve guard, reason="${rejection.reason}"): ` +
          `hostname "${hostname}" resolved to ${rejection.message}. ` +
          `Set ${CUSTOM_API_ALLOW_PRIVATE_ENV}=1 to bypass if the gateway runs on a trusted internal host.`
      )
    );
  }

  return ok(undefined);
}

/**
 * Returns the {@link RejectionDetail} for the first resolved address that
 * classifies as private/loopback/link-local/reserved, or `null` if every
 * address is public. Fail-closed: any single private hit trips the guard.
 */
function firstPrivateAddress(
  addresses: ReadonlyArray<{ readonly address: string }>
): RejectionDetail | null {
  for (const { address } of addresses) {
    const rejection = classifyIpAddress(address.toLowerCase());
    if (rejection !== null && rejection !== 'not_an_ip') {
      return rejection;
    }
  }
  return null;
}

/** IPv4 ranges the SSRF guard rejects, in order of specificity. */
const IPV4_RULES: ReadonlyArray<{
  readonly match: (a: number, b: number) => boolean;
  readonly reason: BaseUrlRejectionReason;
  readonly label: string;
}> = [
  { match: (a) => a === 127, reason: 'loopback', label: 'IPv4 loopback' },
  { match: (a) => a === 10, reason: 'private_range', label: 'IPv4 private (10/8)' },
  {
    match: (a, b) => a === 172 && b >= 16 && b <= 31,
    reason: 'private_range',
    label: 'IPv4 private (172.16/12)',
  },
  {
    match: (a, b) => a === 192 && b === 168,
    reason: 'private_range',
    label: 'IPv4 private (192.168/16)',
  },
  {
    match: (a, b) => a === 169 && b === 254,
    reason: 'link_local',
    label: 'IPv4 link-local (169.254/16 — AWS IMDS)',
  },
  { match: (a) => a === 0, reason: 'reserved', label: 'IPv4 reserved (0/8)' },
];

function classifyIPv4(ip: string): RejectionDetail | null {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [a, b] = parts as [number, number, number, number];
  for (const rule of IPV4_RULES) {
    if (rule.match(a, b)) {
      return { reason: rule.reason, message: `${rule.label} (${ip})` };
    }
  }
  return null;
}

function classifyIPv6(ip: string): RejectionDetail | null {
  const lower = ip.toLowerCase();
  if (lower === '::1') return { reason: 'loopback', message: `IPv6 loopback (${ip})` };
  if (lower.startsWith('fe80:'))
    return { reason: 'link_local', message: `IPv6 link-local (${ip})` };
  // Unique-local: fc00::/7 → first byte has high bit set and second-high bit set
  if (/^fc|^fd/.test(lower)) {
    return { reason: 'private_range', message: `IPv6 unique-local (${ip}, fc00::/7)` };
  }
  return null;
}
