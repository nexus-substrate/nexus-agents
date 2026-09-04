/**
 * Tests for the codex served-model probe (#5091).
 *
 * The probe compares every codex registry entry's `cliModelName` against the
 * models the installed codex actually lists, because a registry slug that codex
 * stopped serving is invisible to unit tests and rejected at every invocation.
 * The seam is the cache reader: fixture files stand in for
 * `~/.codex/models_cache.json`, so all three verdicts are reachable without a
 * codex install.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findInTreeByCli } from '../config/model-config-helpers.js';
import {
  checkCodexModels,
  parseServedCodexSlugs,
  resolveCodexModelsCachePath,
} from './doctor-codex-models.js';

const registrySlugs = (): string[] =>
  findInTreeByCli('codex').flatMap((e) => (e.cliModelName === undefined ? [] : [e.cliModelName]));

function cacheJson(slugs: readonly string[], extraHidden: readonly string[] = []): string {
  return JSON.stringify({
    fetched_at: '2026-09-04T00:00:00Z',
    client_version: '0.146.0',
    models: [
      ...slugs.map((slug) => ({ slug, visibility: 'list' })),
      ...extraHidden.map((slug) => ({ slug, visibility: 'hide' })),
    ],
  });
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nexus-codex-models-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseServedCodexSlugs', () => {
  it('returns only visibility=list slugs, counting every well-formed row', () => {
    expect(parseServedCodexSlugs(cacheJson(['gpt-a', 'gpt-b'], ['hidden-c']))).toEqual({
      listed: ['gpt-a', 'gpt-b'],
      rows: 3,
      withoutVisibility: 0,
    });
  });

  it('counts rows that carry no visibility field separately', () => {
    const raw = JSON.stringify({
      models: [{ slug: 'gpt-a' }, { slug: 'gpt-b', visibility: 'list' }],
    });
    expect(parseServedCodexSlugs(raw)).toEqual({
      listed: ['gpt-b'],
      rows: 2,
      withoutVisibility: 1,
    });
  });

  it('returns null for unparseable JSON', () => {
    expect(parseServedCodexSlugs('{not json')).toBeNull();
  });

  it('returns null when the document has no models array', () => {
    expect(parseServedCodexSlugs(JSON.stringify({ fetched_at: 'x' }))).toBeNull();
  });

  it('skips entries that are not {slug: string} without discarding the rest', () => {
    const raw = JSON.stringify({
      models: [{ slug: 'gpt-a', visibility: 'list' }, { visibility: 'list' }, 'junk'],
    });
    expect(parseServedCodexSlugs(raw)?.listed).toEqual(['gpt-a']);
  });
});

describe('checkCodexModels', () => {
  it('passes and names every entry when each registry slug is served', () => {
    const file = join(dir, 'models_cache.json');
    writeFileSync(file, cacheJson([...registrySlugs(), 'gpt-extra-served']));

    const result = checkCodexModels(file);

    expect(result.status).toBe('pass');
    expect(result.missing).toEqual([]);
    expect(result.served.map((s) => s.cliModelName).sort()).toEqual([...registrySlugs()].sort());
    expect(result.reason).toBeNull();
  });

  it('warns and names the unserved slug when one registry entry is missing', () => {
    const [dropped, ...rest] = registrySlugs();
    const file = join(dir, 'models_cache.json');
    writeFileSync(file, cacheJson(rest));

    const result = checkCodexModels(file);

    expect(result.status).toBe('warn');
    expect(result.missing.map((m) => m.cliModelName)).toEqual([dropped]);
    expect(result.missing[0]?.id).toBe(
      findInTreeByCli('codex').find((e) => e.cliModelName === dropped)?.id
    );
    expect(result.served).toHaveLength(rest.length);
  });

  it('reports unmeasured — never pass — when the cache file is absent', () => {
    const result = checkCodexModels(join(dir, 'does-not-exist.json'));

    expect(result.status).toBe('unmeasured');
    expect(result.reason).toContain('does-not-exist.json');
    expect(result.served).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('reports unmeasured when the cache is unparseable', () => {
    const file = join(dir, 'models_cache.json');
    writeFileSync(file, '{broken');

    const result = checkCodexModels(file);

    expect(result.status).toBe('unmeasured');
    expect(result.reason).toContain('unparseable');
  });

  it('reports unmeasured when the cache lists no models (named empty case)', () => {
    // An empty served set would make every registry slug "missing"; a cache
    // that lists nothing is far more likely stale or malformed than codex
    // serving nothing, so the record says it could not measure.
    const file = join(dir, 'models_cache.json');
    writeFileSync(file, cacheJson([]));

    const result = checkCodexModels(file);

    expect(result.status).toBe('unmeasured');
    expect(result.reason).toContain('lists no models');
  });

  it('reports unmeasured naming the missing visibility field when rows lack it', () => {
    // Not "lists no models": the cache DOES list models, just not the field
    // this probe reads. A wrong reason sends the operator to the wrong fix.
    const file = join(dir, 'models_cache.json');
    writeFileSync(file, JSON.stringify({ models: [{ slug: 'gpt-a' }, { slug: 'gpt-b' }] }));

    const result = checkCodexModels(file);

    expect(result.status).toBe('unmeasured');
    expect(result.reason).toContain('2 model row(s) with no visibility field');
    expect(result.reason).not.toContain('lists no models');
  });

  it('reports unmeasured when models exist but none is visibility=list', () => {
    const file = join(dir, 'models_cache.json');
    writeFileSync(file, cacheJson([], ['hidden-only']));

    const result = checkCodexModels(file);

    expect(result.status).toBe('unmeasured');
    expect(result.reason).toContain('none with visibility=list');
  });

  it('reports unmeasured when the registry has no codex entries to check (named empty case)', () => {
    const file = join(dir, 'models_cache.json');
    writeFileSync(file, cacheJson(['gpt-a']));

    const result = checkCodexModels(file, []);

    expect(result.status).toBe('unmeasured');
    expect(result.reason).toContain('no codex entries');
  });
});

describe('resolveCodexModelsCachePath', () => {
  it('honours CODEX_HOME when set', () => {
    expect(resolveCodexModelsCachePath({ CODEX_HOME: '/custom/codex' })).toBe(
      join('/custom/codex', 'models_cache.json')
    );
  });

  it('falls back to ~/.codex when CODEX_HOME is unset or empty', () => {
    const fallback = resolveCodexModelsCachePath({});
    expect(fallback.endsWith(join('.codex', 'models_cache.json'))).toBe(true);
    expect(resolveCodexModelsCachePath({ CODEX_HOME: '' })).toBe(fallback);
  });
});
