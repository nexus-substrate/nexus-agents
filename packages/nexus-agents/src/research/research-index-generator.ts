/**
 * nexus-agents/research - Research Index Generator
 *
 * Generates RESEARCH_INDEX.md deterministically from YAML registry files.
 * Includes SHA-256 checksums in frontmatter for drift detection.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 * @see docs/research/RESEARCH_INDEX.md
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import type { Result } from '../core/result.js';
import type {
  PapersRegistry,
  TechniquesRegistry,
  ResearchTopic,
  TechniqueStatus,
  ResearchPaper,
  ResearchTechnique,
} from './research-schemas.js';
import {
  PapersRegistrySchema,
  TechniquesRegistrySchema,
  RESEARCH_TOPICS,
  TOPIC_DESCRIPTIONS,
} from './research-schemas.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the index generator.
 */
export interface GeneratorOptions {
  /** Path to papers.yaml */
  readonly papersPath: string;
  /** Path to techniques.yaml */
  readonly techniquesPath: string;
  /** Include P1 techniques table */
  readonly includeP1Table: boolean;
  /** Include P2 techniques table */
  readonly includeP2Table: boolean;
  /** Include papers by topic section */
  readonly includePapersByTopic: boolean;
  /** Include GitHub issues section */
  readonly includeGitHubIssues: boolean;
  /** Number of recent papers to show */
  readonly recentPapersLimit: number;
}

/**
 * Default generator options.
 */
export const DEFAULT_GENERATOR_OPTIONS: GeneratorOptions = {
  papersPath: 'docs/research/registry/papers.yaml',
  techniquesPath: 'docs/research/registry/techniques.yaml',
  includeP1Table: true,
  includeP2Table: true,
  includePapersByTopic: true,
  includeGitHubIssues: true,
  recentPapersLimit: 10,
};

/**
 * Paper with ID attached.
 */
interface PaperWithId extends ResearchPaper {
  readonly id: string;
}

/**
 * Technique with ID attached.
 */
interface TechniqueWithId extends ResearchTechnique {
  readonly id: string;
}

/**
 * Parsed registry data.
 */
interface ParsedData {
  readonly papers: readonly PaperWithId[];
  readonly techniques: readonly TechniqueWithId[];
  readonly papersChecksum: string;
  readonly techniquesChecksum: string;
}

/**
 * Statistics computed from registry.
 */
interface RegistryStats {
  readonly totalPapers: number;
  readonly totalTechniques: number;
  readonly totalTopics: number;
  readonly techniquesByStatus: Record<TechniqueStatus, number>;
  readonly topicStats: readonly { topic: ResearchTopic; papers: number; techniques: number }[];
}

// ============================================================================
// File I/O
// ============================================================================

/**
 * Compute SHA-256 checksum of file content.
 */
function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Parse papers.yaml file.
 */
