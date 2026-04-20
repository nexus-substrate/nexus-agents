/**
 * Pre-flight research lookup for SWE-bench instances (#1414 option 3).
 *
 * Loads the in-repo research registry (`docs/research/registry/papers.yaml`)
 * and finds the top-N papers whose summary or tags overlap with keywords
 * extracted from a SWE-bench instance's problem statement. Returns a
 * compact prompt fragment ready to splice into the agent's system prompt.
 *
 * Zero-cost: no LLM calls. The registry is already bundled with the
 * package, so this is pure in-memory keyword matching.
 *
 * Opt-in via `NEXUS_PREFLIGHT_RESEARCH=1` (default off) so cost-conscious
 * users never see extra prompt size unless they want it.
 *
 * @module swe-bench/preflight-research
 */

import { loadPapersRegistry } from '../cli/research-helpers-io.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'preflight-research' });

/** Opt-in flag. Default off so prompts stay compact for cost-sensitive runs. */
export function isPreflightResearchEnabled(): boolean {
  return process.env['NEXUS_PREFLIGHT_RESEARCH'] === '1';
}

/**
 * Extract candidate search keywords from a problem statement. Simple
 * heuristic: lowercase, strip punctuation, take words >= 4 chars that
 * aren't stopwords. Dedupe. Cap at 15 keywords.
 */
const KEYWORD_STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'have',
  'when',
  'where',
  'which',
  'will',
  'should',
  'would',
  'could',
  'what',
  'whose',
  'their',
  'then',
  'than',
  'them',
  'there',
  'here',
  'been',
  'being',
  'does',
  'doesn',
  'isn',
  'into',
  'more',
  'some',
  'also',
  'such',
  'only',
  'over',
  'like',
  'between',
  'error',
  'issue',
  'problem',
  'bug',
  'fix',
  'test',
]);

export function extractKeywords(problemStatement: string): readonly string[] {
  const words = problemStatement
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !KEYWORD_STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 15);
}

/** A ranked paper hit. */
export interface PaperHit {
  readonly arxivId: string;
  readonly title: string;
  readonly summary: string;
  readonly score: number;
}

/**
 * Score a single paper against a set of keywords. Summary matches weight
 * 1, tag matches weight 2 (tags are curated, more signal per match).
 */
function scorePaper(
  paper: { summary?: string; tags?: readonly string[] },
  keywords: readonly string[]
): number {
  const summary = (paper.summary ?? '').toLowerCase();
  const tags = (paper.tags ?? []).map((t) => t.toLowerCase());
  let score = 0;
  for (const kw of keywords) {
    if (summary.includes(kw)) score += 1;
    for (const tag of tags) {
      if (tag.includes(kw)) score += 2;
    }
  }
  return score;
}

/**
 * Find top-N papers most relevant to the problem statement's keywords.
 * Returns empty array when disabled, registry unavailable, or no
 * matches cross the minimum score threshold.
 */
export async function findRelevantPapers(
  problemStatement: string,
  topN = 3
): Promise<readonly PaperHit[]> {
  if (!isPreflightResearchEnabled()) return [];
  try {
    const registryResult = await loadPapersRegistry();
    if (!registryResult.ok) {
      logger.debug('preflight-research: registry unavailable', {
        error: registryResult.error.message,
      });
      return [];
    }
    const registry = registryResult.value;
    const keywords = extractKeywords(problemStatement);
    if (keywords.length === 0) return [];
    const hits: PaperHit[] = [];
    for (const [arxivId, paper] of Object.entries(registry.papers)) {
      const score = scorePaper(paper, keywords);
      if (score > 0) {
        hits.push({
          arxivId,
          title: paper.title,
          summary: paper.summary.slice(0, 200),
          score,
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, topN);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn('preflight-research: lookup failed, skipping', { error: msg });
    return [];
  }
}

/**
 * Render paper hits as a compact prompt fragment. Returns empty string
 * when the hits array is empty so the caller can naively concatenate.
 */
export function renderResearchContext(hits: readonly PaperHit[]): string {
  if (hits.length === 0) return '';
  const lines = ['## Relevant research (pre-flight)', ''];
  for (const hit of hits) {
    lines.push(`- **${hit.title}** (${hit.arxivId}): ${hit.summary}`);
  }
  lines.push('');
  return lines.join('\n');
}
