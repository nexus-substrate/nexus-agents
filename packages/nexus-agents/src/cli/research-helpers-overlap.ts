/**
 * Research Registry Overlap Helpers
 *
 * Functions for detecting and analyzing technique overlaps.
 *
 * @see docs/research/RESEARCH_INDEX.md
 * @see Issue #237 (Epic #225)
 */

import type {
  TechniqueEntry,
  ResearchOverlapOptions,
  ResearchOverlapResult,
  OverlapMatch,
} from './research-types.js';
import { loadTechniquesRegistry } from './research-helpers-io.js';

// =============================================================================
// TAG OPERATIONS
// =============================================================================

/**
 * Calculate tag overlap score between two techniques.
 * Returns Jaccard similarity (intersection / union).
 */
export function calculateTagOverlap(tags1: readonly string[], tags2: readonly string[]): number {
  const set1 = new Set(tags1);
  const set2 = new Set(tags2);
  const intersection = [...set1].filter((tag) => set2.has(tag));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

/**
 * Find shared tags between two techniques.
 */
export function findSharedTags(tags1: readonly string[], tags2: readonly string[]): string[] {
  const set2 = new Set(tags2);
  return tags1.filter((tag) => set2.has(tag));
}

// =============================================================================
// RELATIONSHIP DETERMINATION
// =============================================================================

/**
 * Determine relationship type based on overlap characteristics.
 */
export function determineRelationship(
  source: TechniqueEntry,
  target: TechniqueEntry,
  overlapScore: number
): OverlapMatch['relationship'] {
  // High overlap in same topic = overlapping
  if (source.topic === target.topic && overlapScore > 0.5) {
    return 'overlapping';
  }

  // Same topic but lower overlap = complementary
  if (source.topic === target.topic) {
    return 'complementary';
  }

  // Different topic with some overlap = enhances
  if (overlapScore > 0.3) {
    return 'enhances';
  }

  return 'complementary';
}

// =============================================================================
// MAIN OVERLAP FUNCTION
// =============================================================================

/**
 * Find overlapping techniques.
 */
export async function findOverlaps(
  options: ResearchOverlapOptions
): Promise<ResearchOverlapResult> {
  const result = await loadTechniquesRegistry();
  if (!result.ok) {
    return {
      success: false,
      sourceId: options.techniqueId,
      matches: [],
      suggestedAlignments: [],
    };
  }
  const registry = result.value;

  const sourceEntry = registry.techniques[options.techniqueId];
  if (!sourceEntry) {
    return {
      success: false,
      sourceId: options.techniqueId,
      matches: [],
      suggestedAlignments: [],
    };
  }

  const matches: OverlapMatch[] = [];

  for (const [id, entry] of Object.entries(registry.techniques)) {
    if (id === options.techniqueId) continue;

    const overlapScore = calculateTagOverlap(sourceEntry.tags, entry.tags);
    const sharedTopic = sourceEntry.topic === entry.topic;

    // Apply threshold
    if (overlapScore >= options.threshold || sharedTopic) {
      matches.push({
        techniqueId: id,
        name: entry.name,
        overlapScore,
        sharedTags: findSharedTags(sourceEntry.tags, entry.tags),
        sharedTopic,
        relationship: determineRelationship(sourceEntry, entry, overlapScore),
      });
    }
  }

  // Sort by overlap score descending
  matches.sort((a, b) => b.overlapScore - a.overlapScore);

  // Generate suggested alignments
  const suggestedAlignments = matches
    .filter((m) => m.relationship === 'overlapping' || m.relationship === 'enhances')
    .slice(0, 3)
    .map((m) => `${options.techniqueId} -> ${m.techniqueId}: ${m.relationship}`);

  return {
    success: true,
    sourceId: options.techniqueId,
    matches,
    suggestedAlignments,
  };
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format overlap result for display.
 */
export function formatOverlapResult(
  result: ResearchOverlapResult,
  format: 'table' | 'json'
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];
  lines.push(`Overlap Analysis: ${result.sourceId}`);
  lines.push('='.repeat(60));
  lines.push('');

  if (!result.success) {
    lines.push(`Technique '${result.sourceId}' not found in registry.`);
    return lines.join('\n');
  }

  if (result.matches.length === 0) {
    lines.push('No overlapping techniques found.');
    return lines.join('\n');
  }

  lines.push(`Found ${String(result.matches.length)} related technique(s):`);
  lines.push('');

  for (const match of result.matches) {
    const score = (match.overlapScore * 100).toFixed(0);
    lines.push(`  ${match.techniqueId}`);
    lines.push(`    Name: ${match.name}`);
    lines.push(`    Overlap: ${score}% | Relationship: ${match.relationship}`);
    if (match.sharedTags.length > 0) {
      lines.push(`    Shared tags: ${match.sharedTags.join(', ')}`);
    }
    lines.push('');
  }

  if (result.suggestedAlignments.length > 0) {
    lines.push('Suggested alignments.yaml entries:');
    for (const alignment of result.suggestedAlignments) {
      lines.push(`  - ${alignment}`);
    }
  }

  return lines.join('\n');
}
