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
import type { PapersRegistry, TechniquesRegistry, TechniqueStatus } from './research-schemas.js';
import {
  PapersRegistrySchema,
  TechniquesRegistrySchema,
  RESEARCH_TOPICS,
} from './research-schemas.js';

// Re-export types for backward compatibility
export type {
  GeneratorOptions,
  PaperWithId,
  TechniqueWithId,
  ParsedData,
  RegistryStats,
  TopicStat,
} from './research-index-types.js';

export { DEFAULT_GENERATOR_OPTIONS } from './research-index-types.js';

import type {
  GeneratorOptions,
  PaperWithId,
  TechniqueWithId,
  ParsedData,
  RegistryStats,
} from './research-index-types.js';

import { DEFAULT_GENERATOR_OPTIONS } from './research-index-types.js';

import {
  getETDate,
  generateFrontmatter,
  generateHeader,
  generateQuickStats,
  generateTopicsTable,
  generateP1Section,
  generateP2Section,
  generateRecentPapers,
  generatePapersByTopic,
  generateGitHubIssues,
  generateSearchTags,
  generateRegistryFiles,
  generateContributing,
} from './research-index-markdown.js';

// ============================================================================
// File I/O
// ============================================================================

/**
 * Compute SHA-256 checksum of file content (truncated to 16 hex chars).
 */
function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Parse papers.yaml file with validation.
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
 * Parse techniques.yaml file with validation.
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
// Data Building
// ============================================================================

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

// ============================================================================
// Section Assembly
// ============================================================================

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
 * Build optional sections based on generator options.
 */
function buildOptionalSections(sections: string[], data: ParsedData, opts: GeneratorOptions): void {
  addOptionalSection(sections, opts.includeP1Table, () => generateP1Section(data.techniques));
  addOptionalSection(sections, opts.includeP2Table, () => generateP2Section(data.techniques));
  sections.push(generateRecentPapers(data.papers, opts.recentPapersLimit));
  addOptionalSection(sections, opts.includePapersByTopic, () => generatePapersByTopic(data.papers));
  addOptionalSection(sections, opts.includeGitHubIssues, () =>
    generateGitHubIssues(data.techniques)
  );
}

/**
 * Build final sections (always included).
 */
function buildFinalSections(
  sections: string[],
  data: ParsedData,
  stats: RegistryStats,
  dateStr: string
): void {
  sections.push(generateSearchTags(data.techniques));
  sections.push(generateRegistryFiles(stats));
  sections.push(generateContributing(dateStr));
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generate RESEARCH_INDEX.md content from YAML registries.
 *
 * @param options - Generator options (paths, section toggles)
 * @returns Result containing markdown content or error
 */
export function generateIndexMarkdown(
  options: Partial<GeneratorOptions> = {}
): Result<string, Error> {
  const opts = { ...DEFAULT_GENERATOR_OPTIONS, ...options };

  // Parse papers
  const papersResult = parsePapersFile(path.resolve(opts.papersPath));
  if (!papersResult.ok) {
    return { ok: false, error: papersResult.error };
  }

  // Parse techniques
  const techniquesResult = parseTechniquesFile(path.resolve(opts.techniquesPath));
  if (!techniquesResult.ok) {
    return { ok: false, error: techniquesResult.error };
  }

  // Build data and compute stats
  const data = buildParsedData(papersResult.value, techniquesResult.value);
  const stats = computeStats(data);
  const dateStr = getETDate();

  // Build markdown sections
  const sections = buildBaseSections(data, stats, dateStr);
  buildOptionalSections(sections, data, opts);
  buildFinalSections(sections, data, stats, dateStr);

  return { ok: true, value: sections.filter(Boolean).join('\n') };
}

// ============================================================================
// Freshness Check
// ============================================================================

/**
 * Extract checksums from existing index file frontmatter.
 */
function extractExistingChecksums(content: string): { papers: string; techniques: string } | null {
  const papersMatch = content.match(/papers: sha256:([a-f0-9]+)/);
  const techniquesMatch = content.match(/techniques: sha256:([a-f0-9]+)/);

  if (!papersMatch || !techniquesMatch) {
    return null;
  }

  return {
    papers: papersMatch[1] ?? '',
    techniques: techniquesMatch[1] ?? '',
  };
}

/**
 * Compute current checksums from registry files.
 */
function computeCurrentChecksums(
  papersPath: string,
  techniquesPath: string
): { papers: string; techniques: string } {
  const papersContent = fs.readFileSync(path.resolve(papersPath), 'utf-8');
  const techniquesContent = fs.readFileSync(path.resolve(techniquesPath), 'utf-8');

  return {
    papers: computeChecksum(papersContent),
    techniques: computeChecksum(techniquesContent),
  };
}

/**
 * Check if existing index is up to date by comparing checksums.
 *
 * @param indexPath - Path to existing RESEARCH_INDEX.md
 * @param options - Generator options (registry paths)
 * @returns Result containing freshness status and reason
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
  const existingChecksums = extractExistingChecksums(existingContent);
  if (!existingChecksums) {
    return { ok: true, value: { fresh: false, reason: 'Index missing checksums in frontmatter' } };
  }

  // Compute current checksums
  const currentChecksums = computeCurrentChecksums(opts.papersPath, opts.techniquesPath);

  // Compare
  if (existingChecksums.papers !== currentChecksums.papers) {
    return { ok: true, value: { fresh: false, reason: 'papers.yaml has changed' } };
  }

  if (existingChecksums.techniques !== currentChecksums.techniques) {
    return { ok: true, value: { fresh: false, reason: 'techniques.yaml has changed' } };
  }

  return { ok: true, value: { fresh: true, reason: 'Index is up to date' } };
}
