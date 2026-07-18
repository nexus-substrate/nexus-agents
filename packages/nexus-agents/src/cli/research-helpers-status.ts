/**
 * Research Registry Status Helpers
 *
 * Functions for computing and formatting technique status information.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 */

import type {
  TechniqueEntry,
  TechniqueStatus,
  TechniqueStatusSummary,
  PapersRegistry,
  ResearchStatusOptions,
  ResearchStatusResult,
} from './research-types.js';
import { loadTechniquesRegistry, loadPapersRegistry } from './research-helpers-io.js';

// =============================================================================
// EVIDENCE JOIN (#4287)
// =============================================================================

/** Evidence tier, most-authoritative first. */
type EvidenceTier = 'high' | 'medium' | 'low';

/** Tier authority rank — higher wins when comparing two scored papers. */
const TIER_RANK: Record<EvidenceTier, number> = { high: 3, medium: 2, low: 1 };

/** True when candidate `a` should replace the running best `b` (higher tier, tie-break higher score). */
function outranksBest(
  a: { evidenceTier: EvidenceTier; qualityScore: number },
  b: { evidenceTier: EvidenceTier; qualityScore: number } | undefined
): boolean {
  if (b === undefined) return true;
  if (TIER_RANK[a.evidenceTier] !== TIER_RANK[b.evidenceTier]) {
    return TIER_RANK[a.evidenceTier] > TIER_RANK[b.evidenceTier];
  }
  return a.qualityScore > b.qualityScore;
}

/**
 * Type guard for a validated evidence tier (#4287). papers.yaml is parsed with
 * `parseYaml(...) as PapersRegistry` — NO Zod validation — so an out-of-enum
 * typo (`High`, `moderate`, `strong`) or a non-string could otherwise flow
 * through into the ordering path and produce a NaN comparator. Anything not
 * exactly one of the three tiers is rejected here at the join boundary.
 */
function isEvidenceTier(x: unknown): x is EvidenceTier {
  return x === 'high' || x === 'medium' || x === 'low';
}

/**
 * Read-time evidence weight for a technique, joined from papers.yaml.
 *
 * Resolves each id in `entry.source_papers` against the papers registry and
 * returns the highest VALIDATED `evidence_tier` found (tie-broken by the higher
 * `quality_score`), so the returned tier is the true max tier the ordering path
 * downstream sorts on. A resolved paper with a missing/invalid tier is
 * normalized to `'low'`. Returns `undefined` when no source paper resolves to a
 * registry entry carrying a finite `quality_score`.
 *
 * Treats `papers` as UNTRUSTED (unvalidated YAML): the container, its `papers`
 * map, each paper, the score, and the tier are all shape/enum-checked. Pure and
 * fail-soft — no I/O, no persistence, never throws. papers.yaml stays the single
 * source of truth; the result is derived fresh on every status read.
 */
export function computeTechniqueEvidence(
  entry: TechniqueEntry,
  papers: PapersRegistry
): { evidenceTier: EvidenceTier; qualityScore: number } | undefined {
  // A parsed YAML may be `null` (`yaml.parse('')`), carry `papers: null`
  // (`yaml.parse('papers:\n')`), or omit the map entirely — treat every shape
  // as untrusted at the boundary even though the declared type requires it.
  const registry = (papers as { papers?: unknown } | null | undefined)?.papers;
  if (registry === null || typeof registry !== 'object') return undefined;
  const map = registry as Record<string, unknown>;

  let best: { evidenceTier: EvidenceTier; qualityScore: number } | undefined;
  for (const paperId of entry.source_papers) {
    const paper = map[paperId];
    if (paper === null || typeof paper !== 'object') continue;
    const score = (paper as { quality_score?: unknown }).quality_score;
    // Number.isFinite rejects non-numbers, NaN, and ±Infinity (#4287 finding 4:
    // `typeof NaN === 'number'` would otherwise pass and mask later papers).
    if (!Number.isFinite(score)) continue;
    const rawTier = (paper as { evidence_tier?: unknown }).evidence_tier;
    const candidate = {
      evidenceTier: isEvidenceTier(rawTier) ? rawTier : 'low',
      qualityScore: score as number,
    };
    if (outranksBest(candidate, best)) best = candidate;
  }
  return best;
}

// =============================================================================
// CONVERSION HELPERS
// =============================================================================

/**
 * Convert technique entry to status summary.
 *
 * When `papers` is supplied, best-effort joins evidence weight (#4287) onto the
 * summary. Fields are omitted entirely when no source paper resolves, keeping
 * output byte-identical to the pre-#4287 shape.
 */
export function toStatusSummary(
  id: string,
  entry: TechniqueEntry,
  papers?: PapersRegistry
): TechniqueStatusSummary {
  const evidence = papers !== undefined ? computeTechniqueEvidence(entry, papers) : undefined;
  return {
    id,
    name: entry.name,
    status: entry.status,
    priority: entry.priority,
    topic: entry.topic,
    implementationIssue: entry.implementation_issue,
    ...(evidence !== undefined
      ? { evidenceTier: evidence.evidenceTier, qualityScore: evidence.qualityScore }
      : {}),
  };
}

// =============================================================================
// FILTERING
// =============================================================================

/**
 * Filter techniques by status.
 */
