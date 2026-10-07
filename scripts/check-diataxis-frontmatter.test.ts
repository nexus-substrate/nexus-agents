/**
 * Tests for the Diátaxis frontmatter gate (#7196).
 *
 * The empty cases matter most. A scan that finds no pages, a kinds config
 * with no kinds, and a baseline that cannot be read must each FAIL, never
 * read as a clean tree.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, it, expect } from 'vitest';

import {
  parseFrontmatter,
  parseNoneKinds,
  parseBaseline,
  matchNoneKind,
  checkPage,
  evaluate,
  updateBaseline,
  runCli,
  type Baseline,
  type NoneKinds,
  type PageResult,
} from './check-diataxis-frontmatter.js';

const KINDS: NoneKinds = {
  index: { basenames: ['README.md', 'index.md'], pathPrefixes: [] },
  adr: { basenames: [], pathPrefixes: ['docs/adr/'] },
  archive: { basenames: [], pathPrefixes: ['docs/archive/'] },
};

function page(fm: string, body = '# Title\n'): string {
  return `---\n${fm}\n---\n\n${body}`;
}

function declared(path: string): PageResult {
  return { path, errors: [], missing: { diataxis: false, audience: false } };
}

describe('parseFrontmatter', () => {
  it('returns null data when the file has no frontmatter', () => {
    expect(parseFrontmatter('# Just a heading\n')).toEqual({ ok: true, data: null });
  });

  it('parses a frontmatter block', () => {
    expect(parseFrontmatter(page('diataxis: how-to\naudience: user'))).toEqual({
      ok: true,
      data: { diataxis: 'how-to', audience: 'user' },
    });
  });

  it('reports an unterminated block as an error, not as no frontmatter', () => {
    const r = parseFrontmatter('---\ndiataxis: how-to\n# never closed\n');
    expect(r.ok).toBe(false);
  });

  it('reports malformed YAML as an error', () => {
    const r = parseFrontmatter(page('diataxis: [unclosed'));
    expect(r.ok).toBe(false);
  });

  it('strips a leading UTF-8 BOM before looking for the fence', () => {
    expect(parseFrontmatter(`\uFEFF${page('diataxis: how-to\naudience: user')}`)).toEqual({
      ok: true,
      data: { diataxis: 'how-to', audience: 'user' },
    });
  });

  it('accepts fence lines with trailing whitespace', () => {
    expect(parseFrontmatter('---  \ndiataxis: reference\n--- \t\n# x\n')).toEqual({
      ok: true,
      data: { diataxis: 'reference' },
    });
  });

  it('accepts CRLF line endings', () => {
    expect(parseFrontmatter('---\r\naudience: project\r\n---\r\n# x\r\n')).toEqual({
      ok: true,
      data: { audience: 'project' },
    });
  });

  it('treats an empty block as no keys, not as an error', () => {
    expect(parseFrontmatter('---\n---\n# x\n')).toEqual({ ok: true, data: {} });
  });
});

describe('matchNoneKind', () => {
  it('matches an index page by basename at any depth', () => {
    expect(matchNoneKind('docs/guides/README.md', KINDS)).toBe('index');
  });

  it('matches an ADR by path prefix', () => {
    expect(matchNoneKind('docs/adr/0001-x.md', KINDS)).toBe('adr');
  });

  it('matches nothing for an ordinary page', () => {
    expect(matchNoneKind('docs/guides/setup.md', KINDS)).toBeUndefined();
  });

  it('matches nothing when no kinds are configured', () => {
    expect(matchNoneKind('docs/README.md', {})).toBeUndefined();
  });
});

describe('checkPage', () => {
  it('accepts every valid pair', () => {
    for (const t of ['tutorial', 'how-to', 'reference', 'explanation']) {
      for (const a of ['user', 'project']) {
        const r = checkPage('docs/x.md', page(`diataxis: ${t}\naudience: ${a}`), KINDS);
        expect(r).toEqual(declared('docs/x.md'));
      }
    }
  });

  it('counts a page with no frontmatter as missing both keys, without an error', () => {
    const r = checkPage('docs/x.md', '# x\n', KINDS);
    expect(r.errors).toEqual([]);
    expect(r.missing).toEqual({ diataxis: true, audience: true });
  });

  it('counts frontmatter that lacks the keys as missing', () => {
    const r = checkPage('docs/x.md', page('title: X'), KINDS);
    expect(r.errors).toEqual([]);
    expect(r.missing).toEqual({ diataxis: true, audience: true });
  });

  it('rejects an unknown diataxis value', () => {
    const r = checkPage('docs/x.md', page('diataxis: guide\naudience: user'), KINDS);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('guide');
  });

  it('rejects a list value, even of valid types', () => {
    const r = checkPage('docs/x.md', page('diataxis: [how-to, reference]\naudience: user'), KINDS);
    expect(r.errors.join(' ')).toContain('single value');
  });

  it('rejects a key that is present but empty', () => {
    const r = checkPage('docs/x.md', page('diataxis:\naudience: user'), KINDS);
    expect(r.errors).toHaveLength(1);
  });

  it('rejects an unknown audience value', () => {
    const r = checkPage('docs/x.md', page('diataxis: reference\naudience: everyone'), KINDS);
    expect(r.errors.join(' ')).toContain('everyone');
  });

  it('rejects an audience list', () => {
    const r = checkPage('docs/x.md', page('diataxis: reference\naudience: [user, project]'), KINDS);
    expect(r.errors.join(' ')).toContain('single value');
  });

  it('accepts none on a page of a named kind', () => {
    const r = checkPage('docs/adr/0001-x.md', page('diataxis: none\naudience: project'), KINDS);
    expect(r).toEqual(declared('docs/adr/0001-x.md'));
  });

  it('rejects none on a page that is not a named kind', () => {
    const r = checkPage('docs/guides/setup.md', page('diataxis: none\naudience: user'), KINDS);
    expect(r.errors.join(' ')).toContain('none');
  });

  it('rejects none everywhere when no kinds are configured', () => {
    const r = checkPage('docs/README.md', page('diataxis: none\naudience: user'), {});
    expect(r.errors).toHaveLength(1);
  });

  it('reports malformed frontmatter as an error', () => {
    const r = checkPage('docs/x.md', '---\ndiataxis: how-to\n', KINDS);
    expect(r.errors).toHaveLength(1);
  });
});

describe('parseNoneKinds', () => {
  it('rejects a config with no kinds', () => {
    expect(() => parseNoneKinds({ kinds: {} })).toThrow(/no kinds/);
  });

  it('rejects a kind that matches nothing', () => {
    expect(() =>
      parseNoneKinds({ kinds: { adr: { description: 'x', basenames: [], pathPrefixes: [] } } })
    ).toThrow(/adr/);
  });

  it('rejects a malformed config', () => {
    expect(() => parseNoneKinds({ kinds: { adr: { basenames: 'README.md' } } })).toThrow();
  });

  it('parses the committed config, which names the five kinds from #7196', () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(process.cwd(), 'docs', 'ops', 'diataxis-none-kinds.json'), 'utf8')
    );
    expect(Object.keys(parseNoneKinds(raw)).sort()).toEqual([
      'adr',
      'archive',
      'changelog',
      'index',
      'research',
    ]);
  });
});

const EMPTY: Baseline = { diataxis: [], audience: [] };

function missing(path: string, diataxis: boolean, audience: boolean): PageResult {
  return { path, errors: [], missing: { diataxis, audience } };
}

describe('parseBaseline', () => {
  it('parses both path sets', () => {
    expect(parseBaseline({ missing: { diataxis: ['docs/a.md'], audience: [] } })).toEqual({
      diataxis: ['docs/a.md'],
      audience: [],
    });
  });

  it('rejects a baseline missing a set', () => {
    expect(() => parseBaseline({ missing: { diataxis: [] } })).toThrow();
  });

  it('rejects the old count shape', () => {
    expect(() => parseBaseline({ missing: { diataxis: 3, audience: 4 } })).toThrow();
  });

  it('rejects a duplicated path', () => {
    expect(() =>
      parseBaseline({ missing: { diataxis: ['docs/a.md', 'docs/a.md'], audience: [] } })
    ).toThrow(/duplicate/);
  });
});

describe('evaluate', () => {
  it('reports zero scanned pages as unmeasured, not as a pass', () => {
    expect(evaluate([], EMPTY).status).toBe('unmeasured');
  });

  it('reports zero scanned pages as unmeasured even when the baseline lists pages', () => {
    expect(evaluate([], { diataxis: ['docs/a.md'], audience: [] }).status).toBe('unmeasured');
  });

  it('passes when the undeclared pages are exactly the baseline set', () => {
    const v = evaluate([missing('docs/a.md', true, true), declared('docs/b.md')], {
      diataxis: ['docs/a.md'],
      audience: ['docs/a.md'],
    });
    expect(v.status).toBe('pass');
    expect(v.missing).toEqual({ diataxis: ['docs/a.md'], audience: ['docs/a.md'] });
  });

  it('fails on a NEW undeclared page even when another listed page got declared (the swap)', () => {
    // Before: a undeclared (listed), b declared. After: a declared, b undeclared.
    // A count ratchet reads 1 == 1 and passes; the set must catch both sides.
    const v = evaluate([declared('docs/a.md'), missing('docs/b.md', true, false)], {
      diataxis: ['docs/a.md'],
      audience: [],
    });
    expect(v.status).toBe('fail');
    expect(v.newlyMissing.diataxis).toEqual(['docs/b.md']);
    expect(v.nowDeclared.diataxis).toEqual(['docs/a.md']);
  });

  it('fails when a listed page now declares the key (unspent slack is stale)', () => {
    const v = evaluate([declared('docs/a.md')], { diataxis: ['docs/a.md'], audience: [] });
    expect(v.status).toBe('fail');
    expect(v.nowDeclared).toEqual({ diataxis: ['docs/a.md'], audience: [] });
  });

  it('fails when a listed path no longer exists', () => {
    const v = evaluate([declared('docs/a.md')], { diataxis: [], audience: ['docs/gone.md'] });
    expect(v.status).toBe('fail');
    expect(v.vanished).toEqual({ diataxis: [], audience: ['docs/gone.md'] });
  });

  it('checks the audience set independently of the diataxis set', () => {
    const v = evaluate([missing('docs/a.md', true, true)], {
      diataxis: ['docs/a.md'],
      audience: [],
    });
    expect(v.status).toBe('fail');
    expect(v.newlyMissing).toEqual({ diataxis: [], audience: ['docs/a.md'] });
  });

  it('fails on an invalid page even when the sets match', () => {
    const bad: PageResult = {
      path: 'docs/a.md',
      errors: ['bad'],
      missing: { diataxis: false, audience: false },
    };
    const v = evaluate([bad], EMPTY);
    expect(v.status).toBe('fail');
    expect(v.invalid).toEqual([bad]);
  });
});

describe('updateBaseline', () => {
  it('refuses to write from zero pages', () => {
    expect(updateBaseline([], EMPTY, true)).toEqual({ ok: false, reason: 'unmeasured' });
  });

  it('removes declared and vanished entries without --allow-growth', () => {
    const r = updateBaseline(
      [declared('docs/a.md'), missing('docs/b.md', true, true)],
      {
        diataxis: ['docs/a.md', 'docs/b.md', 'docs/gone.md'],
        audience: ['docs/b.md'],
      },
      false
    );
    expect(r).toEqual({ ok: true, baseline: { diataxis: ['docs/b.md'], audience: ['docs/b.md'] } });
  });

  it('refuses to add a path without --allow-growth', () => {
    const r = updateBaseline([missing('docs/new.md', true, false)], EMPTY, false);
    expect(r).toEqual({
      ok: false,
      reason: 'growth',
      added: { diataxis: ['docs/new.md'], audience: [] },
    });
  });

  it('adds paths with --allow-growth, sorted', () => {
    const r = updateBaseline(
      [missing('docs/z.md', true, true), missing('docs/a.md', true, true)],
      EMPTY,
      true
    );
    expect(r).toEqual({
      ok: true,
      baseline: { diataxis: ['docs/a.md', 'docs/z.md'], audience: ['docs/a.md', 'docs/z.md'] },
    });
  });

  it('treats an absent old baseline as empty, so seeding needs --allow-growth', () => {
    const r = updateBaseline([missing('docs/a.md', true, false)], undefined, false);
    expect(r.ok).toBe(false);
  });
});

describe('runCli (main with an injected root)', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  const KINDS_JSON = {
    kinds: { index: { basenames: ['README.md'], pathPrefixes: [] } },
  };

  function fixture(files: Record<string, string>, baseline?: Baseline): string {
    const root = mkdtempSync(join(tmpdir(), 'diataxis-cli-'));
    roots.push(root);
    const all: Record<string, string> = {
      'docs/ops/diataxis-none-kinds.json': JSON.stringify(KINDS_JSON),
      ...files,
    };
    if (baseline !== undefined) {
      all['docs/ops/diataxis-frontmatter-baseline.json'] = JSON.stringify({ missing: baseline });
    }
    for (const [rel, body] of Object.entries(all)) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), body);
    }
    return root;
  }

  function readBaseline(root: string): unknown {
    return JSON.parse(
      readFileSync(join(root, 'docs/ops/diataxis-frontmatter-baseline.json'), 'utf8')
    );
  }

  it('exits 1 as UNMEASURED when docs/ holds no pages', () => {
    const r = runCli([], fixture({}, EMPTY));
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('UNMEASURED');
  });

  it('refuses --update-baseline on zero pages and leaves the baseline untouched', () => {
    const root = fixture({}, { diataxis: ['docs/a.md'], audience: [] });
    const r = runCli(['--update-baseline', '--allow-growth'], root);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('UNMEASURED');
    expect(readBaseline(root)).toEqual({ missing: { diataxis: ['docs/a.md'], audience: [] } });
  });

  it('refuses --update-baseline growth without --allow-growth', () => {
    const root = fixture({ 'docs/new.md': '# new\n' }, EMPTY);
    const r = runCli(['--update-baseline'], root);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('docs/new.md');
    expect(readBaseline(root)).toEqual({ missing: EMPTY });
  });

  it('writes the grown baseline with --allow-growth, one path per line', () => {
    const root = fixture({ 'docs/new.md': '# new\n' }, EMPTY);
    expect(runCli(['--update-baseline', '--allow-growth'], root).code).toBe(0);
    const text = readFileSync(join(root, 'docs/ops/diataxis-frontmatter-baseline.json'), 'utf8');
    expect(text).toContain('\n      "docs/new.md"\n');
    expect(runCli([], root).code).toBe(0);
  });

  it('exits 1 with a stale entry and names --update-baseline', () => {
    const root = fixture(
      { 'docs/a.md': page('diataxis: how-to\naudience: user') },
      { diataxis: ['docs/a.md'], audience: [] }
    );
    const r = runCli([], root);
    expect(r.code).toBe(1);
    expect(r.err.join('\n')).toContain('--update-baseline');
  });

  it('exits 1 when the baseline file is missing', () => {
    const r = runCli([], fixture({ 'docs/a.md': '# a\n' }));
    expect(r.code).toBe(1);
  });

  it('skips docs/api/', () => {
    const root = fixture(
      { 'docs/api/x.md': '# generated\n', 'docs/a.md': page('diataxis: how-to\naudience: user') },
      EMPTY
    );
    expect(runCli([], root).code).toBe(0);
  });
});
