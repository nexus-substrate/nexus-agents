/**
 * Importer tests — registration, marker-file gating, error isolation.
 *
 * @module nexus-memory/importer.test
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupSourceFile,
  listImporters,
  registerImporter,
  resetImporters,
  runImporters,
} from './importer.js';
import { writeFileSync } from 'node:fs';
import { createInMemoryMemoryRegistry, type MemoryRegistry } from './index.js';

describe('importer registry', () => {
  let registry: MemoryRegistry;
  let markerDir: string;

  beforeEach(() => {
    resetImporters();
    registry = createInMemoryMemoryRegistry();
    markerDir = mkdtempSync(join(tmpdir(), 'nexus-memory-importer-'));
  });

  afterEach(async () => {
    await registry.close();
    rmSync(markerDir, { recursive: true, force: true });
  });

  it('registerImporter adds to the registry', () => {
    registerImporter({
      id: 'one',
      domain: 'd1',
      run: () => {
        return Promise.resolve({ domain: 'd1', rowsImported: 0, sourcePathBackup: null });
      },
    });
    expect(listImporters()).toEqual(['one']);
  });

  it('registerImporter rejects duplicates', () => {
    registerImporter({
      id: 'dup',
      domain: 'd',
      run: () => {
        return Promise.resolve({ domain: 'd', rowsImported: 0, sourcePathBackup: null });
      },
    });
    expect(() => {
      registerImporter({
        id: 'dup',
        domain: 'd2',
        run: () => {
          return Promise.resolve({ domain: 'd2', rowsImported: 0, sourcePathBackup: null });
        },
      });
    }).toThrow(/already registered/);
  });

  it('runImporters runs each once and writes marker file', async () => {
    let calls = 0;
    registerImporter({
      id: 'one-shot',
      domain: 'os',
      run: () => {
        calls++;
        return Promise.resolve({ domain: 'os', rowsImported: 3, sourcePathBackup: null });
      },
    });
    const first = await runImporters(registry, { markerDir });
    expect(first.runs).toHaveLength(1);
    expect(calls).toBe(1);
    const second = await runImporters(registry, { markerDir });
    // Marker prevents re-run.
    expect(second.runs).toHaveLength(0);
    expect(calls).toBe(1);
    const marker = join(markerDir, '.imported-one-shot');
    expect(existsSync(marker)).toBe(true);
    const markerJson = JSON.parse(readFileSync(marker, 'utf-8')) as Record<string, unknown>;
    expect(markerJson['rowsImported']).toBe(3);
  });

  it('force option overrides marker', async () => {
    let calls = 0;
    registerImporter({
      id: 'force-test',
      domain: 'ft',
      run: () => {
        calls++;
        return Promise.resolve({ domain: 'ft', rowsImported: 1, sourcePathBackup: null });
      },
    });
    await runImporters(registry, { markerDir });
    expect(calls).toBe(1);
    await runImporters(registry, { markerDir, force: true });
    expect(calls).toBe(2);
  });

  it('one importer failing does not block others', async () => {
    registerImporter({
      id: 'fails',
      domain: 'f',
      run: () => Promise.reject(new Error('boom')),
    });
    registerImporter({
      id: 'succeeds',
      domain: 's',
      run: () => {
        return Promise.resolve({ domain: 's', rowsImported: 1, sourcePathBackup: null });
      },
    });
    const result = await runImporters(registry, { markerDir });
    expect(result.runs.map((r) => r.domain)).toEqual(['s']);
    expect(result.errors.map((e) => e.id)).toEqual(['fails']);
  });
});

describe('backupSourceFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-memory-backup-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renames the source to .bak.<timestamp>', () => {
    const src = join(tmpDir, 'outcomes.jsonl');
    writeFileSync(src, '{}\n');
    const backup = backupSourceFile(src);
    expect(backup).not.toBeNull();
    expect(backup).toMatch(/outcomes\.jsonl\.bak\.\d+$/);
    expect(existsSync(src)).toBe(false);
    if (backup !== null) {
      expect(existsSync(backup)).toBe(true);
    }
  });

  it('returns null when source does not exist', () => {
    expect(backupSourceFile(join(tmpDir, 'nope'))).toBeNull();
  });
});
