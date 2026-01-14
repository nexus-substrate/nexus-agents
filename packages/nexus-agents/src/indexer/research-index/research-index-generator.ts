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
  type ResearchTechniqueWithId,
  type ResearchTopic,
  DEFAULT_RESEARCH_INDEX_GENERATOR_OPTIONS,
  ResearchIndexGeneratorError,
} from './research-index-types.js';
import {
  getPapersByTopic,
  getRecentlyReviewedPapers,
  getTechniquesByPriority,
  getTechniquesWithIssues,
} from './research-index-parser.js';

// ============================================================================
// Markdown Generation Helpers
// ============================================================================

/**
 * Generate the header section.
 */
function generateHeader(index: ResearchIndex): string {
  const { stats } = index;
  return `# Nexus-Agents Research Index

**Generated:** ${index.generatedAt}
**Total Papers:** ${String(stats.totalPapers)} | **Techniques:** ${String(stats.totalTechniques)} | **Topics:** ${String(stats.totalTopics)}

---`;
}

/**
 * Generate the quick stats table.
 */
function generateQuickStats(index: ResearchIndex): string {
  const { techniquesByStatus } = index.stats;
  return `## Quick Stats

| Status      | Papers | Techniques |
| ----------- | ------ | ---------- |
| Implemented | -      | ${String(techniquesByStatus.implemented)}         |
| In Progress | -      | ${String(techniquesByStatus.inProgress)}          |
| Planned     | -      | ${String(techniquesByStatus.planned)}          |
| Not Started | -      | ${String(techniquesByStatus.notStarted)}          |
| Rejected    | -      | ${String(techniquesByStatus.rejected)}          |

> **Note:** Paper-level status tracking deprecated. Technique status is source of truth.`;
}

/**
 * Generate the topics table.
 */
function generateTopicsTable(index: ResearchIndex): string {
  const { topicStats } = index.stats;
  const topicDescriptions: Record<ResearchTopic, string> = {
    consensus: 'Multi-agent decision protocols',
    routing: 'Cost-efficient model routing',
    memory: 'Context and long-term memory',
    'code-generation': 'Self-improvement and skill learning',
    'cli-tools': 'External CLI integration',
    orchestration: 'Multi-agent coordination',
  };

  const rows = topicStats.map((stat) => {
    const description = topicDescriptions[stat.topic];
    const topicLink = `[${capitalize(stat.topic.replace('-', ' '))}](topics/${stat.topic}/README.md)`;
    return `| ${topicLink} | ${String(stat.paperCount)} | ${String(stat.techniqueCount)} | ${description} |`;
  });

  return `---

## Topics

| Topic | Papers | Techniques | Description |
| ----- | ------ | ---------- | ----------- |
${rows.join('\n')}`;
}

/**
 * Capitalize the first letter of each word.
 */
