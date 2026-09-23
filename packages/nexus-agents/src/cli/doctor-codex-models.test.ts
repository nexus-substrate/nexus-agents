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
  codexModelsVerifyCheck,
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
      retirements: [],
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
      retirements: [],
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

  it('passes against the 2026-09-23 served-list SNAPSHOT (codex-cli 0.155.1)', () => {
    // A FROZEN copy of the visibility=list slugs in ~/.codex/models_cache.json
    // on 2026-09-23 (codex-cli 0.155.1). It pins that the registry matched the
    // binary on that date; it is NOT the drift gate. The live gate is
    // `nexus-agents verify` (Codex Models), which reads the installed cache.
    // Hidden rows (gpt-reserve, codex-auto-review) are not offered by codex.
    const SERVED_2026_09_23 = [
      'gpt-6-astra',
      'gpt-6-sol',
      'gpt-6-luna',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
    ];
    const file = join(dir, 'models_cache.json');
    writeFileSync(file, cacheJson(SERVED_2026_09_23, ['gpt-reserve', 'codex-auto-review']));

    const result = checkCodexModels(file);

    expect(result.missing).toEqual([]);
    expect(result.status).toBe('pass');
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

describe('codex retirement warning (#6516)', () => {
  // FIXTURE, not the live cache. The row shape mirrors the `upgrade` record
  // ~/.codex/models_cache.json carried on the gpt-5.5 row on 2026-09-23
  // (codex-cli 0.155.1); the slugs here are invented so the test does not
  // depend on which models the registry names today.
  const NOW = new Date('2026-09-23T12:00:00Z');
  const ROWS = [
    { id: 'fixture-old', cliModelName: 'fixture-old-slug' },
    { id: 'fixture-new', cliModelName: 'fixture-new-slug' },
  ];

  function writeCache(models: readonly Record<string, unknown>[]): string {
    const file = join(dir, 'models_cache.json');
    writeFileSync(file, JSON.stringify({ models }));
    return file;
  }

  const retiringRow = (
    retirementAt: string,
    upgrade: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    slug: 'fixture-old-slug',
    visibility: 'list',
    upgrade: { model: 'fixture-new-slug', retirement_at: retirementAt, ...upgrade },
  });
  const plainRow = { slug: 'fixture-new-slug', visibility: 'list', upgrade: null };

  it('parses the retirement date and upgrade target from a row', () => {
    const raw = JSON.stringify({ models: [retiringRow('2026-10-14T19:00:00Z'), plainRow] });
    expect(parseServedCodexSlugs(raw)?.retirements).toEqual([
      {
        slug: 'fixture-old-slug',
        retirementAt: '2026-10-14T19:00:00.000Z',
        upgradeModel: 'fixture-new-slug',
      },
    ]);
  });

  it('warns, naming the date and upgrade model, when a slug retires within 30 days', () => {
    const file = writeCache([retiringRow('2026-10-14T19:00:00Z'), plainRow]);

    const result = checkCodexModels(file, ROWS, NOW);

    expect(result.status).toBe('warn');
    expect(result.missing).toEqual([]);
    expect(result.served).toHaveLength(2);
    expect(result.retiring).toEqual([
      {
        id: 'fixture-old',
        cliModelName: 'fixture-old-slug',
        retirementAt: '2026-10-14T19:00:00.000Z',
        upgradeModel: 'fixture-new-slug',
        daysLeft: 21,
      },
    ]);
    expect(result.reason).toContain('fixture-old → fixture-old-slug retires 2026-10-14');
    expect(result.reason).toContain('upgrade: fixture-new-slug');
    expect(result.reason).not.toContain('not served');
  });

  it('does not warn when the retirement is further out than 30 days', () => {
    const file = writeCache([retiringRow('2026-10-24T12:00:01Z'), plainRow]);

    const result = checkCodexModels(file, ROWS, NOW);

    expect(result.status).toBe('pass');
    expect(result.retiring).toEqual([]);
    expect(result.reason).toBeNull();
  });

  it('warns at exactly 30 days (inclusive boundary)', () => {
    const file = writeCache([retiringRow('2026-10-23T12:00:00Z'), plainRow]);

    expect(checkCodexModels(file, ROWS, NOW).retiring.map((r) => r.daysLeft)).toEqual([30]);
  });

  it('reports a retirement already in the past as retired, alongside the unserved slug', () => {
    // After the date the row should also have left the served list; the
    // retirement is still reported so the operator sees the upgrade target.
    const file = writeCache([
      { ...retiringRow('2026-09-20T12:00:00Z'), visibility: 'hide' },
      plainRow,
    ]);

    const result = checkCodexModels(file, ROWS, NOW);

    expect(result.status).toBe('warn');
    expect(result.missing.map((m) => m.id)).toEqual(['fixture-old']);
    expect(result.retiring.map((r) => r.daysLeft)).toEqual([-3]);
    // Both causes render independently, not one hiding the other.
    expect(result.reason).toContain('not served by the installed codex: fixture-old');
    expect(result.reason).toContain('fixture-old → fixture-old-slug retired 2026-09-20');
    expect(result.reason).toContain('upgrade: fixture-new-slug');
  });

  it('reports a retirement a few hours past as retired, never as "in 0 days"', () => {
    const file = writeCache([retiringRow('2026-09-23T06:00:00Z'), plainRow]);

    const result = checkCodexModels(file, ROWS, NOW);

    expect(result.retiring.map((r) => r.daysLeft)).toEqual([-1]);
    expect(result.reason).toContain('retired 2026-09-23');
  });

  it('reports a past retirement even when the row is still listed', () => {
    const file = writeCache([retiringRow('2026-09-20T12:00:00Z'), plainRow]);

    const result = checkCodexModels(file, ROWS, NOW);

    expect(result.status).toBe('warn');
    expect(result.missing).toEqual([]);
    expect(result.reason).toContain('retired 2026-09-20');
  });

  it('does not warn when the row has no upgrade record (absent case)', () => {
    const file = writeCache([
      { slug: 'fixture-old-slug', visibility: 'list' },
      { slug: 'fixture-new-slug', visibility: 'list', upgrade: null },
    ]);

    const result = checkCodexModels(file, ROWS, NOW);

    expect(result.status).toBe('pass');
    expect(result.retiring).toEqual([]);
  });

  it('names a missing upgrade target instead of inventing one', () => {
    const file = writeCache([retiringRow('2026-10-14T19:00:00Z', { model: null }), plainRow]);

    const result = checkCodexModels(file, ROWS, NOW);

    expect(result.retiring[0]?.upgradeModel).toBeNull();
    expect(result.reason).toContain('no upgrade model named');
  });

  it('ignores an upgrade record whose retirement_at is not a date', () => {
    const file = writeCache([retiringRow('soon'), plainRow]);

    const result = checkCodexModels(file, ROWS, NOW);

    expect(result.status).toBe('pass');
    expect(result.retiring).toEqual([]);
  });

  it('ignores retirements of slugs no registry entry names', () => {
    const file = writeCache([
      retiringRow('2026-10-14T19:00:00Z'),
      plainRow,
      { ...retiringRow('2026-10-01T00:00:00Z'), slug: 'unrelated-slug' },
    ]);

    const result = checkCodexModels(file, ROWS, NOW);

    expect(result.retiring.map((r) => r.cliModelName)).toEqual(['fixture-old-slug']);
  });
});

describe('codexModelsVerifyCheck', () => {
  const served = [{ id: 'fixture-new', cliModelName: 'fixture-new-slug' }];
  const retiring = [
    {
      id: 'fixture-old',
      cliModelName: 'fixture-old-slug',
      retirementAt: '2026-10-14T19:00:00.000Z',
      upgradeModel: 'fixture-new-slug',
      daysLeft: 21,
    },
  ];

  it('passes and lists the served slugs', () => {
    const check = codexModelsVerifyCheck({
      status: 'pass',
      served,
      missing: [],
      retiring: [],
      reason: null,
    });
    expect(check.passed).toBe(true);
    expect(check.message).toBe('1 codex registry slug(s) served: fixture-new-slug');
  });

  it('reports skipped when codex is not installed (#6535)', () => {
    const check = codexModelsVerifyCheck(
      {
        status: 'unmeasured',
        served: [],
        missing: [],
        retiring: [],
        reason: 'no cache',
      },
      { isCodexInstalled: false }
    );
    expect(check.passed).toBe(true);
    expect(check.message).toBe('skipped: codex not installed');
  });

  it('reports passed with an informational note when retirement is within window and default is migrated (#6535)', () => {
    const check = codexModelsVerifyCheck(
      {
        status: 'warn',
        served,
        missing: [],
        retiring,
        reason: 'retiring per the codex cache: fixture-old → fixture-old-slug retires 2026-10-14',
      },
      { defaultModel: 'gpt-5.6-sol' }
    );
    expect(check.passed).toBe(true);
    expect(check.message).toContain('served: fixture-new-slug');
    expect(check.message).toContain(
      '(fixture-old-slug retires 2026-10-14; nexus-agents default is gpt-5.6-sol)'
    );
  });

  it('warns when user config pins the retiring slug (#6535)', () => {
    const check = codexModelsVerifyCheck(
      {
        status: 'warn',
        served,
        missing: [],
        retiring,
        reason: 'retiring per the codex cache',
      },
      { userPinnedSlug: 'fixture-old-slug' }
    );
    expect(check.passed).toBe(false);
    expect(check.severity).toBe('warn');
    expect(check.message).toContain('user config pins retiring slug');
    expect(check.fix).toBe(
      'Update nexus-agents, or set your model to fixture-new-slug in nexus-agents.yaml'
    );
  });

  it('warns when the retirement date has passed (#6535)', () => {
    const check = codexModelsVerifyCheck({
      status: 'warn',
      served,
      missing: [],
      retiring: [{ ...retiring[0]!, daysLeft: -3 }],
      reason: 'retiring per the codex cache',
    });
    expect(check.passed).toBe(false);
    expect(check.severity).toBe('warn');
    expect(check.message).toContain('retired 2026-10-14 (3 day(s) ago)');
    expect(check.fix).toContain('set your model to fixture-new-slug');
  });

  it('warns with user-facing fix when registry slug is not served (#6535)', () => {
    const check = codexModelsVerifyCheck({
      status: 'warn',
      served,
      missing: [{ id: 'fixture-missing', cliModelName: 'missing-slug' }],
      retiring: [],
      reason: 'not served',
    });
    expect(check.passed).toBe(false);
    expect(check.severity).toBe('warn');
    expect(check.fix).toBe(
      'Update nexus-agents, or configure a supported model in nexus-agents.yaml'
    );
    expect(check.fix).not.toContain('in-tree-data.ts');
  });

  it('renders unmeasured as a warn with user-facing fix when codex is installed (#6535)', () => {
    const check = codexModelsVerifyCheck(
      {
        status: 'unmeasured',
        served: [],
        missing: [],
        retiring: [],
        reason: 'no cache',
      },
      { isCodexInstalled: true }
    );
    expect(check.passed).toBe(false);
    expect(check.severity).toBe('warn');
    expect(check.message).toBe('unmeasured: no cache');
    expect(check.fix).toBe(
      'Run codex once so ~/.codex/models_cache.json exists, then re-run verify'
    );
    expect(check.fix).not.toContain('Install codex');
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
