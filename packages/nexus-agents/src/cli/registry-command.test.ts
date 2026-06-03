/**
 * Tests for `nexus-agents registry` CLI subcommands (#2179).
 *
 * Fully offline. `refresh` tests inject a fake fetch so no real network
 * request happens. Every filesystem write goes to a temp dir.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatRegistryUsage,
  isValidRegistrySubcommand,
  registryCommand,
} from './registry-command.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(body: string): string {
  return createHash('sha256').update(body, 'utf-8').digest('hex');
}

function makeFetchImpl(
  routes: ReadonlyMap<string, { ok: boolean; body?: string; status?: number }>
): typeof fetch {
  return vi.fn((url: string | URL | Request) => {
    const urlStr = urlToString(url);
    const entry = routes.get(urlStr);
    if (entry === undefined) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    if (!entry.ok) {
      return Promise.resolve(new Response('', { status: entry.status ?? 500 }));
    }
    return Promise.resolve(new Response(entry.body ?? '', { status: 200 }));
  });
}

function urlToString(url: string | URL | Request): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

let tempDir: string;
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'registry-cli-'));
});
afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Dispatch helpers
// ---------------------------------------------------------------------------

describe('isValidRegistrySubcommand', () => {
  it('accepts doctor and refresh', () => {
    expect(isValidRegistrySubcommand('doctor')).toBe(true);
    expect(isValidRegistrySubcommand('refresh')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidRegistrySubcommand('delete')).toBe(false);
    expect(isValidRegistrySubcommand('')).toBe(false);
    expect(isValidRegistrySubcommand(undefined)).toBe(false);
  });
});

describe('formatRegistryUsage', () => {
  it('names both subcommands and the overlay path', () => {
    const text = formatRegistryUsage();
    expect(text).toMatch(/doctor/);
    expect(text).toMatch(/refresh/);
    expect(text).toMatch(/--source/);
    expect(text).toMatch(/NEXUS_MODEL_REGISTRY_OVERLAY/);
  });
});

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

describe('registry doctor', () => {
  it('returns human-readable output by default', async () => {
    const result = await registryCommand('doctor', {});
    expect(result.exitCode).toBe(0);
    // Registry-derived per-source counts section (replaces the old four-tier view).
    expect(result.text).toMatch(/Registry entries by source/);
    expect(result.text).toMatch(/in-tree/);
    expect(result.text).toMatch(/generated/);
    expect(result.text).toMatch(/Bundled generated registry/);
    expect(result.text).toMatch(/T3 user overlay/);
    // Unknown-id fallback line carries the fail-closed 8192 default.
    expect(result.text).toMatch(/Unknown-id fallback/);
    expect(result.text).toMatch(/8192/);
  });

  it('returns JSON when --json is set', async () => {
    const result = await registryCommand('doctor', { json: true });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.text) as {
      sourceCounts: Record<string, number>;
      unknownIdFallback: { contextWindow: number };
    };
    expect(parsed.sourceCounts).toBeDefined();
    expect(typeof parsed.sourceCounts['in-tree']).toBe('number');
    expect(parsed.unknownIdFallback.contextWindow).toBe(8192);
  });

  it('counts every registry entry across sources', async () => {
    const result = await registryCommand('doctor', { json: true });
    const parsed = JSON.parse(result.text) as {
      sourceCounts: Record<string, number>;
      totalEntries: number;
    };
    const summed = Object.values(parsed.sourceCounts).reduce((a, b) => a + b, 0);
    expect(summed).toBe(parsed.totalEntries);
    expect(parsed.totalEntries).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

describe('registry refresh', () => {
  it('prints guidance when --source is omitted', async () => {
    const result = await registryCommand('refresh', {});
    expect(result.exitCode).toBe(2);
    expect(result.text).toMatch(/requires --source/);
    expect(result.text).toMatch(/#2180/);
  });

  it('fetches, SHA256-verifies, and writes to the destination', async () => {
    const body = JSON.stringify({
      version: 1,
      generatedAt: '2026-04-22T00:00:00Z',
      entryCount: 0,
      entries: [],
    });
    const sha = sha256Hex(body);
    const source = 'https://example.com/model-registry.json';
    const fetchImpl = makeFetchImpl(
      new Map([
        [source, { ok: true, body }],
        [`${source}.sha256`, { ok: true, body: sha }],
      ])
    );
    const dest = join(tempDir, 'refreshed.json');

    const result = await registryCommand('refresh', {
      source,
      fetchImpl,
      destPath: dest,
    });

    expect(result.exitCode).toBe(0);
    expect(result.text).toMatch(/verified/);
    const written = readFileSync(dest, 'utf-8');
    expect(written).toBe(body);
  });

  it('aborts on SHA256 mismatch without writing', async () => {
    const body = 'pretend this is the real artifact';
    const source = 'https://example.com/model-registry.json';
    const fetchImpl = makeFetchImpl(
      new Map([
        [source, { ok: true, body }],
        [`${source}.sha256`, { ok: true, body: 'wrong-hash' }],
      ])
    );
    const dest = join(tempDir, 'should-not-exist.json');

    const result = await registryCommand('refresh', {
      source,
      fetchImpl,
      destPath: dest,
    });

    expect(result.exitCode).toBe(1);
    expect(result.text).toMatch(/SHA256 mismatch/);
  });

  it('rejects a payload whose Content-Length exceeds the cap before reading the body (#3354)', async () => {
    const source = 'https://example.com/model-registry.json';
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response('x', {
          status: 200,
          headers: { 'content-length': String(6 * 1024 * 1024) },
        })
      )
    ) as unknown as typeof fetch;
    const dest = join(tempDir, 'too-big.json');

    const result = await registryCommand('refresh', { source, fetchImpl, destPath: dest });

    expect(result.exitCode).toBe(1);
    expect(result.text).toMatch(/exceeds cap/);
    expect(existsSync(dest)).toBe(false);
  });

  it('aborts a stream that exceeds the cap when Content-Length is absent (#3354)', async () => {
    const source = 'https://example.com/model-registry.json';
    // 6 × 1 MiB chunks (> 5 MiB cap); a ReadableStream Response carries no
    // Content-Length, so this exercises the running-cap streaming path.
    let emitted = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted >= 6) {
          controller.close();
          return;
        }
        emitted++;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
    });
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(stream, { status: 200 }))
    ) as unknown as typeof fetch;
    const dest = join(tempDir, 'streamed-too-big.json');

    const result = await registryCommand('refresh', { source, fetchImpl, destPath: dest });

    expect(result.exitCode).toBe(1);
    expect(result.text).toMatch(/stream aborted|exceeds cap/);
    expect(existsSync(dest)).toBe(false);
  });

  it('reports fetch failure without writing', async () => {
    const source = 'https://example.com/model-registry.json';
    const fetchImpl = makeFetchImpl(new Map([[source, { ok: false, status: 404 }]]));
    const result = await registryCommand('refresh', {
      source,
      fetchImpl,
      destPath: join(tempDir, 'nope.json'),
    });
    expect(result.exitCode).toBe(1);
    expect(result.text).toMatch(/Failed to fetch/);
  });

  it('supports --dry-run — verifies but does not write', async () => {
    const body = JSON.stringify({
      version: 1,
      generatedAt: '2026-04-22T00:00:00Z',
      entryCount: 0,
      entries: [],
    });
    const sha = sha256Hex(body);
    const source = 'https://example.com/model-registry.json';
    const fetchImpl = makeFetchImpl(
      new Map([
        [source, { ok: true, body }],
        [`${source}.sha256`, { ok: true, body: sha }],
      ])
    );
    const dest = join(tempDir, 'dryrun.json');

    const result = await registryCommand('refresh', {
      source,
      fetchImpl,
      destPath: dest,
      dryRun: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.text).toMatch(/dry-run/);
    expect(result.text).toMatch(/would write/);
    expect(() => readFileSync(dest, 'utf-8')).toThrow();
  });
});
