/**
 * Tests for CapabilityDiscovery (epic #2174 / issue #2176).
 *
 * Fully offline. Every test injects its own tier sources through the
 * constructor — the bundled-file loader path is only covered indirectly
 * by an isolated test that writes a temp file.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ILogger } from '../core/index.js';
import {
  buildAliasCandidates,
  CapabilityDiscovery,
  FAIL_CLOSED_DEFAULT,
  getCapabilityDiscovery,
  LEGACY_200K_DEFAULT,
  loadBundledGeneratedRegistry,
  setCapabilityDiscovery,
} from './capability-discovery.js';
import type { GeneratedRegistry } from './capability-discovery.js';
import type { ModelCapabilitiesMatrix, ModelCapability } from './model-capabilities-types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface SpyLogger {
  readonly logger: ILogger;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly error: ReturnType<typeof vi.fn>;
}

function silentLogger(): SpyLogger {
  const spy = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  spy.child.mockReturnValue(spy);
  return {
    logger: spy,
    warn: spy.warn,
    error: spy.error,
  };
}

function makeCanonicalEntry(
  id: 'claude-opus',
  overrides: Partial<ModelCapability> = {}
): ModelCapability {
  return {
    id,
    displayName: `display-${id}`,
    provider: 'anthropic',
    contextWindow: 1_000_000,
    outputModalities: ['text'],
    inputModalities: ['text'],
    toolCapabilities: [],
    specialFeatures: [],
    pricing: { inputPer1M: 5, outputPer1M: 25 },
    ...overrides,
  };
}

function makeCanonicalMatrix(entries: readonly ModelCapability[]): ModelCapabilitiesMatrix {
  return { version: 3, updatedAt: '2026-04-22', models: [...entries] };
}

function makeGeneratedRegistry(
  entries: readonly {
    id: string;
    displayName: string;
    provider: string;
    contextWindow: number;
    pricing?: { inputPer1M: number; outputPer1M: number };
  }[]
): GeneratedRegistry {
  return {
    version: 1,
    generatedAt: '2026-04-22T00:00:00Z',
    entryCount: entries.length,
    entries: entries.map((e) => ({
      ...e,
      provenance: {
        source: 'models.dev' as const,
        fetchedAt: '2026-04-22T00:00:00Z',
        upstreamUrl: 'https://models.dev/api.json',
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Precedence — the headline behaviour
// ---------------------------------------------------------------------------

describe('CapabilityDiscovery — precedence T3 > T1 > T2 > T4', () => {
  it('T3 overlay wins when id is present at multiple tiers', () => {
    const shared: ModelCapability = makeCanonicalEntry('claude-opus', {
      displayName: 'from-T3',
      contextWindow: 111_111,
    });
    const discovery = new CapabilityDiscovery({
      canonical: makeCanonicalMatrix([
        makeCanonicalEntry('claude-opus', { displayName: 'from-T1', contextWindow: 222_222 }),
      ]),
      generated: makeGeneratedRegistry([
        {
          id: 'claude-opus',
          displayName: 'from-T2',
          provider: 'anthropic',
          contextWindow: 333_333,
        },
      ]),
      overlay: [shared],
      logger: silentLogger().logger,
    });

    const resolved = discovery.resolve('claude-opus');
    expect(resolved.tier).toBe('t3');
    expect(resolved.displayName).toBe('from-T3');
    expect(resolved.contextWindow).toBe(111_111);
  });

  it('T1 wins over T2 when T3 is empty', () => {
    const discovery = new CapabilityDiscovery({
      canonical: makeCanonicalMatrix([
        makeCanonicalEntry('claude-opus', { displayName: 'from-T1', contextWindow: 200_000 }),
      ]),
      generated: makeGeneratedRegistry([
        {
          id: 'claude-opus',
          displayName: 'from-T2',
          provider: 'anthropic',
          contextWindow: 100_000,
        },
      ]),
      logger: silentLogger().logger,
    });

    const resolved = discovery.resolve('claude-opus');
    expect(resolved.tier).toBe('t1');
    expect(resolved.displayName).toBe('from-T1');
    expect(resolved.contextWindow).toBe(200_000);
  });

  it('T2 resolves an id the canonical matrix does not carry', () => {
    const discovery = new CapabilityDiscovery({
      canonical: makeCanonicalMatrix([makeCanonicalEntry('claude-opus')]),
      generated: makeGeneratedRegistry([
        {
          id: 'amazon-bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
          displayName: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          provider: 'amazon-bedrock',
          contextWindow: 200_000,
          pricing: { inputPer1M: 3, outputPer1M: 15 },
        },
      ]),
      logger: silentLogger().logger,
    });

    const resolved = discovery.resolve('amazon-bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0');
    expect(resolved.tier).toBe('t2');
    expect(resolved.provider).toBe('amazon-bedrock');
    expect(resolved.pricing).toEqual({ inputPer1M: 3, outputPer1M: 15 });
    expect(resolved.provenance?.source).toBe('models.dev');
  });

  it('T4 fallback applies for wholly unknown ids with the configured default', () => {
    const spy = silentLogger();
    const discovery = new CapabilityDiscovery({
      canonical: makeCanonicalMatrix([makeCanonicalEntry('claude-opus')]),
      generated: null,
      conservativeDefault: LEGACY_200K_DEFAULT,
      logger: spy.logger,
    });

    const resolved = discovery.resolve('never-heard-of-this-model');
    expect(resolved.tier).toBe('t4');
    expect(resolved.contextWindow).toBe(200_000);
    expect(resolved.provider).toBe('unknown');
    expect(spy.warn).toHaveBeenCalledTimes(1);
  });

  it('T4 fallback honours a fail-closed default when supplied (for #2177)', () => {
    const discovery = new CapabilityDiscovery({
      canonical: makeCanonicalMatrix([makeCanonicalEntry('claude-opus')]),
      conservativeDefault: FAIL_CLOSED_DEFAULT,
      logger: silentLogger().logger,
    });
    const resolved = discovery.resolve('mystery');
    expect(resolved.contextWindow).toBe(8_192);
  });
});

// ---------------------------------------------------------------------------
// Alias resolution
// ---------------------------------------------------------------------------

describe('CapabilityDiscovery — alias resolution', () => {
  const discovery = new CapabilityDiscovery({
    canonical: makeCanonicalMatrix([makeCanonicalEntry('claude-opus')]),
    generated: makeGeneratedRegistry([
      {
        id: 'amazon-bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
        displayName: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        provider: 'amazon-bedrock',
        contextWindow: 200_000,
      },
      {
        id: 'openrouter/anthropic/claude-3-5-sonnet',
        displayName: 'anthropic/claude-3-5-sonnet',
        provider: 'openrouter',
        contextWindow: 200_000,
      },
    ]),
    logger: silentLogger().logger,
  });

  it('resolves a Bedrock-style id that omits the provider prefix', () => {
    const resolved = discovery.resolve('anthropic.claude-3-5-sonnet-20241022-v2:0');
    expect(resolved.tier).toBe('t2');
    expect(resolved.provider).toBe('amazon-bedrock');
  });

  it('resolves a routed id to an upstream catalog entry', () => {
    const resolved = discovery.resolve('anthropic/claude-3-5-sonnet');
    expect(resolved.tier).toBe('t2');
    expect(resolved.provider).toBe('openrouter');
  });

  it('buildAliasCandidates does not include the original id', () => {
    const candidates = buildAliasCandidates('gpt-5-codex');
    expect(candidates).not.toContain('gpt-5-codex');
    expect(candidates).toContain('openai/gpt-5-codex');
    expect(candidates).toContain('amazon-bedrock/gpt-5-codex');
  });
});

// ---------------------------------------------------------------------------
// Tier counts — exposed for registry doctor (#2179)
// ---------------------------------------------------------------------------

describe('CapabilityDiscovery — tier counts', () => {
  it('reports the count per tier', () => {
    const discovery = new CapabilityDiscovery({
      canonical: makeCanonicalMatrix([makeCanonicalEntry('claude-opus')]),
      generated: makeGeneratedRegistry([
        { id: 'a/b', displayName: 'b', provider: 'a', contextWindow: 1000 },
        { id: 'a/c', displayName: 'c', provider: 'a', contextWindow: 1000 },
      ]),
      overlay: [makeCanonicalEntry('claude-opus', { displayName: 'overridden' })],
      logger: silentLogger().logger,
    });
    expect(discovery.getTierCounts()).toEqual({ t1: 1, t2: 2, t3: 1, t4: 0 });
  });
});

// ---------------------------------------------------------------------------
// Corruption tolerance
// ---------------------------------------------------------------------------

describe('loadBundledGeneratedRegistry — corruption tolerance', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'capdisc-'));
  });

  it('returns null when the file does not exist (no throw)', () => {
    const result = loadBundledGeneratedRegistry(
      join(tempDir, 'nonexistent.json'),
      silentLogger().logger
    );
    expect(result).toBeNull();
  });

  it('returns null on malformed JSON (no throw)', () => {
    const path = join(tempDir, 'bad.json');
    writeFileSync(path, '{ this is not json', 'utf-8');
    const result = loadBundledGeneratedRegistry(path, silentLogger().logger);
    expect(result).toBeNull();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null on schema-invalid JSON (no throw)', () => {
    const path = join(tempDir, 'wrong-shape.json');
    writeFileSync(path, JSON.stringify({ version: 99, entries: 'not-an-array' }), 'utf-8');
    const result = loadBundledGeneratedRegistry(path, silentLogger().logger);
    expect(result).toBeNull();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses a valid file', () => {
    const path = join(tempDir, 'good.json');
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        generatedAt: '2026-04-22T00:00:00Z',
        entryCount: 1,
        entries: [
          {
            id: 'x/y',
            displayName: 'y',
            provider: 'x',
            contextWindow: 1000,
            provenance: {
              source: 'models.dev',
              fetchedAt: '2026-04-22T00:00:00Z',
              upstreamUrl: 'https://models.dev/api.json',
            },
          },
        ],
      }),
      'utf-8'
    );
    const result = loadBundledGeneratedRegistry(path, silentLogger().logger);
    expect(result).not.toBeNull();
    expect(result?.entries).toHaveLength(1);
    rmSync(tempDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Singleton injection (for later tests / the rest of the codebase)
// ---------------------------------------------------------------------------

describe('getCapabilityDiscovery — singleton injection', () => {
  it('returns the injected instance and can be reset', () => {
    const fake = new CapabilityDiscovery({
      canonical: makeCanonicalMatrix([makeCanonicalEntry('claude-opus')]),
      logger: silentLogger().logger,
    });
    setCapabilityDiscovery(fake);
    expect(getCapabilityDiscovery()).toBe(fake);
    setCapabilityDiscovery(undefined);
  });
});
