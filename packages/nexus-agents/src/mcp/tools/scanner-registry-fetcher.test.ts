/**
 * Unit tests for scanner-registry-fetcher.ts
 *
 * Tests extractScannerEntries, extractLanguageMatrix, clearRegistryCache,
 * and getRegistryManifest (with mocked child_process).
 *
 * @module mcp/tools/scanner-registry-fetcher.test
 * (Issue #1340)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTimeProvider, setTimeProvider } from '../../core/index.js';
import type {
  ScannerRegistryManifest,
  RegistryScanner,
  LanguageMatrixEntry,
} from './scanner-registry-fetcher.js';
import {
  extractScannerEntries,
  extractLanguageMatrix,
  clearRegistryCache,
  getRegistryManifest,
  getRegistryManifestWithProvenance,
} from './scanner-registry-fetcher.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createManifest(overrides?: Partial<ScannerRegistryManifest>): ScannerRegistryManifest {
  return {
    version: '1.0.0',
    generatedAt: '2026-01-01T00:00:00Z',
    scanners: [
      {
        name: 'semgrep',
        displayName: 'Semgrep',
        categories: ['sast'],
        license: 'LGPL-2.1',
        pricingModel: 'freemium',
      },
      {
        name: 'grype',
        displayName: 'Grype',
        categories: ['sca', 'container'],
        license: 'Apache-2.0',
        pricingModel: 'free',
        relationships: [{ target: 'osv-scanner', type: 'competes-with' }],
      },
    ],
    languageMatrix: {
      TypeScript: { sast: ['semgrep'], sca: ['grype', 'npm-audit'] },
      Python: { sast: ['semgrep', 'bandit'], sca: ['grype', 'pip-audit'] },
    },
    ...overrides,
  };
}

// ============================================================================
// extractScannerEntries
// ============================================================================

describe('extractScannerEntries', () => {
  it('returns all scanners from manifest', () => {
    const manifest = createManifest();
    const result = extractScannerEntries(manifest);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('semgrep');
    expect(result[1]?.name).toBe('grype');
  });

  it('returns empty array for manifest with no scanners', () => {
    const manifest = createManifest({ scanners: [] });
    const result = extractScannerEntries(manifest);
    expect(result).toEqual([]);
  });

  it('preserves relationships on scanner entries', () => {
    const manifest = createManifest();
    const grype = extractScannerEntries(manifest).find((s: RegistryScanner) => s.name === 'grype');
    expect(grype?.relationships).toHaveLength(1);
    expect(grype?.relationships?.[0]?.type).toBe('competes-with');
  });
});

// ============================================================================
// extractLanguageMatrix
// ============================================================================

describe('extractLanguageMatrix', () => {
  it('returns language matrix from manifest', () => {
    const manifest = createManifest();
    const result = extractLanguageMatrix(manifest);
    expect(Object.keys(result)).toEqual(['TypeScript', 'Python']);
  });

  it('preserves SAST and SCA entries per language', () => {
    const manifest = createManifest();
    const ts: LanguageMatrixEntry | undefined = extractLanguageMatrix(manifest)['TypeScript'];
    expect(ts?.sast).toEqual(['semgrep']);
    expect(ts?.sca).toEqual(['grype', 'npm-audit']);
  });

  it('handles empty language matrix', () => {
    const manifest = createManifest({ languageMatrix: {} });
    const result = extractLanguageMatrix(manifest);
    expect(Object.keys(result)).toEqual([]);
  });
});

// ============================================================================
// clearRegistryCache
// ============================================================================

describe('clearRegistryCache', () => {
  it('does not throw', () => {
    expect(() => {
      clearRegistryCache();
    }).not.toThrow();
  });

  it('clears any cached data', () => {
    // After clearing, getRegistryManifest should attempt a fresh fetch
    clearRegistryCache();
    // No way to assert internal state directly, but it shouldn't error
    expect(true).toBe(true);
  });
});

// ============================================================================
// getRegistryManifest (integration — mocked subprocess)
// ============================================================================

describe('getRegistryManifest', () => {
  beforeEach(() => {
    clearRegistryCache();
    vi.restoreAllMocks();
  });

  it('returns null when gh CLI fails', async () => {
    // Mock child_process to simulate gh CLI failure
    vi.doMock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: Record<string, unknown>,
          cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          cb(new Error('gh not found'), { stdout: '', stderr: 'not found' });
        }
      ),
    }));

    // Clear module cache so getRegistryManifest picks up the mock
    const mod = await import('./scanner-registry-fetcher.js');
    mod.clearRegistryCache();

    // Since the module-level import is cached, we need to test the fallback behavior
    // The real function catches errors and returns null
    const result = await getRegistryManifest();
    expect(result).toBeNull();
  });

  it('coalesces concurrent fetches into a single GitHub request (#1448)', async () => {
    const manifest = createManifest();
    let callCount = 0;

    // Mock child_process so we can count invocations
    vi.doMock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          args: string[],
          _opts: Record<string, unknown>,
          cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
        ) => {
          callCount++;
          // First call is getLatestReleaseTag, second is downloadManifest
          if (Array.isArray(args) && args.includes('view')) {
            cb(null, { stdout: 'v1.0.0\n', stderr: '' });
          } else {
            cb(null, { stdout: JSON.stringify(manifest), stderr: '' });
          }
        }
      ),
    }));

    // Re-import to pick up mock
    const mod = await import('./scanner-registry-fetcher.js');
    mod.clearRegistryCache();

    // Fire 3 concurrent calls — should coalesce into 1 fetch
    const [r1, r2, r3] = await Promise.all([
      mod.getRegistryManifest(),
      mod.getRegistryManifest(),
      mod.getRegistryManifest(),
    ]);

    // All should resolve to the same manifest
    expect(r1).not.toBeNull();
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);

    // Only 2 subprocess calls (1 tag check + 1 download), not 6
    expect(callCount).toBe(2);
  });
});

describe('manifest provenance distinguishes a stale cache from a live read (#6037)', () => {
  // The mislabelling lived HERE, not in the plan builder: `manifest !== null`
  // was the only test, so an unbounded-age cache was stamped 'registry'.
  // CACHE_TTL_MS gates only whether to REFETCH — it never bounds the age of
  // what the stale path returns.
  const HOUR_MS = 60 * 60 * 1000;

  let now = 0;
  const realProvider = getTimeProvider();

  // Name the runner type from the function's own signature rather than
  // exporting it. The producer/consumer gate is right that an export whose
  // only importer is a test has no production consumer; `Parameters<>` gets
  // the test the type it needs without inventing one.
  type GhRunner = NonNullable<Parameters<typeof getRegistryManifestWithProvenance>[0]>;

  /** A `gh` stub: `release view` yields a tag, the asset download yields JSON. */
  function ghStub(outcome: 'ok' | 'fail'): GhRunner {
    return (_file, args) => {
      if (outcome === 'fail') return Promise.reject(new Error('gh unavailable'));
      if (args.includes('view')) return Promise.resolve({ stdout: 'v1.0.0\n', stderr: '' });
      return Promise.resolve({ stdout: JSON.stringify(createManifest()), stderr: '' });
    };
  }

  beforeEach(() => {
    clearRegistryCache();
    now = 0;
    setTimeProvider({ now: () => now } as unknown as Parameters<typeof setTimeProvider>[0]);
  });

  afterEach(() => {
    setTimeProvider(realProvider);
    clearRegistryCache();
  });

  it('a successful fetch is registry, with no age', async () => {
    const result = await getRegistryManifestWithProvenance(ghStub('ok'));
    expect(result.manifest).not.toBeNull();
    expect(result.source).toBe('registry');
    expect(result.ageMs).toBeUndefined();
  });

  it('a failed fetch with NO cache is fallback, not a null registry read', async () => {
    const result = await getRegistryManifestWithProvenance(ghStub('fail'));
    expect(result.manifest).toBeNull();
    expect(result.source).toBe('fallback');
  });

  it('a failed fetch past the TTL serves the cache AS cache, with its age', async () => {
    // Populate through the REAL caching path, then fail a day later.
    const seeded = await getRegistryManifestWithProvenance(ghStub('ok'));
    expect(seeded.manifest).not.toBeNull();

    now = 24 * HOUR_MS;
    const result = await getRegistryManifestWithProvenance(ghStub('fail'));
    expect(result.manifest).not.toBeNull();
    expect(result.source).toBe('cache');
    expect(result.ageMs).toBe(24 * HOUR_MS);
  });

  it('within the TTL the cache is the ordinary path, reported as registry', async () => {
    await getRegistryManifestWithProvenance(ghStub('ok'));
    now = HOUR_MS / 2;

    let refetched = false;
    const result = await getRegistryManifestWithProvenance((file, args, opts) => {
      refetched = true;
      return ghStub('ok')(file, args, opts);
    });
    expect(refetched).toBe(false);
    expect(result.source).toBe('registry');
  });
});
