/**
 * Tests for the Diátaxis frontmatter gate (#7196).
 *
 * The empty cases matter most. A scan that finds no pages, a kinds config
 * with no kinds, and a baseline that cannot be read must each FAIL, never
 * read as a clean tree.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  parseFrontmatter,
  parseNoneKinds,
  parseBaseline,
  matchNoneKind,
  checkPage,
  evaluate,
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

describe('parseBaseline', () => {
  it('parses both counts', () => {
    expect(parseBaseline({ missing: { diataxis: 3, audience: 4 } })).toEqual({
      diataxis: 3,
      audience: 4,
    });
  });

  it('rejects a baseline missing a count', () => {
    expect(() => parseBaseline({ missing: { diataxis: 3 } })).toThrow();
  });

  it('rejects a negative or fractional count', () => {
    expect(() => parseBaseline({ missing: { diataxis: -1, audience: 0 } })).toThrow();
    expect(() => parseBaseline({ missing: { diataxis: 1.5, audience: 0 } })).toThrow();
  });
});

describe('evaluate', () => {
  const missingBoth = (path: string): PageResult => ({
    path,
    errors: [],
    missing: { diataxis: true, audience: true },
  });

  it('reports zero scanned pages as unmeasured, not as a pass', () => {
    const v = evaluate([], { diataxis: 0, audience: 0 });
    expect(v.status).toBe('unmeasured');
  });

  it('passes when the missing counts equal the baseline', () => {
    const v = evaluate([missingBoth('a.md'), declared('b.md')], { diataxis: 1, audience: 1 });
    expect(v.status).toBe('pass');
    expect(v.missing).toEqual({ diataxis: 1, audience: 1 });
  });

  it('passes when the counts fall below the baseline, and says it can tighten', () => {
    const v = evaluate([declared('a.md')], { diataxis: 1, audience: 1 });
    expect(v.status).toBe('pass');
    expect(v.canTighten).toBe(true);
  });

  it('fails when the diataxis count grows', () => {
    const v = evaluate(
      [
        missingBoth('a.md'),
        { path: 'b.md', errors: [], missing: { diataxis: true, audience: false } },
      ],
      { diataxis: 1, audience: 1 }
    );
    expect(v.status).toBe('fail');
    expect(v.grew).toEqual(['diataxis']);
  });

  it('fails when only the audience count grows', () => {
    const v = evaluate(
      [
        missingBoth('a.md'),
        { path: 'b.md', errors: [], missing: { diataxis: false, audience: true } },
      ],
      { diataxis: 1, audience: 1 }
    );
    expect(v.status).toBe('fail');
    expect(v.grew).toEqual(['audience']);
  });

  it('fails on an invalid page even when the counts are within the baseline', () => {
    const bad: PageResult = {
      path: 'a.md',
      errors: ['bad'],
      missing: { diataxis: false, audience: false },
    };
    const v = evaluate([bad], { diataxis: 5, audience: 5 });
    expect(v.status).toBe('fail');
    expect(v.invalid).toEqual([bad]);
  });
});
