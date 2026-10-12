/**
 * Tests for scripts/sync-models-dev.ts (#7072).
 *
 * Verifies SSRF protection, payload bounds, schema validation,
 * and snapshot serialization.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCatalog, serializeSnapshot } from './sync-models-dev.js';
import type { ModelsDevSnapshot } from '../packages/nexus-agents/src/config/models-dev-snapshot-loader.js';

describe('sync-models-dev fetchCatalog security bounds', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects non-HTTPS URLs before network dispatch', async () => {
    await expect(fetchCatalog('http://models.dev/api.json')).rejects.toThrow(/SSRF/i);
  });

  it('rejects loopback and private IP URLs', async () => {
    await expect(fetchCatalog('https://127.0.0.1/api.json')).rejects.toThrow(/SSRF/i);
    await expect(fetchCatalog('https://10.0.0.1/api.json')).rejects.toThrow(/SSRF/i);
  });

  it('rejects unallowed hostnames', async () => {
    await expect(fetchCatalog('https://evil-server.example.com/api.json')).rejects.toThrow(/SSRF/i);
  });

  it('rejects responses with oversized Content-Length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (h: string) => (h.toLowerCase() === 'content-length' ? '100000000' : null),
        },
      })
    );

    await expect(fetchCatalog('https://models.dev/api.json')).rejects.toThrow(/oversized/i);
  });

  it('rejects responses with invalid schema', async () => {
    const invalidJson = JSON.stringify({ notAProvider: 'invalid' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: () => Promise.resolve(new TextEncoder().encode(invalidJson).buffer),
      })
    );

    await expect(fetchCatalog('https://models.dev/api.json')).rejects.toThrow(/schema validation/i);
  });
});

describe('serializeSnapshot determinism', () => {
  it('formats snapshot as pretty JSON with trailing newline', () => {
    const snap: ModelsDevSnapshot = {
      version: 1,
      fetchedAt: '2026-10-11',
      sourceUrl: 'https://models.dev/api.json',
      entries: [],
      gatewaysByModel: {
        'claude-sonnet': ['anthropic'],
      },
    };

    const serialized = serializeSnapshot(snap);
    expect(serialized.endsWith('\n')).toBe(true);
    expect(JSON.parse(serialized)).toEqual(snap);
  });
});
