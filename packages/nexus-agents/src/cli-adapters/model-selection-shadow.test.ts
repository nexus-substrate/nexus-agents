/**
 * Tests for shadow-mode recording of route-time tier model selection (#4197).
 * Covers the enable gate, the shadow comparison, JSONL persistence (roundtrip,
 * corrupt-line skipping, lookback filter), and the failure counter.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MODEL_SELECTION_SHADOW_SCHEMA_VERSION,
  computeModelSelectionShadow,
  getModelSelectionShadowFailureCount,
  isRouteModelShadowEnabled,
  persistModelSelectionShadowRecord,
  readModelSelectionShadowRecords,
  recordModelSelectionShadowFailure,
  resetModelSelectionShadowFailureCount,
  type ModelSelectionShadowRecord,
} from './model-selection-shadow.js';
import { resolveModelForTier } from './resolve-model-for-tier.js';
import { getDefaultModelForCli } from '../config/model-config-helpers.js';
import { getModelSelectionShadowFile } from '../config/learning-persistence.js';

function record(over: Partial<ModelSelectionShadowRecord> = {}): ModelSelectionShadowRecord {
  return {
    schema: MODEL_SELECTION_SHADOW_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    cli: 'claude',
    tier: 'balanced',
    actualModel: 'model-a',
    shadowModel: 'model-b',
    agree: false,
    success: true,
    ...over,
  };
}

describe('isRouteModelShadowEnabled (#4197)', () => {
  afterEach(() => {
    delete process.env['NEXUS_ROUTE_MODEL_SHADOW'];
    delete process.env['NEXUS_PERSIST_LEARNING'];
  });

  it('is OFF by default', () => {
    expect(isRouteModelShadowEnabled()).toBe(false);
  });

  it('is ON with NEXUS_ROUTE_MODEL_SHADOW=1', () => {
    process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
    expect(isRouteModelShadowEnabled()).toBe(true);
  });

  it('stays OFF when learning persistence is disabled', () => {
    process.env['NEXUS_ROUTE_MODEL_SHADOW'] = '1';
    process.env['NEXUS_PERSIST_LEARNING'] = 'false';
    expect(isRouteModelShadowEnabled()).toBe(false);
  });

  it('treats values other than "1" as OFF', () => {
    process.env['NEXUS_ROUTE_MODEL_SHADOW'] = 'true';
    expect(isRouteModelShadowEnabled()).toBe(false);
  });
});

describe('computeModelSelectionShadow (#4197)', () => {
  it('shadow model matches resolveModelForTier for the same inputs', () => {
    const cmp = computeModelSelectionShadow('claude', 'powerful');
    expect(cmp.shadowModel).toBe(resolveModelForTier('claude', 'powerful'));
    expect(cmp.cli).toBe('claude');
    expect(cmp.tier).toBe('powerful');
  });

  it('falls back to the CLI default model when no actual model is supplied', () => {
    const cmp = computeModelSelectionShadow('claude', 'balanced');
    expect(cmp.actualModel).toBe(getDefaultModelForCli('claude'));
  });

  it('agrees when the actual model equals the shadow pick', () => {
    const shadow = resolveModelForTier('claude', 'fast');
    const cmp = computeModelSelectionShadow('claude', 'fast', shadow);
    expect(cmp.agree).toBe(true);
  });

  it('diverges when the actual model differs from the shadow pick', () => {
    const cmp = computeModelSelectionShadow('claude', 'fast', 'definitely-not-a-real-model');
    expect(cmp.actualModel).toBe('definitely-not-a-real-model');
    expect(cmp.agree).toBe(false);
  });
});

describe('shadow persistence (#4197, mirrors #3593)', () => {
  let dir: string;
  let prevDataDir: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'model-shadow-'));
    prevDataDir = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dir;
    resetModelSelectionShadowFailureCount();
  });

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = prevDataDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips records through the JSONL file', () => {
    persistModelSelectionShadowRecord(record());
    persistModelSelectionShadowRecord(record({ agree: true, actualModel: 'model-b' }));

    const back = readModelSelectionShadowRecords();
    expect(back).toHaveLength(2);
    expect(back[0]?.shadowModel).toBe('model-b');
    expect(back[0]?.agree).toBe(false);
    expect(back[1]?.agree).toBe(true);
  });

  it('persists no task text — only the sanitized comparison fields', () => {
    persistModelSelectionShadowRecord(record());
    const raw = readFileSync(getModelSelectionShadowFile(), 'utf-8');
    const line = JSON.parse(raw.trim()) as Record<string, unknown>;
    expect(Object.keys(line).sort()).toEqual([
      'actualModel',
      'agree',
      'cli',
      'schema',
      'shadowModel',
      'success',
      'tier',
      'timestamp',
    ]);
  });

  it('returns an empty array when the file does not exist', () => {
    expect(existsSync(getModelSelectionShadowFile())).toBe(false);
    expect(readModelSelectionShadowRecords()).toEqual([]);
  });

  it('skips corrupt and schema-invalid lines without throwing', () => {
    persistModelSelectionShadowRecord(record());
    writeFileSync(
      getModelSelectionShadowFile(),
      readFileSync(getModelSelectionShadowFile(), 'utf-8') +
        'not json\n' +
        JSON.stringify({ schema: 999, nonsense: true }) +
        '\n',
      'utf-8'
    );
    expect(readModelSelectionShadowRecords()).toHaveLength(1);
  });

  it('filters records older than the lookback window', () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    persistModelSelectionShadowRecord(record({ timestamp: old }));
    persistModelSelectionShadowRecord(record());
    expect(readModelSelectionShadowRecords()).toHaveLength(1);
  });

  it('keeps a measured costUsd through the roundtrip', () => {
    persistModelSelectionShadowRecord(record({ costUsd: 0.0123 }));
    const back = readModelSelectionShadowRecords();
    expect(back[0]?.costUsd).toBeCloseTo(0.0123);
  });

  it('counts a persist failure instead of throwing (never breaks routing)', () => {
    // Occupy the learning dir path with a FILE so mkdir/append must fail.
    process.env['NEXUS_DATA_DIR'] = join(dir, 'not-a-dir');
    writeFileSync(join(dir, 'not-a-dir'), 'occupied', 'utf-8');

    expect(() => {
      persistModelSelectionShadowRecord(record());
    }).not.toThrow();
    expect(getModelSelectionShadowFailureCount()).toBe(1);
  });
});

describe('shadow failure counter (#4197)', () => {
  beforeEach(() => {
    resetModelSelectionShadowFailureCount();
  });

  it('starts at zero and increments', () => {
    expect(getModelSelectionShadowFailureCount()).toBe(0);
    expect(recordModelSelectionShadowFailure()).toBe(1);
    expect(recordModelSelectionShadowFailure()).toBe(2);
    expect(getModelSelectionShadowFailureCount()).toBe(2);
  });
});
