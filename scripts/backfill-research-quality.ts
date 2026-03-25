#!/usr/bin/env npx tsx
/* eslint-disable no-console, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/restrict-template-expressions, max-lines-per-function, complexity */
/**
 * backfill-research-quality.ts — Enrich existing papers with quality scores.
 *
 * Reads papers.yaml, fetches citation counts from Semantic Scholar,
 * computes quality_score and evidence_tier, writes back.
 *
 * Rate-limited: 1 request/second. Fails gracefully on API errors.
 *
 * Usage:
 *   npx tsx scripts/backfill-research-quality.ts              # Enrich all
 *   npx tsx scripts/backfill-research-quality.ts --dry-run     # Preview only
 *   npx tsx scripts/backfill-research-quality.ts --limit 10    # First 10 only
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'yaml';

const PAPERS_PATH = resolve('docs/research/registry/papers.yaml');
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper';
const RATE_LIMIT_MS = 1100; // 1 req/sec with margin

interface PaperEntry {
  title: string;
  arxiv_id?: string;
  url?: string;
  venue?: string | null;
  publication_date?: string;
  has_code?: boolean;
  citation_count?: number;
  venue_tier?: number;
  quality_score?: number;
  evidence_tier?: 'high' | 'medium' | 'low';
  rigor_tags?: string[];
  [key: string]: unknown;
}

// ── Quality scoring (mirrors research-quality.ts) ───────────────

const TIER_3 = new Set([
  'neurips',
  'nips',
  'icml',
  'iclr',
  'aaai',
  'acl',
  'emnlp',
  'cvpr',
  'iccv',
  'eccv',
  'sigir',
  'kdd',
  'www',
  'icse',
  'fse',
]);
const TIER_2 = new Set([
  'naacl',
  'coling',
  'eacl',
  'ijcai',
  'ecai',
  'aistats',
  'uai',
  'colt',
  'interspeech',
  'ase',
  'issta',
]);

function classifyVenue(venue: string | null | undefined): number {
  if (!venue) return 0;
  const n = venue.toLowerCase().replace(/[^a-z]/g, '');
  if (TIER_3.has(n)) return 3;
  if (TIER_2.has(n)) return 2;
  if (!n.includes('arxiv') && n.length > 0) return 1;
  return 0;
}

function citationScore(count: number | undefined): number {
  if (!count) return 0;
  if (count < 10) return 1;
  if (count < 100) return 2;
  return 3;
}

function recencyBoost(pubDate: string | undefined): number {
  if (!pubDate) return 0;
  const months = (Date.now() - new Date(pubDate).getTime()) / (30 * 24 * 60 * 60 * 1000);
  if (months < 6) return 2;
  if (months < 12) return 1;
  return 0;
}

function computeScore(p: PaperEntry): number {
  return Math.min(
    10,
    citationScore(p.citation_count) +
      (p.venue_tier ?? classifyVenue(p.venue)) +
      (p.has_code ? 2 : 0) +
      recencyBoost(p.publication_date)
  );
}

function computeTier(p: PaperEntry): 'high' | 'medium' | 'low' {
  const score = p.quality_score ?? computeScore(p);
  const tags = new Set(p.rigor_tags ?? []);
  if (tags.has('peer-reviewed') && tags.has('has-code') && tags.has('has-baselines')) return 'high';
  if (score >= 7) return 'high';
  if (tags.has('has-code') || score >= 4) return 'medium';
  return 'low';
}

// ── Semantic Scholar fetch ──────────────────────────────────────

async function fetchCitations(
  arxivId: string
): Promise<{ citations: number; venue: string | null } | null> {
  try {
    const url = `${SEMANTIC_SCHOLAR_API}/ARXIV:${arxivId}?fields=citationCount,venue`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { citationCount?: number; venue?: string };
    return {
      citations: data.citationCount ?? 0,
      venue: data.venue ?? null,
    };
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────────

/** Check if a date string is older than N days (or undefined). */
function isOlderThanDays(dateStr: string | undefined, days: number): boolean {
  if (dateStr === undefined) return true;
  const checkDate = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - checkDate.getTime();
  return diffMs > days * 24 * 60 * 60 * 1000;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? '999', 10) : 999;

  const content = readFileSync(PAPERS_PATH, 'utf-8');
  const data = yaml.parse(content) as {
    schema_version: string;
    papers: Record<string, PaperEntry>;
  };
  const papers = data.papers;
  const total = Object.keys(papers).length;

  console.log(`Research Quality Backfill`);
  console.log(`Papers: ${total}, Limit: ${limit}, Dry run: ${dryRun}`);
  console.log('');

  let enriched = 0;
  let skipped = 0;
  let errors = 0;
  let i = 0;

  for (const [id, paper] of Object.entries(papers)) {
    if (i >= limit) break;
    i++;

    // Skip if already enriched with non-zero score
    // Re-score papers with quality_score=0 if last check was >30 days ago
    // (allows re-enrichment when Semantic Scholar has new data)
    const isEnriched = paper.quality_score !== undefined && paper.citation_count !== undefined;
    const lastCheck =
      typeof paper.last_quality_check === 'string' ? paper.last_quality_check : undefined;
    const isStaleZero = paper.quality_score === 0 && isOlderThanDays(lastCheck, 30);
    if (isEnriched && !isStaleZero) {
      skipped++;
      continue;
    }

    // Fetch citations from Semantic Scholar
    if (paper.arxiv_id && paper.citation_count === undefined) {
      const result = await fetchCitations(paper.arxiv_id);
      if (result !== null) {
        paper.citation_count = result.citations;
        if (result.venue && !paper.venue) {
          paper.venue = result.venue;
        }
      } else {
        errors++;
      }
      await sleep(RATE_LIMIT_MS);
    }

    // Compute venue tier
    paper.venue_tier = classifyVenue(paper.venue);

    // Auto-detect rigor tags
    const tags: string[] = [...(paper.rigor_tags ?? [])];
    if (paper.has_code && !tags.includes('has-code')) tags.push('has-code');
    if (paper.venue_tier >= 1 && !tags.includes('peer-reviewed')) tags.push('peer-reviewed');
    if (tags.length > 0) {
      paper.rigor_tags = tags;
    }

    // Compute quality score and evidence tier
    paper.quality_score = computeScore(paper);
    paper.evidence_tier = computeTier(paper);

    // Add quality audit trail — enables future re-review
    paper.last_quality_check = new Date().toISOString().slice(0, 10);
    if (paper.evidence_tier === 'low' && !paper.quality_notes) {
      const reasons: string[] = [];
      if (!paper.citation_count) reasons.push('no citations found');
      if (paper.venue_tier === 0) reasons.push('arXiv preprint (not peer-reviewed)');
      if (!paper.has_code) reasons.push('no code repository');
      paper.quality_notes = reasons.join('; ');
    }

    enriched++;
    const tier = paper.evidence_tier.toUpperCase().padEnd(6);
    console.log(
      `[${String(i).padStart(3)}/${total}] ${tier} score=${paper.quality_score} citations=${paper.citation_count ?? '?'} ${id}`
    );
  }

  console.log('');
  console.log(`Enriched: ${enriched}, Skipped: ${skipped}, API errors: ${errors}`);

  if (!dryRun && enriched > 0) {
    // Write back with yaml.stringify to preserve structure
    const output = yaml.stringify(data, { lineWidth: 0 });
    writeFileSync(PAPERS_PATH, output);
    console.log(`Written to ${PAPERS_PATH}`);
  } else if (dryRun) {
    console.log('Dry run — no changes written');
  }
}

main().catch(console.error);
