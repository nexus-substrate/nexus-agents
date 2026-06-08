/**
 * OSV Lookup — Query OSV.dev for known vulnerabilities (#1681 Phase 3a)
 *
 * Queries the OSV.dev REST API (no API key required) to check npm packages
 * against known CVEs. Uses existing withTimeout/withRetry infra patterns.
 *
 * @module security/osv-lookup
 */

import { z } from 'zod';
import { createLogger } from '../core/index.js';
import { NETWORK_FETCH_TIMEOUT_MS } from '../config/timeouts.js';

const logger = createLogger({ component: 'osv-lookup' });

const OSV_API_URL = 'https://api.osv.dev/v1/query';
// Runaway-guard for the OSV.dev HTTP query (#3736): was a 10s literal — too
// tight for a real fetch; centralized to the network-fetch class guard (120s).
const DEFAULT_TIMEOUT_MS = NETWORK_FETCH_TIMEOUT_MS;

// ============================================================================
// Types
// ============================================================================

export const OsvVulnerabilitySchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'UNKNOWN']).optional(),
  aliases: z.array(z.string()).default([]),
  affectedVersions: z.string().optional(),
  fixedVersion: z.string().optional(),
  url: z.string().optional(),
});

export type OsvVulnerability = z.infer<typeof OsvVulnerabilitySchema>;

export interface OsvLookupResult {
  readonly packageName: string;
  readonly packageVersion: string;
  readonly vulnerabilities: readonly OsvVulnerability[];
  readonly error: string | null;
}

export interface OsvLookupConfig {
  /** Request timeout in ms (default: 10000). */
  readonly timeoutMs: number;
}

export const DEFAULT_OSV_CONFIG: OsvLookupConfig = {
  timeoutMs: DEFAULT_TIMEOUT_MS,
};

// ============================================================================
// OSV API Response Types
// ============================================================================

interface OsvApiVuln {
  readonly id?: string;
  readonly summary?: string;
  readonly aliases?: readonly string[];
  readonly database_specific?: { readonly severity?: string };
  readonly affected?: ReadonlyArray<{
    readonly ranges?: ReadonlyArray<{
      readonly events?: ReadonlyArray<{ readonly fixed?: string }>;
    }>;
    readonly versions?: readonly string[];
  }>;
  readonly references?: ReadonlyArray<{ readonly url?: string }>;
}

interface OsvApiResponse {
  readonly vulns?: readonly OsvApiVuln[];
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Map OSV database_specific severity to our enum.
 */
function mapSeverity(raw: string | undefined): OsvVulnerability['severity'] {
  if (raw === undefined) return 'UNKNOWN';
  const upper = raw.toUpperCase();
  if (upper === 'CRITICAL') return 'CRITICAL';
  if (upper === 'HIGH') return 'HIGH';
  if (upper === 'MODERATE' || upper === 'MEDIUM') return 'MODERATE';
  if (upper === 'LOW') return 'LOW';
  return 'UNKNOWN';
}

/**
 * Extract the first fixed version from an OSV vulnerability.
 */
function extractFixedVersion(vuln: OsvApiVuln): string | undefined {
  for (const affected of vuln.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed !== undefined) return event.fixed;
      }
    }
  }
  return undefined;
}

/**
 * Extract affected version range description.
 */
function extractAffectedVersions(vuln: OsvApiVuln): string | undefined {
  const versions = vuln.affected?.[0]?.versions;
  if (versions !== undefined && versions.length > 0) {
    return versions.length <= 3
      ? versions.join(', ')
      : `${String(versions[0])} ... ${String(versions[versions.length - 1])} (${String(versions.length)} versions)`;
  }
  return undefined;
}

/**
 * Normalize an OSV API vulnerability to our schema.
 */
function normalizeVuln(vuln: OsvApiVuln): OsvVulnerability {
  return {
    id: vuln.id ?? 'unknown',
    summary: vuln.summary,
    severity: mapSeverity(vuln.database_specific?.severity),
    aliases: [...(vuln.aliases ?? [])],
    affectedVersions: extractAffectedVersions(vuln),
    fixedVersion: extractFixedVersion(vuln),
    url: vuln.references?.[0]?.url,
  };
}

/**
 * Query OSV.dev for vulnerabilities affecting an npm package.
 *
 * @param packageName - npm package name (e.g., 'lodash')
 * @param packageVersion - Package version (e.g., '4.17.20')
 * @param config - Lookup configuration
 * @returns Lookup result with vulnerabilities or error
 */
export async function queryOsv(
  packageName: string,
  packageVersion: string,
  config: OsvLookupConfig = DEFAULT_OSV_CONFIG
): Promise<OsvLookupResult> {
  const body = JSON.stringify({
    version: packageVersion,
    package: { name: packageName, ecosystem: 'npm' },
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, config.timeoutMs);

    const response = await fetch(OSV_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      logger.warn('OSV API error', { status: response.status, body: text.slice(0, 200) });
      return {
        packageName,
        packageVersion,
        vulnerabilities: [],
        error: `HTTP ${String(response.status)}`,
      };
    }

    const data = (await response.json()) as OsvApiResponse;
    const vulns = (data.vulns ?? []).map(normalizeVuln);

    return { packageName, packageVersion, vulnerabilities: vulns, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn('OSV lookup failed', { packageName, packageVersion, error: msg });
    return { packageName, packageVersion, vulnerabilities: [], error: msg };
  }
}

/**
 * Query OSV for multiple packages in batch.
 *
 * @param packages - Array of {name, version} pairs
 * @param config - Lookup configuration
 * @returns Array of lookup results
 */
export async function queryOsvBatch(
  packages: ReadonlyArray<{ name: string; version: string }>,
  config: OsvLookupConfig = DEFAULT_OSV_CONFIG
): Promise<OsvLookupResult[]> {
  const results: OsvLookupResult[] = [];
  for (const pkg of packages) {
    const result = await queryOsv(pkg.name, pkg.version, config);
    results.push(result);
  }
  return results;
}
