/**
 * Tests for research-scaffold (#2470).
 */

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  ensureRegistryFile,
  ensureResearchRegistry,
  _resetAnnouncedForTests,
} from './research-scaffold.js';
import { PAPERS_FILE, REGISTRY_PATH, TECHNIQUES_FILE } from './research-helpers-io.js';

describe('ensureRegistryFile (#2470)', () => {
  let tmp: string;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'nexus-scaffold-test-'));
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    _resetAnnouncedForTests();
    delete process.env['NEXUS_NO_SCAFFOLD'];
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    stderrSpy.mockRestore();
  });

  it('creates papers.yaml when missing and announces on stderr', async () => {
    const result = await ensureRegistryFile(tmp, PAPERS_FILE);
    expect(result.ok).toBe(true);
    const expectedPath = join(tmp, REGISTRY_PATH, PAPERS_FILE);
    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(stderrSpy).toHaveBeenCalledOnce();
    const msg = String(stderrSpy.mock.calls[0]?.[0] ?? '');
    expect(msg).toContain('[scaffold]');
    expect(msg).toContain(PAPERS_FILE);
    expect(msg).toContain('research add');
  });

  it('writes a syntactically valid empty papers registry', async () => {
    await ensureRegistryFile(tmp, PAPERS_FILE);
    const content = await fsp.readFile(join(tmp, REGISTRY_PATH, PAPERS_FILE), 'utf-8');
    const parsed = parseYaml(content) as {
      schema_version: string;
      papers: Record<string, unknown>;
    };
    expect(parsed.schema_version).toBe('1.0');
    expect(parsed.papers).toEqual({});
  });

  it('writes a syntactically valid empty techniques registry', async () => {
    await ensureRegistryFile(tmp, TECHNIQUES_FILE);
    const content = await fsp.readFile(join(tmp, REGISTRY_PATH, TECHNIQUES_FILE), 'utf-8');
    const parsed = parseYaml(content) as {
      schema_version: string;
      techniques: Record<string, unknown>;
    };
    expect(parsed.schema_version).toBe('1.0');
    expect(parsed.techniques).toEqual({});
  });

  it('is idempotent — does not overwrite an existing registry', async () => {
    const filePath = join(tmp, REGISTRY_PATH, PAPERS_FILE);
    fs.mkdirSync(join(tmp, REGISTRY_PATH), { recursive: true });
    writeFileSync(filePath, 'schema_version: "1.0"\npapers:\n  foo:\n    title: existing\n');

    const before = await fsp.readFile(filePath, 'utf-8');
    const result = await ensureRegistryFile(tmp, PAPERS_FILE);
    const after = await fsp.readFile(filePath, 'utf-8');

    expect(result.ok).toBe(true);
    expect(before).toBe(after);
    // No announcement when file already existed.
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('announces only once across multiple calls in a session', async () => {
    await ensureRegistryFile(tmp, PAPERS_FILE);
    await ensureRegistryFile(tmp, PAPERS_FILE);
    await ensureRegistryFile(tmp, PAPERS_FILE);
    expect(stderrSpy).toHaveBeenCalledOnce();
  });

  it('announces papers.yaml and techniques.yaml separately (not deduped against each other)', async () => {
    await ensureRegistryFile(tmp, PAPERS_FILE);
    await ensureRegistryFile(tmp, TECHNIQUES_FILE);
    expect(stderrSpy).toHaveBeenCalledTimes(2);
  });

  it('errors with actionable message when NEXUS_NO_SCAFFOLD=1 and file missing', async () => {
    process.env['NEXUS_NO_SCAFFOLD'] = '1';
    const result = await ensureRegistryFile(tmp, PAPERS_FILE);
    expect(result.ok).toBe(false);
    if (result.ok) return; // type narrow
    expect(result.error.message).toContain('NEXUS_NO_SCAFFOLD');
    expect(result.error.message).toContain(PAPERS_FILE);
    // No file was written.
    expect(fs.existsSync(join(tmp, REGISTRY_PATH, PAPERS_FILE))).toBe(false);
  });

  it('respects NEXUS_NO_SCAFFOLD=true (string boolean) too', async () => {
    process.env['NEXUS_NO_SCAFFOLD'] = 'true';
    const result = await ensureRegistryFile(tmp, PAPERS_FILE);
    expect(result.ok).toBe(false);
  });
});

describe('ensureResearchRegistry (#2470)', () => {
  let tmp: string;
  let stderrSpy: MockInstance;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'nexus-scaffold-test-'));
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    _resetAnnouncedForTests();
    delete process.env['NEXUS_NO_SCAFFOLD'];
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    stderrSpy.mockRestore();
  });

  it('creates both papers.yaml and techniques.yaml in one call', async () => {
    const result = await ensureResearchRegistry(tmp);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(join(tmp, REGISTRY_PATH, PAPERS_FILE))).toBe(true);
    expect(fs.existsSync(join(tmp, REGISTRY_PATH, TECHNIQUES_FILE))).toBe(true);
  });
});
