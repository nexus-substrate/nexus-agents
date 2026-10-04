/** Regression tests for research quality backfill write-back and CLI behavior. */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import yaml from 'yaml';

const NOW = '2026-10-04T12:00:00Z';
const originalArgv = process.argv;
let sandbox: string;
let papersPath: string;
let outputLines: string[];

function seed(papers: Record<string, Record<string, unknown>>): string {
  const content = yaml.stringify({ schema_version: '1.0', papers });
  writeFileSync(papersPath, content);
  return content;
}

function readPapers(): Record<string, Record<string, unknown>> {
  return (
    yaml.parse(readFileSync(papersPath, 'utf8')) as {
      papers: Record<string, Record<string, unknown>>;
    }
  ).papers;
}

async function runScript(...args: string[]): Promise<void> {
  process.argv = ['node', join(import.meta.dirname, 'backfill-research-quality.ts'), ...args];
  await import('./backfill-research-quality.js');
  await vi.waitFor(
    () => {
      const output = outputLines.join('\n');
      expect(output).toContain(args.includes('--dry-run') ? 'no changes written' : 'Written to');
    },
    { timeout: 5000 }
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  sandbox = mkdtempSync(join(tmpdir(), 'backfill-research-quality-'));
  const registry = join(sandbox, 'docs/research/registry');
  mkdirSync(registry, { recursive: true });
  papersPath = join(registry, 'papers.yaml');
  vi.spyOn(process, 'cwd').mockReturnValue(sandbox);
  outputLines = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    outputLines.push(args.map(String).join(' '));
  });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected fetch')));
});

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('research quality backfill', () => {
  it('writes a low-citation preprint at 6, the no-venue maximum', async () => {
    seed({
      preprint: {
        title: 'Recent preprint with code',
        source: 'arxiv',
        venue: null,
        citation_count: 50,
        has_code: true,
        publication_date: '2026-10',
      },
    });
    await runScript();
    expect(readPapers()['preprint']).toMatchObject({
      quality_score: 6,
      evidence_tier: 'medium',
      venue_tier: 0,
      rigor_tags: ['has-code'],
      last_quality_check: '2026-10-04',
    });
  });

  it('writes the score the canonical scorer returns instead of rescoring signals', async () => {
    // These inputs score 8 on their own (citations 1, venue 3, code 2, recency 2), so a
    // written 7 can only come from the canonical scorer the script delegates to.
    const scorer = await import('../packages/nexus-agents/src/research/research-quality.js');
    vi.spyOn(scorer, 'computeQualityScore').mockReturnValue(7);
    seed({
      paper: {
        title: 'Conference paper with strong signals',
        source: 'arxiv',
        venue: 'NeurIPS',
        citation_count: 5,
        has_code: true,
        publication_date: '2026-10',
      },
    });
    await runScript();
    expect(readPapers()['paper']).toMatchObject({ quality_score: 7 });
  });

  it('gives a letterless venue no tier and no peer-reviewed tag', async () => {
    seed({
      yearOnly: {
        title: 'Venue field holds only a year',
        source: 'arxiv',
        venue: '2024',
        citation_count: 5,
        has_code: true,
        publication_date: '2020-01',
      },
    });
    await runScript();
    const written = readPapers()['yearOnly'];
    expect(written).toMatchObject({ quality_score: 3, venue_tier: 0 });
    expect(written?.['rigor_tags']).not.toContain('peer-reviewed');
  });

  it('uses the canonical evidence tier', async () => {
    const scorer = await import('../packages/nexus-agents/src/research/research-quality.js');
    vi.spyOn(scorer, 'computeEvidenceTier').mockReturnValue('low');
    seed({ paper: { title: 'Scored by canonical policy', citation_count: 5, has_code: true } });
    await runScript();
    expect(readPapers()['paper']?.['evidence_tier']).toBe('low');
  });

  it('retains the no-citations audit note for null registry citations', async () => {
    seed({ paper: { title: 'Null citations', source: 'arxiv', citation_count: null } });
    await runScript();
    expect(readPapers()['paper']).toMatchObject({
      quality_score: 0,
      evidence_tier: 'low',
      quality_notes: 'no citations found; arXiv preprint (not peer-reviewed); no code repository',
    });
  });

  it('fetches citations and venue and writes the enriched paper', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          citationCount: 50,
          venue: 'NeurIPS',
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    seed({ paper: { title: 'Fetched paper', arxiv_id: '2601.12345', has_code: true } });
    await runScript();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.semanticscholar.org/graph/v1/paper/ARXIV:2601.12345?fields=citationCount,venue'
    );
    expect(readPapers()['paper']).toMatchObject({
      citation_count: 50,
      venue: 'NeurIPS',
      venue_tier: 3,
      quality_score: 7,
      evidence_tier: 'high',
    });
  });

  it('reports fetch failures and still writes the available quality signals', async () => {
    seed({ paper: { title: 'Unavailable citations', arxiv_id: '2601.12345' } });
    await runScript();
    expect(readPapers()['paper']).toMatchObject({ quality_score: 0, evidence_tier: 'low' });
    expect(outputLines.join('\n')).toContain('API errors: 1');
  });

  it('fetches in dry-run mode without changing the registry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ citationCount: 5 })));
    vi.stubGlobal('fetch', fetchMock);
    const original = seed({ paper: { title: 'Dry run', arxiv_id: '2601.12345' } });
    await runScript('--dry-run');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(readFileSync(papersPath, 'utf8')).toBe(original);
  });

  it('honors the documented space-separated form --limit N', async () => {
    seed({
      first: { title: 'First candidate', citation_count: 5 },
      second: { title: 'Beyond limit', citation_count: 5 },
    });
    await runScript('--limit', '1');
    expect(readPapers()['first']?.['quality_score']).toBe(1);
    expect(readPapers()['second']?.['quality_score']).toBeUndefined();
    expect(outputLines.join('\n')).toContain('Limit: 1,');
  });

  it('honors --limit and skips already enriched papers', async () => {
    seed({
      enriched: { title: 'Already enriched', citation_count: 20, quality_score: 2 },
      first: { title: 'First candidate', citation_count: 5 },
      second: { title: 'Beyond limit', citation_count: 5 },
    });
    await runScript('--limit=2');
    expect(readPapers()['enriched']?.['quality_score']).toBe(2);
    expect(readPapers()['first']?.['quality_score']).toBe(1);
    expect(readPapers()['second']?.['quality_score']).toBeUndefined();
    expect(outputLines.join('\n')).toContain('Enriched: 1, Skipped: 1, API errors: 0');
  });
});
