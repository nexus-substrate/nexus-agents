/**
 * nexus-agents/indexer/research-index - Markdown Generator
 *
 * Generates RESEARCH_INDEX.md from parsed research registry data.
 *
 * (Source: Research Tracking System - docs/research/RESEARCH_INDEX.md)
 */

import type { Result } from '../../core/result.js';
import {
  type ResearchIndex,
  type ResearchIndexGeneratorOptions,
  DEFAULT_RESEARCH_INDEX_GENERATOR_OPTIONS,
  ResearchIndexGeneratorError,
} from './research-index-types.js';
import {
  buildOptionalSections,
  generateContributingSection,
  generateHeader,
  generateQuickStats,
  generateRegistryFiles,
  generateSearchTags,
  generateTopicsTable,
} from './research-index-generator-helpers.js';

// ============================================================================
// Main Generator Functions
// ============================================================================

/**
 * Generate the complete RESEARCH_INDEX.md content.
 */
export function generateIndexMarkdown(
  index: ResearchIndex,
  options: Partial<ResearchIndexGeneratorOptions> = {}
): Result<string, ResearchIndexGeneratorError> {
  try {
    const opts = { ...DEFAULT_RESEARCH_INDEX_GENERATOR_OPTIONS, ...options };

    const sections: string[] = [
      generateHeader(index),
      generateQuickStats(index),
      generateTopicsTable(index),
      ...buildOptionalSections(index, opts),
      generateSearchTags(index),
      generateRegistryFiles(index),
      generateContributingSection(),
    ];

    const markdown = sections.join('\n\n');

    return { ok: true, value: markdown };
  } catch (error) {
    return {
      ok: false,
      error: new ResearchIndexGeneratorError(
        `Failed to generate markdown: ${error instanceof Error ? error.message : String(error)}`,
        error
      ),
    };
  }
}

/**
 * Generate a JSON stats export.
 */
export function generateStatsJson(index: ResearchIndex): string {
  return JSON.stringify(
    {
      schemaVersion: index.schemaVersion,
      generatedAt: index.generatedAt,
      stats: index.stats,
    },
    null,
    2
  );
}

/**
 * Generate a summary report (shorter than full markdown).
 */
export function generateSummaryReport(index: ResearchIndex): string {
  const { stats } = index;
  const { techniquesByStatus } = stats;

  const implementedPercent =
    stats.totalTechniques > 0
      ? Math.round((techniquesByStatus.implemented / stats.totalTechniques) * 100)
      : 0;

  const topicLines = stats.topicStats
    .map(
      (t) => `- ${t.topic}: ${String(t.techniqueCount)} techniques, ${String(t.paperCount)} papers`
    )
    .join('\n');

  return `# Research Index Summary

**Generated:** ${index.generatedAt}

## Overview
- **Total Papers:** ${String(stats.totalPapers)}
- **Total Techniques:** ${String(stats.totalTechniques)}
- **Implementation Rate:** ${String(implementedPercent)}%

## Technique Status
- Implemented: ${String(techniquesByStatus.implemented)}
- Planned: ${String(techniquesByStatus.planned)}
- Not Started: ${String(techniquesByStatus.notStarted)}
- Rejected: ${String(techniquesByStatus.rejected)}

## Topics Coverage
${topicLines}
`;
}
