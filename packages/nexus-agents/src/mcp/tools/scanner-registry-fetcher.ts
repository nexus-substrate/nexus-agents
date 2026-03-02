/**
 * nexus-agents/mcp - Scanner Registry Fetcher
 *
 * Fetches the scanner-registry.json manifest from the
 * vulnerability-scanner-registry GitHub Releases at runtime.
 * Uses a TTL cache and falls back to embedded data on failure.
 *
 * @module mcp/tools/scanner-registry-fetcher
 * (Source: Consensus vote — externalize scanner registry, 6-0 unanimous)
 */

import { z } from 'zod';
import { createLogger } from '../../core/index.js';

// ============================================================================
// Types
// ============================================================================

/** A scanner entry from the registry manifest. */
export interface RegistryScanner {
  readonly name: string;
  readonly displayName: string;
  readonly categories: readonly string[];
  readonly license: string;
  readonly pricingModel: string;
  readonly relationships?: readonly RegistryRelationship[] | undefined;
}

/** A relationship edge between scanners. */
export interface RegistryRelationship {
  readonly target: string;
  readonly type: 'uses' | 'supersedes' | 'bundles' | 'competes-with';
}

/** Language matrix: category → scanner names. */
export interface LanguageMatrixEntry {
  readonly sast?: readonly string[] | undefined;
  readonly sca?: readonly string[] | undefined;
  readonly secrets?: readonly string[] | undefined;
  readonly container?: readonly string[] | undefined;
  readonly iac?: readonly string[] | undefined;
  readonly dast?: readonly string[] | undefined;
}

/** The full registry manifest shape. */
export interface ScannerRegistryManifest {
  readonly version: string;
  readonly generatedAt: string;
  readonly scanners: readonly RegistryScanner[];
  readonly languageMatrix: Readonly<Record<string, LanguageMatrixEntry>>;
}

// ============================================================================
// Zod Schema for Validation
// ============================================================================

const RelationshipSchema = z.object({
  target: z.string().min(1),
  type: z.enum(['uses', 'supersedes', 'bundles', 'competes-with']),
});

const ScannerSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  categories: z.array(z.string().min(1)),
  license: z.string().min(1),
  pricingModel: z.string().min(1),
  relationships: z.array(RelationshipSchema).optional(),
});

const LanguageMatrixEntrySchema = z
  .object({
    sast: z.array(z.string()).optional(),
    sca: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
    container: z.array(z.string()).optional(),
    iac: z.array(z.string()).optional(),
    dast: z.array(z.string()).optional(),
  })
  .passthrough();

const ManifestSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.string().min(1),
  scanners: z.array(ScannerSchema),
  languageMatrix: z.record(z.string().max(50), LanguageMatrixEntrySchema),
});

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  manifest: ScannerRegistryManifest;
  fetchedAt: number;
  releaseTag: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cachedEntry: CacheEntry | null = null;

/** Clear the cache (for testing). */
export function clearRegistryCache(): void {
  cachedEntry = null;
}

// ============================================================================
// Fetcher
// ============================================================================

const REGISTRY_REPO = 'williamzujkowski/vulnerability-scanner-registry';
const FETCH_TIMEOUT_MS = 10_000;

/** Promisified execFile signature used by fetcher helpers. */
type ExecFileAsync = (
  file: string,
  args: readonly string[],
  options: { timeout?: number; maxBuffer?: number }
) => Promise<{ stdout: string; stderr: string }>;

const logger = createLogger({ component: 'scanner-registry-fetcher' });

/** Get the latest release tag name (lightweight check, no download). */
async function getLatestReleaseTag(execFileAsync: ExecFileAsync): Promise<string | null> {
  const { stdout } = await execFileAsync(
    'gh',
    ['release', 'view', '--repo', REGISTRY_REPO, '--json', 'tagName', '--jq', '.tagName'],
    { timeout: FETCH_TIMEOUT_MS }
  );
  return stdout.trim() || null;
}

/** Download and parse the full manifest. */
async function downloadManifest(
  execFileAsync: ExecFileAsync
): Promise<ScannerRegistryManifest | null> {
  const { stdout } = await execFileAsync(
    'gh',
    [
      'release',
      'download',
      '--repo',
      REGISTRY_REPO,
      '--pattern',
      'scanner-registry.json',
      '--output',
      '-',
    ],
    { timeout: FETCH_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
  );

  let jsonData: unknown;
  try {
    jsonData = JSON.parse(stdout);
  } catch {
    logger.warn('Registry manifest is not valid JSON', {
      stdoutLength: stdout.length,
      preview: stdout.slice(0, 100),
    });
    return null;
  }

  const parsed = ManifestSchema.safeParse(jsonData);
  if (!parsed.success) {
    logger.warn('Registry manifest failed schema validation', {
      errors: parsed.error.issues.slice(0, 3),
    });
    return null;
  }

  logger.info('Fetched scanner registry manifest', {
    version: parsed.data.version,
    scanners: parsed.data.scanners.length,
    languages: Object.keys(parsed.data.languageMatrix).length,
  });
  return parsed.data;
}

/**
 * Fetch the scanner registry manifest from GitHub Releases.
 * If we have a cached version and the release tag hasn't changed,
 * just refreshes the cache timer (no download).
 */
async function fetchManifestFromGitHub(): Promise<ScannerRegistryManifest | null> {
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    const tag = await getLatestReleaseTag(execFileAsync);
    if (tag === null) {
      logger.warn('No releases found in scanner registry');
      return null;
    }

    // If cached version matches the latest tag, refresh timer only
    if (cachedEntry !== null && cachedEntry.releaseTag === tag) {
      logger.debug('Scanner registry unchanged, refreshing cache timer', { tag });
      cachedEntry = { ...cachedEntry, fetchedAt: Date.now() };
      return cachedEntry.manifest;
    }

    // New release — download full manifest
    const manifest = await downloadManifest(execFileAsync);
    if (manifest !== null) {
      cachedEntry = { manifest, fetchedAt: Date.now(), releaseTag: tag };
    }
    return manifest;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('Failed to fetch scanner registry', { error: msg });
    return null;
  }
}

/**
 * Get the scanner registry, fetching from GitHub if cache is stale.
 * Returns null if no cached data and fetch fails.
 */
export async function getRegistryManifest(): Promise<ScannerRegistryManifest | null> {
  // Check cache
  if (cachedEntry !== null) {
    const age = Date.now() - cachedEntry.fetchedAt;
    if (age < CACHE_TTL_MS) {
      return cachedEntry.manifest;
    }
  }

  // Fetch fresh (also handles cache-refresh-only when tag unchanged)
  const manifest = await fetchManifestFromGitHub();
  if (manifest !== null) {
    return manifest;
  }

  // Return stale cache if available
  if (cachedEntry !== null) {
    logger.warn('Using stale cached registry manifest');
    return cachedEntry.manifest;
  }

  return null;
}

/**
 * Extract scanners from manifest into the format expected by plan builder.
 */
export function extractScannerEntries(
  manifest: ScannerRegistryManifest
): readonly RegistryScanner[] {
  return manifest.scanners;
}

/**
 * Extract language matrix, normalizing to consistent category keys.
 */
export function extractLanguageMatrix(
  manifest: ScannerRegistryManifest
): Readonly<Record<string, LanguageMatrixEntry>> {
  return manifest.languageMatrix;
}