function parsePapersFile(
  filePath: string
): Result<{ registry: PapersRegistry; checksum: string }, Error> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = yaml.parse(content);
    const result = PapersRegistrySchema.safeParse(parsed);

    if (!result.success) {
      return { ok: false, error: new Error(`Invalid papers.yaml: ${result.error.message}`) };
    }

    return {
      ok: true,
      value: { registry: result.data, checksum: computeChecksum(content) },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Parse techniques.yaml file.
 */
function parseTechniquesFile(
  filePath: string
): Result<{ registry: TechniquesRegistry; checksum: string }, Error> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = yaml.parse(content);
    const result = TechniquesRegistrySchema.safeParse(parsed);

    if (!result.success) {
      return { ok: false, error: new Error(`Invalid techniques.yaml: ${result.error.message}`) };
    }

    return {
      ok: true,
      value: { registry: result.data, checksum: computeChecksum(content) },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Compute statistics from registry data.
 */
function computeStats(data: ParsedData): RegistryStats {
  // Count techniques by status
  const techniquesByStatus: Record<TechniqueStatus, number> = {
    implemented: 0,
    planned: 0,
    'in-progress': 0,
    'not-started': 0,
    rejected: 0,
  };

  for (const technique of data.techniques) {
    techniquesByStatus[technique.status]++;
  }

  // Count by topic
  const topicStats = RESEARCH_TOPICS.map((topic) => {
    const papers = data.papers.filter((p) => p.topics.includes(topic)).length;
    const techniques = data.techniques.filter((t) => t.topic === topic).length;
    return { topic, papers, techniques };
  });

  return {
    totalPapers: data.papers.length,
    totalTechniques: data.techniques.length,
    totalTopics: RESEARCH_TOPICS.length,
    techniquesByStatus,
    topicStats,
  };
}

// ============================================================================
// Markdown Generation Helpers
// ============================================================================

/**
 * Get current date in ET timezone.
 */
function getETDate(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
}

/**
 * Capitalize topic name for display.
 */
function capitalizeTopicName(topic: string): string {
  return topic
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate frontmatter with checksums.
 */
function generateFrontmatter(papersChecksum: string, techniquesChecksum: string): string {
  const dateStr = getETDate();
  return `<!--
  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
  Generated by: nexus-agents research index --generate
  Last generated: ${dateStr} (ET)
  Source checksums:
    papers: sha256:${papersChecksum}
    techniques: sha256:${techniquesChecksum}
-->

`;
}

/**
 * Generate header section.
 */
function generateHeader(stats: RegistryStats, dateStr: string): string {
  return `# Nexus-Agents Research Index

**Generated:** ${dateStr} (ET)
**Total Papers:** ${String(stats.totalPapers)} | **Techniques:** ${String(stats.totalTechniques)} | **Topics:** ${String(stats.totalTopics)}

---`;
}

/**
 * Generate quick stats section.
 */
function generateQuickStats(stats: RegistryStats): string {
  const { techniquesByStatus } = stats;
  return `## Quick Stats

| Status      | Papers | Techniques |
| ----------- | ------ | ---------- |
| Implemented | -      | ${String(techniquesByStatus['implemented'])}         |
| In Progress | -      | ${String(techniquesByStatus['in-progress'])}          |
| Planned     | -      | ${String(techniquesByStatus['planned'])}          |
| Not Started | -      | ${String(techniquesByStatus['not-started'])}          |
| Rejected    | -      | ${String(techniquesByStatus['rejected'])}          |

> **Note:** Paper-level status tracking deprecated. Technique status is source of truth.

---`;
}

/**
 * Generate topics table section.
 */
function generateTopicsTable(stats: RegistryStats): string {
  const rows = stats.topicStats.map((ts) => {
    const topicDisplay = capitalizeTopicName(ts.topic);
    const topicLink = `[${topicDisplay}](topics/${ts.topic}/README.md)`;
    const desc = TOPIC_DESCRIPTIONS[ts.topic];
    return `| ${topicLink} | ${String(ts.papers)} | ${String(ts.techniques)} | ${desc} |`;
  });

  return `## Topics

| Topic | Papers | Techniques | Description |
| ----- | ------ | ---------- | ----------- |
${rows.join('\n')}

---`;
}

/**
 * Generate technique row for priority tables.
 */
function generateTechniqueRow(t: TechniqueWithId): string {
  const name = `[${t.name}](registry/techniques.yaml#${t.id})`;
  const topic = t.topic;
  const metricsArr = Object.entries(t.metrics);
  const metrics = metricsArr.length > 0 ? metricsArr.map(([k, v]) => `${k}: ${v}`).join(', ') : '-';
  const issue = t.implementation_issue !== null ? `#${String(t.implementation_issue)}` : '-';
  return `| ${name} | ${topic} | ${metrics} | ${issue} |`;
}

/**
 * Generate P1 techniques section.
 */
function generateP1Section(techniques: readonly TechniqueWithId[]): string {
  const p1 = techniques.filter((t) => t.priority === 'P1');
  if (p1.length === 0) return '';

  const rows = p1.map(generateTechniqueRow);
  return `## Priority 1 (P1) Techniques

These techniques are high-impact and align well with the current architecture.

| Technique | Topic | Key Metrics | Issue |
| --------- | ----- | ----------- | ----- |
${rows.join('\n')}

---`;
}

/**
 * Generate P2 techniques section.
 */
function generateP2Section(techniques: readonly TechniqueWithId[]): string {
  const p2 = techniques.filter((t) => t.priority === 'P2');
  if (p2.length === 0) return '';

  const rows = p2.map(generateTechniqueRow);
  return `## Priority 2 (P2) Techniques

Medium-impact or requiring moderate changes.

| Technique | Topic | Key Metrics | Issue |
| --------- | ----- | ----------- | ----- |
${rows.join('\n')}

---`;
}

/**
 * Generate recently reviewed papers section.
 */
function generateRecentPapers(papers: readonly PaperWithId[], limit: number): string {
  const withDates = papers
    .filter(
      (p): p is PaperWithId & { reviewed_date: string } => typeof p.reviewed_date === 'string'
    )
    .sort((a, b) => b.reviewed_date.localeCompare(a.reviewed_date))
    .slice(0, limit);

  if (withDates.length === 0) return '';

  const rows = withDates.map((p) => {
    const escapedTitle = p.title.replace(/\|/g, '-');
    const title =
      typeof p.url === 'string' && p.url.length > 0 ? `[${escapedTitle}](${p.url})` : escapedTitle;
    const topic = p.topics[0] ?? '-';
    return `| ${p.reviewed_date} | ${title} | ${topic} | - |`;
  });

  return `## Recently Reviewed Papers

| Date | Paper | Topic | Priority |
| ---- | ----- | ----- | -------- |
${rows.join('\n')}

---`;
}

/**
 * Generate papers by topic section.
 */
function generatePapersByTopic(papers: readonly PaperWithId[]): string {
  const sections: string[] = [];

  for (const topic of RESEARCH_TOPICS) {
    if (topic === 'cli-tools') continue; // Skip if typically empty

    const topicPapers = papers.filter((p) => p.topics.includes(topic));
    if (topicPapers.length === 0) continue;

    const topicDisplay = capitalizeTopicName(topic);
    const list = topicPapers
      .map((p) => {
        const title =
          typeof p.url === 'string' && p.url.length > 0 ? `[${p.title}](${p.url})` : p.title;
        const summary = p.summary?.split('\n')[0]?.trim() ?? '';
        return summary.length > 0 ? `- ${title} - ${summary}` : `- ${title}`;
      })
      .join('\n');

    sections.push(`### ${topicDisplay} (${String(topicPapers.length)} papers)\n\n${list}`);
  }

  if (sections.length === 0) return '';

  return `## Papers by Topic

${sections.join('\n\n')}

---`;
}

/**
 * Generate GitHub issues section.
 */
function generateGitHubIssues(techniques: readonly TechniqueWithId[]): string {
  const withIssues = techniques.filter((t) => t.implementation_issue !== null);
  if (withIssues.length === 0) return '';

  const rows = withIssues.map((t) => {
    const papers = t.source_papers.length > 0 ? t.source_papers.join(', ') : '-';
    return `| #${String(t.implementation_issue ?? 0)} | ${t.name} | ${papers} |`;
  });

  return `## GitHub Issues

| Issue | Feature | Related Papers |
| ----- | ------- | -------------- |
${rows.join('\n')}

---`;
}

/**
 * Generate search tags section.
 */
function generateSearchTags(techniques: readonly TechniqueWithId[]): string {
  const allTags = new Set<string>();
  for (const t of techniques) {
    for (const tag of t.tags) {
      allTags.add(tag);
    }
  }

  const tagList = Array.from(allTags)
    .sort()
    .slice(0, 20)
    .map((tag) => `\`#${tag}\``)
    .join(' ');

  return `## Search Tags

${tagList}

---`;
}

/**
 * Generate registry files section.
 */
function generateRegistryFiles(stats: RegistryStats): string {
  return `## Registry Files

- [papers.yaml](registry/papers.yaml) - All ${String(stats.totalPapers)} papers with metadata
- [techniques.yaml](registry/techniques.yaml) - All ${String(stats.totalTechniques)} techniques with status
- [sources.yaml](registry/sources.yaml) - Product docs and other sources

---`;
}

/**
 * Generate how to contribute section.
 */
function generateContributing(dateStr: string): string {
  return `## How to Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new research.

---

_Generated from YAML registries. Last updated: ${dateStr} (ET)_
`;
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Add optional section to sections array if content is non-empty.
 */
function addOptionalSection(
  sections: string[],
  shouldInclude: boolean,
  generator: () => string
): void {
  if (shouldInclude) {
    const content = generator();
    if (content.length > 0) {
      sections.push(content);
    }
  }
}

/**
 * Build parsed data from registry results.
 */
function buildParsedData(
  papersResult: { registry: PapersRegistry; checksum: string },
  techniquesResult: { registry: TechniquesRegistry; checksum: string }
): ParsedData {
  const papers: PaperWithId[] = Object.entries(papersResult.registry.papers).map(([id, paper]) => ({
    id,
    ...paper,
  }));
  const techniques: TechniqueWithId[] = Object.entries(techniquesResult.registry.techniques).map(
    ([id, technique]) => ({ id, ...technique })
  );

  return {
    papers,
    techniques,
    papersChecksum: papersResult.checksum,
    techniquesChecksum: techniquesResult.checksum,
  };
}

/**
 * Build the base sections that are always included.
 */
function buildBaseSections(data: ParsedData, stats: RegistryStats, dateStr: string): string[] {
  return [
    generateFrontmatter(data.papersChecksum, data.techniquesChecksum),
    generateHeader(stats, dateStr),
    generateQuickStats(stats),
    generateTopicsTable(stats),
  ];
}

/**
 * Generate RESEARCH_INDEX.md content.
 */
export function generateIndexMarkdown(
  options: Partial<GeneratorOptions> = {}
): Result<string, Error> {
  const opts = { ...DEFAULT_GENERATOR_OPTIONS, ...options };

  // Parse papers
  const papersResult = parsePapersFile(path.resolve(opts.papersPath));
  if (!papersResult.ok) return papersResult;

  // Parse techniques
  const techniquesResult = parseTechniquesFile(path.resolve(opts.techniquesPath));
  if (!techniquesResult.ok) return techniquesResult;

  // Build data and compute stats
  const data = buildParsedData(papersResult.value, techniquesResult.value);
  const stats = computeStats(data);
  const dateStr = getETDate();

  // Build markdown sections
  const sections = buildBaseSections(data, stats, dateStr);

  // Add optional sections
  addOptionalSection(sections, opts.includeP1Table, () => generateP1Section(data.techniques));
  addOptionalSection(sections, opts.includeP2Table, () => generateP2Section(data.techniques));
  sections.push(generateRecentPapers(data.papers, opts.recentPapersLimit));
  addOptionalSection(sections, opts.includePapersByTopic, () => generatePapersByTopic(data.papers));
  addOptionalSection(sections, opts.includeGitHubIssues, () =>
    generateGitHubIssues(data.techniques)
  );

  // Add final sections
  sections.push(generateSearchTags(data.techniques));
  sections.push(generateRegistryFiles(stats));
  sections.push(generateContributing(dateStr));

  return { ok: true, value: sections.filter(Boolean).join('\n') };
}

/**
 * Check if existing index is up to date.
 */
export function checkIndexFreshness(
  indexPath: string,
  options: Partial<GeneratorOptions> = {}
): Result<{ fresh: boolean; reason: string }, Error> {
  const opts = { ...DEFAULT_GENERATOR_OPTIONS, ...options };

  // Check if index exists
  if (!fs.existsSync(indexPath)) {
    return { ok: true, value: { fresh: false, reason: 'Index file does not exist' } };
  }

  // Read existing index
  const existingContent = fs.readFileSync(indexPath, 'utf-8');

  // Extract checksums from frontmatter
  const papersMatch = existingContent.match(/papers: sha256:([a-f0-9]+)/);
  const techniquesMatch = existingContent.match(/techniques: sha256:([a-f0-9]+)/);

  if (!papersMatch || !techniquesMatch) {
    return { ok: true, value: { fresh: false, reason: 'Index missing checksums in frontmatter' } };
  }

  const existingPapersChecksum = papersMatch[1];
  const existingTechniquesChecksum = techniquesMatch[1];

  // Compute current checksums
  const papersContent = fs.readFileSync(path.resolve(opts.papersPath), 'utf-8');
  const techniquesContent = fs.readFileSync(path.resolve(opts.techniquesPath), 'utf-8');

  const currentPapersChecksum = computeChecksum(papersContent);
  const currentTechniquesChecksum = computeChecksum(techniquesContent);

  // Compare
  if (existingPapersChecksum !== currentPapersChecksum) {
    return { ok: true, value: { fresh: false, reason: 'papers.yaml has changed' } };
  }

  if (existingTechniquesChecksum !== currentTechniquesChecksum) {
    return { ok: true, value: { fresh: false, reason: 'techniques.yaml has changed' } };
  }

  return { ok: true, value: { fresh: true, reason: 'Index is up to date' } };
}
