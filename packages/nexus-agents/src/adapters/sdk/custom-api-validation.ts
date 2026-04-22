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
import { ConfigError, ok, err, type Result } from '../../core/index.js';
import { CUSTOM_API_ALLOW_PRIVATE_ENV } from './types.js';

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
  const v = process.env[CUSTOM_API_ALLOW_PRIVATE_ENV];
  return v === '1' || v === 'true';
}

/**
 * Returns a rejection reason if the hostname resolves (by string form) to
 * a loopback, link-local, or RFC 1918 private address; `null` otherwise.
 *
 * Note: this is a string-level check. It does NOT perform DNS resolution,
 * so a public DNS name that secretly resolves to a private IP will pass.
 * Callers who need that level of defense should add a runtime connect
 * check and validate the socket peer address.
 */
function classifyPrivateHost(hostname: string): RejectionDetail | null {
  // URL.hostname wraps IPv6 literals in brackets (e.g. "[::1]"); strip them
  // before the net-module checks, which expect bare forms.
  const stripped =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const normalized = stripped.toLowerCase();

  // Literal IPv4 loopback or private-range address
  if (isIPv4(normalized)) {
    return classifyIPv4(normalized);
  }

  // Literal IPv6 loopback (::1), link-local (fe80::/10), unique-local (fc00::/7)
  if (isIPv6(normalized)) {
    return classifyIPv6(normalized);
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
