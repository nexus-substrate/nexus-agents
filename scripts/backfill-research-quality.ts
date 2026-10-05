/**
 * backfill-research-quality.ts — Enrich existing papers with quality scores.
 *
 * Reads papers.yaml, fetches citation counts from Semantic Scholar,
 * computes quality_score and evidence_tier, writes back.
 *
 * Rate-limited: 1 request/second. Fails gracefully on API errors.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-research-quality.ts              # Enrich all
 *   pnpm exec tsx scripts/backfill-research-quality.ts --dry-run     # Preview only
 *   pnpm exec tsx scripts/backfill-research-quality.ts --limit 10    # First 10 only
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'yaml';
import {
  citationScore,
  classifyVenue,
  computeEvidenceTier,
  computeQualityScore,
} from '../packages/nexus-agents/src/research/research-quality.js';
import type { ResearchPaper } from '../packages/nexus-agents/src/research/research-schemas.js';

const PAPERS_PATH = resolve('docs/research/registry/papers.yaml');
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper';
const RATE_LIMIT_MS = 1100; // 1 req/sec with margin

type PaperEntry = Omit<ResearchPaper, 'rigor_tags'> & {
  rigor_tags?: ResearchPaper['rigor_tags'];
} & Record<string, unknown>;

/** A missing, null or empty string all mean "not recorded". */
function isBlank(value: string | null | undefined): value is null | undefined | '' {
  return value === undefined || value === null || value === '';
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

interface BackfillArgs {
  dryRun: boolean;
  limit: number;
}

function parseArgs(argv: readonly string[]): BackfillArgs {
  const dryRun = argv.includes('--dry-run');
  // Accept both `--limit=N` and the documented `--limit N`.
  const index = argv.findIndex((a) => a === '--limit' || a.startsWith('--limit='));
  const flag = index === -1 ? undefined : argv[index];
  const value = flag === '--limit' ? argv[index + 1] : flag?.split('=')[1];
  const limit = value !== undefined ? parseInt(value, 10) : 999;
  return { dryRun, limit };
}

/**
 * Skip papers already enriched with a non-zero score. A paper scored 0 is
 * re-scored once its last check is more than 30 days old, so new Semantic
 * Scholar data can lift it.
 */
function isAlreadyEnriched(paper: PaperEntry): boolean {
  const isEnriched = paper.quality_score !== undefined && paper.citation_count !== undefined;
  const lastCheck =
    typeof paper.last_quality_check === 'string' ? paper.last_quality_check : undefined;
  const isStaleZero = paper.quality_score === 0 && isOlderThanDays(lastCheck, 30);
  return isEnriched && !isStaleZero;
}

/** Fetches citations for a paper that has an arXiv id and no count yet. Returns false on an API error. */
async function fillCitations(paper: PaperEntry): Promise<boolean> {
  if (isBlank(paper.arxiv_id) || paper.citation_count !== undefined) return true;
  const result = await fetchCitations(paper.arxiv_id);
  if (result !== null) {
    paper.citation_count = result.citations;
    if (!isBlank(result.venue) && isBlank(paper.venue)) {
      paper.venue = result.venue;
    }
  }
  await sleep(RATE_LIMIT_MS);
  return result !== null;
}

/** Auto-detects rigor tags from the paper's code and venue evidence. */
function detectRigorTags(paper: PaperEntry, venueTier: number): ResearchPaper['rigor_tags'] {
  const tags: ResearchPaper['rigor_tags'] = [...(paper.rigor_tags ?? [])];
  if (paper.has_code === true && !tags.includes('has-code')) tags.push('has-code');
  if (venueTier >= 1 && !tags.includes('peer-reviewed')) tags.push('peer-reviewed');
  return tags;
}

/** Why a paper landed in the low tier, for the audit trail. */
function lowTierReasons(paper: PaperEntry): string {
  const reasons: string[] = [];
  if (citationScore(paper.citation_count) === 0) reasons.push('no citations found');
  if (paper.venue_tier === 0) reasons.push('arXiv preprint (not peer-reviewed)');
  if (paper.has_code !== true) reasons.push('no code repository');
  return reasons.join('; ');
}

interface ScoredPaper {
  quality_score: number;
  evidence_tier: 'high' | 'medium' | 'low';
}

/** Computes venue tier, rigor tags, score, evidence tier and the audit trail in place. */
function scorePaper(paper: PaperEntry): ScoredPaper {
  paper.venue_tier = classifyVenue(paper.venue);

  const tags = detectRigorTags(paper, paper.venue_tier);
  if (tags.length > 0) {
    paper.rigor_tags = tags;
  }

  // Compute quality score and evidence tier
  paper.quality_score = computeQualityScore({ ...paper, rigor_tags: tags });
  paper.evidence_tier = computeEvidenceTier({ ...paper, rigor_tags: tags });

  // Add quality audit trail — enables future re-review
  paper.last_quality_check = new Date().toISOString().slice(0, 10);
  const hasNotes = typeof paper.quality_notes === 'string' && paper.quality_notes !== '';
  if (paper.evidence_tier === 'low' && !hasNotes) {
    paper.quality_notes = lowTierReasons(paper);
  }
  return { quality_score: paper.quality_score, evidence_tier: paper.evidence_tier };
}

function formatProgress(
  i: number,
  total: number,
  id: string,
  paper: PaperEntry,
  scored: ScoredPaper
): string {
  const tier = scored.evidence_tier.toUpperCase().padEnd(6);
  const citations = paper.citation_count === undefined ? '?' : String(paper.citation_count);
  return `[${String(i).padStart(3)}/${String(total)}] ${tier} score=${String(scored.quality_score)} citations=${citations} ${id}`;
}

async function main(): Promise<void> {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  const content = readFileSync(PAPERS_PATH, 'utf-8');
  const data = yaml.parse(content) as {
    schema_version: string;
    papers: Record<string, PaperEntry>;
  };
  const papers = data.papers;
  const total = Object.keys(papers).length;

  console.log(`Research Quality Backfill`);
  console.log(`Papers: ${String(total)}, Limit: ${String(limit)}, Dry run: ${String(dryRun)}`);
  console.log('');

  let enriched = 0;
  let skipped = 0;
  let errors = 0;
  let i = 0;

  for (const [id, paper] of Object.entries(papers)) {
    if (i >= limit) break;
    i++;

    if (isAlreadyEnriched(paper)) {
      skipped++;
      continue;
    }

    const fetched = await fillCitations(paper);
    if (!fetched) errors++;
    const scored = scorePaper(paper);

    enriched++;
    console.log(formatProgress(i, total, id, paper, scored));
  }

  console.log('');
  console.log(
    `Enriched: ${String(enriched)}, Skipped: ${String(skipped)}, API errors: ${String(errors)}`
  );

  if (!dryRun && enriched > 0) {
    // Write back with yaml.stringify to preserve structure
    const output = yaml.stringify(data, { lineWidth: 0 });
    writeFileSync(PAPERS_PATH, output);
    console.log(`Written to ${PAPERS_PATH}`);
  } else if (dryRun) {
    console.log('Dry run — no changes written');
  }
}

if (process.argv[1]?.endsWith('backfill-research-quality.ts') === true) {
  main().catch(console.error);
}
