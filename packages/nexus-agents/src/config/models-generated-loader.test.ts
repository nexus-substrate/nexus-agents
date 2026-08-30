/**
 * Tests for the generated-registry loader's data-dir precedence (#3707).
 *
 * `registry refresh` writes the regenerated catalog to the DATA dir, but the
 * loader historically read only the bundled PACKAGE copy — so a refresh was
 * never picked up. These tests pin the fixed precedence: a refreshed file in
 * the data dir wins; otherwise fall back to the bundled package copy.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadGeneratedRegistryEntries } from './models-generated-loader.js';
import { resetNexusDataDirCache, nexusDataPath } from './nexus-data-dir.js';

describe('models-generated-loader data-dir precedence (#3707)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-genreg-test-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads a refreshed generated file from the data dir (precedence over package)', () => {
    const dataPath = nexusDataPath('model-registry.generated.json');
    writeFileSync(
      dataPath,
      JSON.stringify({
        version: 1,
        entries: [{ id: 'litellm/refresh-probe-model', contextWindow: 123456 }],
      })
    );

    const result = loadGeneratedRegistryEntries();
    expect(result.status).toBe('loaded');
    expect(result.path).toBe(dataPath);
    const probe = result.entries.find((e) => e.id === 'litellm/refresh-probe-model');
    expect(probe).toBeDefined();
    expect(probe?.contextWindow).toBe(123456);
  });

  it('falls back to the bundled package path when no data-dir file exists', () => {
    const result = loadGeneratedRegistryEntries();
    // Resolves to the bundled package copy, NOT the (absent) data-dir file.
    expect(result.path).not.toBe(nexusDataPath('model-registry.generated.json'));
    expect(result.path).toMatch(/model-registry\.generated\.json$/);
  });

  it('still honors an explicit path override (unchanged by the data-dir preference)', () => {
    const explicit = join(tmpDir, 'explicit.json');
    writeFileSync(explicit, JSON.stringify({ version: 1, entries: [] }));
    const result = loadGeneratedRegistryEntries({ path: explicit });
    expect(result.path).toBe(explicit);
    expect(result.status).toBe('loaded');
  });
});

describe('models-generated-loader $0/$0 pricing guard (#4176)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-genreg-zero-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function loadFixture(entries: unknown[]): ReturnType<typeof loadGeneratedRegistryEntries> {
    const path = join(tmpDir, 'zero-price-fixture.json');
    writeFileSync(path, JSON.stringify({ version: 1, entries }));
    return loadGeneratedRegistryEntries({ path });
  }

  it('drops $0/$0 catalog pricing so the entry stays UNPRICED (not a fake free model)', () => {
    // Real incident shape: litellm carries placeholder $0/$0 rows for models it
    // has no pricing for (e.g. amazon-bedrock/anthropic.claude-mythos-preview).
    // If that pricing flowed through, computeCostDetail would report
    // priced:true costUsd:0 — a measured $0 for what is actually UNMEASURED.
    const result = loadFixture([
      {
        id: 'amazon-bedrock/anthropic.claude-mythos-preview',
        contextWindow: 1_000_000,
        pricing: { inputPer1M: 0, outputPer1M: 0 },
      },
    ]);
    const entry = result.entries.find(
      (e) => e.id === 'amazon-bedrock/anthropic.claude-mythos-preview'
    );
    expect(entry).toBeDefined();
    expect(entry?.pricing).toBeUndefined();
  });

  it('keeps real non-zero pricing untouched', () => {
    const result = loadFixture([
      { id: 'litellm/priced-model', pricing: { inputPer1M: 2.5, outputPer1M: 10 } },
    ]);
    expect(result.entries[0]?.pricing).toEqual({ inputPer1M: 2.5, outputPer1M: 10 });
  });

  it('keeps pricing where only ONE side is zero (free input tiers are real)', () => {
    const result = loadFixture([
      { id: 'litellm/free-input-model', pricing: { inputPer1M: 0, outputPer1M: 4 } },
    ]);
    expect(result.entries[0]?.pricing).toEqual({ inputPer1M: 0, outputPer1M: 4 });
  });

  it('keeps $0/$0 pricing for `:free`-suffixed ids — genuinely free tiers (#4209)', () => {
    // openrouter ':free' entries are GENUINELY free; their $0/$0 is real
    // pricing, not a catalog placeholder. They must stay PRICED (measured $0)
    // rather than falling to UNPRICED/unmeasured.
    const result = loadFixture([
      {
        id: 'openrouter/meta-llama/llama-3.3-70b-instruct:free',
        pricing: { inputPer1M: 0, outputPer1M: 0 },
      },
    ]);
    const entry = result.entries.find(
      (e) => e.id === 'openrouter/meta-llama/llama-3.3-70b-instruct:free'
    );
    expect(entry).toBeDefined();
    expect(entry?.pricing).toEqual({ inputPer1M: 0, outputPer1M: 0 });
  });

  it('still drops $0/$0 when `:free` appears mid-id, not as the suffix', () => {
    const result = loadFixture([
      { id: 'litellm/foo:free-preview', pricing: { inputPer1M: 0, outputPer1M: 0 } },
    ]);
    expect(result.entries[0]?.pricing).toBeUndefined();
  });
});

describe('cache rates flow from the snapshot to the registry (#5170)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-cache-rate-test-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function loadWithPricing(pricing: Record<string, unknown>): Record<string, unknown> | undefined {
    writeFileSync(
      nexusDataPath('model-registry.generated.json'),
      JSON.stringify({
        version: 1,
        entries: [{ id: 'litellm/cache-probe', contextWindow: 1000, pricing }],
      })
    );
    const entry = loadGeneratedRegistryEntries().entries.find(
      (e) => e.id === 'litellm/cache-probe'
    );
    return entry?.pricing;
  }

  it('carries cacheReadPer1M through to the registry entry', () => {
    expect(loadWithPricing({ inputPer1M: 1, outputPer1M: 2, cacheReadPer1M: 0.1 })).toMatchObject({
      inputPer1M: 1,
      outputPer1M: 2,
      cacheReadPer1M: 0.1,
    });
  });

  it('carries cacheWritePer1M independently of cacheReadPer1M', () => {
    const p = loadWithPricing({ inputPer1M: 1, outputPer1M: 2, cacheWritePer1M: 1.25 });
    expect(p).toMatchObject({ cacheWritePer1M: 1.25 });
    expect(p).not.toHaveProperty('cacheReadPer1M');
  });

  it('leaves an absent cache rate ABSENT, not zero', () => {
    // The load-bearing case, and the common one: roughly half the catalogue
    // publishes no cache rate. A 0 would price a cache-heavy call as FREE;
    // absent makes computeTokenCost report the component unpriced instead.
    const p = loadWithPricing({ inputPer1M: 1, outputPer1M: 2 });
    expect(p).toMatchObject({ inputPer1M: 1, outputPer1M: 2 });
    expect(p).not.toHaveProperty('cacheReadPer1M');
    expect(p).not.toHaveProperty('cacheWritePer1M');
  });

  it('ignores a non-numeric cache rate rather than passing it through', () => {
    const p = loadWithPricing({ inputPer1M: 1, outputPer1M: 2, cacheReadPer1M: 'free' });
    expect(p).not.toHaveProperty('cacheReadPer1M');
  });
});
