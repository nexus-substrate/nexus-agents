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
  ResearchStatusOptions,
  ResearchStatusResult,
} from './research-types.js';
import { loadTechniquesRegistry } from './research-helpers-io.js';

// =============================================================================
// CONVERSION HELPERS
// =============================================================================

/**
 * Convert technique entry to status summary.
 */
export function toStatusSummary(id: string, entry: TechniqueEntry): TechniqueStatusSummary {
  return {
    id,
    name: entry.name,
    status: entry.status,
    priority: entry.priority,
    topic: entry.topic,
    implementationIssue: entry.implementation_issue,
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
  status: TechniqueStatus | 'all'
): TechniqueStatusSummary[] {
  return Object.entries(techniques)
    .filter(([, entry]) => status === 'all' || entry.status === status)
    .map(([id, entry]) => toStatusSummary(id, entry))
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
      techniques: [toStatusSummary(options.techniqueId, entry)],
      counts: countByStatus(registry.techniques),
    };
  }

  // Filter by status
  const statusFilter = options.status === 'all' ? 'all' : (options.status as TechniqueStatus);
  const techniques = filterByStatus(registry.techniques, statusFilter);

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