export function filterByStatus(
  techniques: Record<string, TechniqueEntry>,
  status: TechniqueStatus | 'all',
  papers?: PapersRegistry
): TechniqueStatusSummary[] {
  return Object.entries(techniques)
    .filter(([, entry]) => status === 'all' || entry.status === status)
    .map(([id, entry]) => toStatusSummary(id, entry, papers))
    .sort((a, b) => {
      // Sort by priority (P1 first), then by name
      const priorityOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
      const aPriority = a.priority !== null ? (priorityOrder[a.priority] ?? 4) : 4;
      const bPriority = b.priority !== null ? (priorityOrder[b.priority] ?? 4) : 4;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.name.localeCompare(b.name);
    });
}

// =============================================================================
// COUNTING
// =============================================================================

/**
 * Count techniques by status.
 */
export function countByStatus(
  techniques: Record<string, TechniqueEntry>
): ResearchStatusResult['counts'] {
  let implemented = 0;
  let planned = 0;
  let notStarted = 0;
  let rejected = 0;

  for (const entry of Object.values(techniques)) {
    switch (entry.status) {
      case 'implemented':
        implemented++;
        break;
      case 'planned':
      case 'in-progress':
        planned++;
        break;
      case 'not-started':
        notStarted++;
        break;
      case 'rejected':
        rejected++;
        break;
    }
  }

  return {
    implemented,
    planned,
    notStarted,
    rejected,
    total: implemented + planned + notStarted + rejected,
  };
}

// =============================================================================
// MAIN STATUS FUNCTION
// =============================================================================

/**
 * Load papers.yaml for the read-time evidence join, swallowing every failure
 * mode (#4287). Returns `undefined` on a missing/unparsable registry, a load
 * error, or when the loader is not available (e.g. mocked out in a unit test),
 * so callers can treat evidence weighting as a pure best-effort enrichment.
 */
async function loadPapersRegistrySoft(): Promise<PapersRegistry | undefined> {
  try {
    const papersResult = await loadPapersRegistry();
    if (!papersResult.ok) return undefined;
    // `parseYaml` can return `null` for an empty/whitespace-only file even on
    // the ok branch (`yaml.parse('') === null`), despite the declared non-null
    // type; map that to undefined so the join treats it as "no registry" rather
    // than dereferencing null.
    const value = papersResult.value as PapersRegistry | null;
    return value ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get status of techniques.
 */
export async function getResearchStatus(
  options: ResearchStatusOptions
): Promise<ResearchStatusResult> {
  const result = await loadTechniquesRegistry();
  if (!result.ok) {
    return {
      success: false,
      techniques: [],
      counts: { implemented: 0, planned: 0, notStarted: 0, rejected: 0, total: 0 },
    };
  }
  const registry = result.value;

  // Best-effort evidence join (#4287): load papers.yaml and weight each
  // technique by its highest-quality source paper at read time. Fail-soft —
  // any missing/unparsable registry (or a mock that doesn't stub it) leaves
  // `papers` undefined, so the summaries stay byte-identical to pre-#4287.
  const papers = await loadPapersRegistrySoft();

  // If specific technique requested
  if (options.techniqueId !== undefined && options.techniqueId !== '') {
    const entry = registry.techniques[options.techniqueId];
    if (entry === undefined) {
      return {
        success: false,
        techniques: [],
        counts: countByStatus(registry.techniques),
      };
    }
    return {
      success: true,
      techniques: [toStatusSummary(options.techniqueId, entry, papers)],
      counts: countByStatus(registry.techniques),
    };
  }

  // Filter by status
  const statusFilter = options.status === 'all' ? 'all' : (options.status as TechniqueStatus);
  const techniques = filterByStatus(registry.techniques, statusFilter, papers);

  return {
    success: true,
    techniques,
    counts: countByStatus(registry.techniques),
  };
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format status result for display.
 */
export function formatStatusResult(
  result: ResearchStatusResult,
  format: 'table' | 'json' | 'compact'
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  if (format === 'compact') {
    const lines = result.techniques.map(
      (t) => `${t.status.padEnd(12)} ${(t.priority ?? '-').padEnd(3)} ${t.id}`
    );
    return lines.join('\n');
  }

  // Table format
  const lines: string[] = [];
  lines.push('Research Registry Status');
  lines.push('='.repeat(60));
  lines.push('');

  // Summary counts
  const { counts } = result;
  lines.push(
    `Implemented: ${String(counts.implemented)} | Planned: ${String(counts.planned)} | Not Started: ${String(counts.notStarted)} | Rejected: ${String(counts.rejected)}`
  );
  lines.push(`Total: ${String(counts.total)}`);
  lines.push('');

  if (result.techniques.length === 0) {
    lines.push('No techniques found matching criteria.');
    return lines.join('\n');
  }

  // Table header
  lines.push('Status       | Pri | Topic          | ID');
  lines.push('-'.repeat(60));

  for (const tech of result.techniques) {
    const status = tech.status.padEnd(12);
    const priority = (tech.priority ?? '-').padEnd(3);
    const topic = tech.topic.slice(0, 14).padEnd(14);
    lines.push(`${status} | ${priority} | ${topic} | ${tech.id}`);
  }

  return lines.join('\n');
}
