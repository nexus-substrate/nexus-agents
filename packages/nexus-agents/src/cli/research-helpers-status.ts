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
  PaperEntry,
  ResearchStatusOptions,
  ResearchStatusResult,
} from './research-types.js';
import { loadTechniquesRegistry, loadPapersRegistry } from './research-helpers-io.js';

// =============================================================================
// EVIDENCE JOIN (#4287)
// =============================================================================

/**
 * Read-time evidence weight for a technique, joined from papers.yaml.
 *
 * Resolves each id in `entry.source_papers` against the papers registry and
 * returns the MAX `quality_score` found (with that paper's `evidence_tier`,
 * defaulting to `'low'` when a scored paper omits the tier — mirroring
 * {@link research-helpers-synthesize}). Returns `undefined` when no source
 * paper resolves to a registry entry carrying a numeric `quality_score`.
 *
 * Pure and fail-soft: no I/O, no persistence. papers.yaml stays the single
 * source of truth — the result is derived fresh on every status read.
 */
export function computeTechniqueEvidence(
  entry: TechniqueEntry,
  papers: PapersRegistry
): { evidenceTier: 'high' | 'medium' | 'low'; qualityScore: number } | undefined {
  // Defensive against a malformed/partial registry object (fail-soft #4287):
  // a parsed YAML may not actually carry a `papers` map, so treat it as
  // optional at the boundary even though the declared type requires it.
  const registry = (papers as { papers?: Record<string, PaperEntry> }).papers;
  if (registry === undefined) return undefined;

  let best: { evidenceTier: 'high' | 'medium' | 'low'; qualityScore: number } | undefined;
  for (const paperId of entry.source_papers) {
    const paper = registry[paperId];
    if (paper === undefined) continue;
    const score = paper.quality_score;
    if (typeof score !== 'number') continue;
    if (best === undefined || score > best.qualityScore) {
      best = { evidenceTier: paper.evidence_tier ?? 'low', qualityScore: score };
    }
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
    return papersResult.ok ? papersResult.value : undefined;
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