function capitalize(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate technique table row.
 */
function generateTechniqueRow(technique: ResearchTechniqueWithId): string {
  const name = `[${technique.name}](registry/techniques.yaml#${technique.id})`;
  const topic = technique.topic;
  // metrics has default {} so always defined
  const metricsEntries = Object.entries(technique.metrics);
  const metrics =
    metricsEntries.length > 0
      ? metricsEntries.map(([key, value]) => `${key}: ${value}`).join(', ')
      : '-';
  // implementation_issue is nullable
  const issue =
    technique.implementation_issue !== null ? `#${String(technique.implementation_issue)}` : '-';

  return `| ${name} | ${topic} | ${metrics} | ${issue} |`;
}

/**
 * Generate P1 techniques table.
 */
function generateP1Table(index: ResearchIndex): string {
  const p1Techniques = getTechniquesByPriority(index, 'P1');

  if (p1Techniques.length === 0) {
    return '';
  }

  const rows = p1Techniques.map(generateTechniqueRow);

  return `---

## Priority 1 (P1) Techniques

These techniques are high-impact and align well with the current architecture.

| Technique | Topic | Key Metrics | Issue |
| --------- | ----- | ----------- | ----- |
${rows.join('\n')}`;
}

/**
 * Generate P2 techniques table.
 */
function generateP2Table(index: ResearchIndex): string {
  const p2Techniques = getTechniquesByPriority(index, 'P2');

  if (p2Techniques.length === 0) {
    return '';
  }

  const rows = p2Techniques.map(generateTechniqueRow);

  return `---

## Priority 2 (P2) Techniques

Medium-impact or requiring moderate changes.

| Technique | Topic | Key Metrics | Issue |
| --------- | ----- | ----------- | ----- |
${rows.join('\n')}`;
}

/**
 * Generate recently reviewed papers section.
 */
function generateRecentPapers(index: ResearchIndex, limit: number): string {
  const recentPapers = getRecentlyReviewedPapers(index, limit);

  if (recentPapers.length === 0) {
    return '';
  }

  const rows = recentPapers.map((paper) => {
    // url is optional
    const paperUrl = paper.url ?? '';
    const title =
      paperUrl !== ''
        ? `[${paper.title.replace(/\|/g, '-')}](${paperUrl})`
        : paper.title.replace(/\|/g, '-');
    // topics has default [] so always defined
    const topic = paper.topics[0] ?? '-';
    const priority = '-'; // Papers don't have priority
    // reviewed_date is optional
    const dateStr = paper.reviewed_date ?? '-';
    return `| ${dateStr} | ${title} | ${topic} | ${priority} |`;
  });

  return `---

## Recently Reviewed Papers

| Date | Paper | Topic | Priority |
| ---- | ----- | ----- | -------- |
${rows.join('\n')}`;
}

/**
 * Generate papers by topic section.
 */
function generatePapersByTopic(index: ResearchIndex): string {
  const topics: ResearchTopic[] = [
    'consensus',
    'routing',
    'memory',
    'code-generation',
    'orchestration',
  ];

  const sections = topics.map((topic) => {
    const papers = getPapersByTopic(index, topic);
    if (papers.length === 0) {
      return '';
    }

    const paperList = papers
      .map((paper) => {
        // url is optional
        const paperUrl = paper.url ?? '';
        const title = paperUrl !== '' ? `[${paper.title}](${paperUrl})` : paper.title;
        // summary is optional
        const summaryText = paper.summary?.trim().split('\n')[0] ?? '';
        const summaryPart = summaryText !== '' ? ` - ${summaryText}` : '';
        return `- ${title}${summaryPart}`;
      })
      .join('\n');

    return `### ${capitalize(topic.replace('-', ' '))} (${String(papers.length)} papers)

${paperList}`;
  });

  const nonEmptySections = sections.filter((s) => s.length > 0);

  if (nonEmptySections.length === 0) {
    return '';
  }

  return `---

## Papers by Topic

${nonEmptySections.join('\n\n')}`;
}

/**
 * Generate GitHub issues section.
 */
function generateGitHubIssues(index: ResearchIndex): string {
  const techniquesWithIssues = getTechniquesWithIssues(index);

  if (techniquesWithIssues.length === 0) {
    return '';
  }

  const rows = techniquesWithIssues.map((technique) => {
    // source_papers has default [] so always defined
    const papers = technique.source_papers.length > 0 ? technique.source_papers.join(', ') : '-';
    // implementation_issue is nullable - guaranteed to have value here since filtered
    const issueStr = String(technique.implementation_issue ?? 0);
    return `| #${issueStr} | ${technique.name} | ${papers} |`;
  });

  return `---

## GitHub Issues

| Issue | Feature | Related Papers |
| ----- | ------- | -------------- |
${rows.join('\n')}`;
}

/**
 * Generate search tags section.
 */
function generateSearchTags(index: ResearchIndex): string {
  // Collect all unique tags from techniques (tags has default [] so always defined)
  const allTags = new Set<string>();

  for (const technique of index.techniques) {
    for (const tag of technique.tags) {
      allTags.add(tag);
    }
  }

  const tagList = Array.from(allTags)
    .sort()
    .slice(0, 20)
    .map((tag) => `\`#${tag}\``)
    .join(' ');

  return `---

## Search Tags

${tagList}`;
}

/**
 * Generate registry files section.
 */
function generateRegistryFiles(index: ResearchIndex): string {
  const paperCount = String(index.stats.totalPapers);
  const techniqueCount = String(index.stats.totalTechniques);
  return `---

## Registry Files

- [papers.yaml](registry/papers.yaml) - All ${paperCount} papers with metadata
- [techniques.yaml](registry/techniques.yaml) - All ${techniqueCount} techniques with status
- [sources.yaml](registry/sources.yaml) - Product docs and other sources`;
}

/**
 * Generate how to contribute section.
 */
function generateContributingSection(): string {
  const dateStr = new Date().toISOString().split('T')[0] ?? '';
  return `---

## How to Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new research.

---

_Generated from YAML registries. Last updated: ${dateStr} (ET)_`;
}

// ============================================================================
// Main Generator Function
// ============================================================================

/**
 * Add a non-empty section to the sections array.
 */
function addSection(sections: string[], section: string): void {
  if (section !== '') {
    sections.push(section);
  }
}

/**
 * Build optional sections based on options.
 */
function buildOptionalSections(
  index: ResearchIndex,
  opts: ResearchIndexGeneratorOptions
): string[] {
  const sections: string[] = [];

  if (opts.includeP1Table) {
    addSection(sections, generateP1Table(index));
  }
  if (opts.includeP2Table) {
    addSection(sections, generateP2Table(index));
  }
  if (opts.includeRecentPapers) {
    addSection(sections, generateRecentPapers(index, opts.recentPapersLimit));
  }
  if (opts.includePapersByTopic) {
    addSection(sections, generatePapersByTopic(index));
  }
  if (opts.includeGitHubIssues) {
    addSection(sections, generateGitHubIssues(index));
  }

  return sections;
}

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

  const implementedPercent = Math.round(
    (techniquesByStatus.implemented / stats.totalTechniques) * 100
  );

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
