/**
 * nexus-agents/indexer/research-index - Registry Parser
 *
 * Parses papers.yaml, techniques.yaml, and sources.yaml from the
 * research registry directory.
 *
 * (Source: Research Tracking System - docs/research/RESEARCH_INDEX.md)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'yaml';
import { getErrorMessage, getTimeProvider } from '../../core/index.js';
import type { Result } from '../../core/result.js';
import {
  type ResearchIndex,
  type ResearchIndexParserOptions,
  type ResearchIndexStats,
  type ResearchPaperWithId,
  type ResearchSourceWithId,
  type ResearchTechniqueWithId,
  type ResearchTopic,
  type TechniquePriorityStats,
  type TechniqueStatus,
  type TechniqueStatusStats,
  type TopicStats,
  DEFAULT_RESEARCH_INDEX_PARSER_OPTIONS,
  PapersRegistrySchema,
  ResearchIndexParseError,
  SourcesRegistrySchema,
  TechniquesRegistrySchema,
} from './research-index-types.js';

// ============================================================================
// File Reading
// ============================================================================

/**
 * Read and parse a YAML file.
 */
function readYamlFile<T>(
  filePath: string,
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: unknown } }
): Result<T, ResearchIndexParseError> {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        ok: false,
        error: new ResearchIndexParseError(`File not found: ${filePath}`, filePath),
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = yaml.parse(content);

    const result = schema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        error: new ResearchIndexParseError(
          `Validation failed for ${filePath}`,
          filePath,
          result.error
        ),
      };
    }

    return { ok: true, value: result.data as T };
  } catch (error) {
    return {
      ok: false,
      error: new ResearchIndexParseError(
        `Failed to parse ${filePath}: ${getErrorMessage(error)}`,
        filePath,
        error
      ),
    };
  }
}

// ============================================================================
// Paper Parsing
// ============================================================================

/**
 * Parse papers.yaml into structured paper entries.
 */
export function parsePapersRegistry(
  registryPath: string
): Result<readonly ResearchPaperWithId[], ResearchIndexParseError> {
  const filePath = path.join(registryPath, 'papers.yaml');
  const result = readYamlFile(filePath, PapersRegistrySchema);

  if (!result.ok) {
    return result;
  }

  const papers: ResearchPaperWithId[] = Object.entries(result.value.papers).map(([id, paper]) => ({
    id,
    ...paper,
  }));

  return { ok: true, value: papers };
}

// ============================================================================
// Technique Parsing
// ============================================================================

/**
 * Parse techniques.yaml into structured technique entries.
 */
export function parseTechniquesRegistry(
  registryPath: string
): Result<readonly ResearchTechniqueWithId[], ResearchIndexParseError> {
  const filePath = path.join(registryPath, 'techniques.yaml');
  const result = readYamlFile(filePath, TechniquesRegistrySchema);

  if (!result.ok) {
    return result;
  }

  const techniques: ResearchTechniqueWithId[] = Object.entries(result.value.techniques).map(
    ([id, technique]) => ({
      id,
      ...technique,
    })
  );

  return { ok: true, value: techniques };
}

// ============================================================================
// Source Parsing
// ============================================================================

/**
 * Parse sources.yaml into structured source entries.
 */
export function parseSourcesRegistry(
  registryPath: string
): Result<readonly ResearchSourceWithId[], ResearchIndexParseError> {
  const filePath = path.join(registryPath, 'sources.yaml');
  const result = readYamlFile(filePath, SourcesRegistrySchema);

  if (!result.ok) {
    return result;
  }

  const sources: ResearchSourceWithId[] = Object.entries(result.value.sources).map(
    ([id, source]) => ({
      id,
      ...source,
    })
  );

  return { ok: true, value: sources };
}

// ============================================================================
// Statistics Computation
// ============================================================================

/**
 * Count techniques by status.
 */
function countTechniquesByStatus(
  techniques: readonly ResearchTechniqueWithId[]
): TechniqueStatusStats {
  const counts: Record<TechniqueStatus, number> = {
    implemented: 0,
    planned: 0,
    'in-progress': 0,
    'not-started': 0,
    rejected: 0,
  };

  for (const technique of techniques) {
    counts[technique.status]++;
  }

  return {
    implemented: counts['implemented'],
    planned: counts['planned'],
    inProgress: counts['in-progress'],
    notStarted: counts['not-started'],
    rejected: counts['rejected'],
  };
}

/**
 * Count techniques by priority.
 */
function countTechniquesByPriority(
  techniques: readonly ResearchTechniqueWithId[]
): TechniquePriorityStats {
  const counts = {
    P1: 0,
    P2: 0,
    P3: 0,
    P4: 0,
    none: 0,
  };

  for (const technique of techniques) {
    const priority = technique.priority;
    if (priority === null) {
      counts.none++;
    } else {
      counts[priority]++;
    }
  }

  return counts;
}

/**
 * Compute statistics per topic.
 */
/** Derive all unique topics from actual paper + technique data. */
function deriveAllTopics(
  papers: readonly ResearchPaperWithId[],
  techniques: readonly ResearchTechniqueWithId[]
): ResearchTopic[] {
  const topicSet = new Set<string>();
  for (const p of papers) {
    for (const t of p.topics) topicSet.add(t);
  }
  for (const t of techniques) {
    topicSet.add(t.topic);
  }
  return [...topicSet].sort();
}

function computeTopicStats(
  papers: readonly ResearchPaperWithId[],
  techniques: readonly ResearchTechniqueWithId[]
): readonly TopicStats[] {
  const allTopics = deriveAllTopics(papers, techniques);
  return allTopics.map((topic) => {
    const paperCount = papers.filter((p) => p.topics.includes(topic)).length;
    const techniqueCount = techniques.filter((t) => t.topic === topic).length;

    return {
      topic,
      paperCount,
      techniqueCount,
    };
  });
}

/**
 * Compute complete statistics for the research index.
 */
export function computeStats(
  papers: readonly ResearchPaperWithId[],
  techniques: readonly ResearchTechniqueWithId[],
  sources: readonly ResearchSourceWithId[]
): ResearchIndexStats {
  return {
    totalPapers: papers.length,
    totalTechniques: techniques.length,
    totalSources: sources.length,
    totalTopics: deriveAllTopics(papers, techniques).length,
    techniquesByStatus: countTechniquesByStatus(techniques),
    techniquesByPriority: countTechniquesByPriority(techniques),
    topicStats: computeTopicStats(papers, techniques),
    qualityDistribution: computeQualityDistribution(papers),
  };
}

/** Compute evidence tier distribution across papers. */
function computeQualityDistribution(papers: readonly ResearchPaperWithId[]): {
  high: number;
  medium: number;
  low: number;
  unscored: number;
  averageScore: number;
} {
  let high = 0;
  let medium = 0;
  let low = 0;
  let unscored = 0;
  let totalScore = 0;
  let scored = 0;

  for (const p of papers) {
    const tier = p.evidence_tier;
    if (tier === 'high') high++;
    else if (tier === 'medium') medium++;
    else if (tier === 'low') low++;
    else unscored++;

    const score = p.quality_score;
    if (score !== undefined) {
      totalScore += score;
      scored++;
    }
  }

  return {
    high,
    medium,
    low,
    unscored,
    averageScore: scored > 0 ? Math.round((totalScore / scored) * 10) / 10 : 0,
  };
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse the complete research registry.
 */
export function parseRegistry(
  options: Partial<ResearchIndexParserOptions> = {}
): Result<ResearchIndex, ResearchIndexParseError> {
  const opts = { ...DEFAULT_RESEARCH_INDEX_PARSER_OPTIONS, ...options };

  // Parse papers
  const papersResult = parsePapersRegistry(opts.registryPath);
  if (!papersResult.ok) {
    return papersResult;
  }

  // Parse techniques
  const techniquesResult = parseTechniquesRegistry(opts.registryPath);
  if (!techniquesResult.ok) {
    return techniquesResult;
  }

  // Parse sources
  const sourcesResult = parseSourcesRegistry(opts.registryPath);
  if (!sourcesResult.ok) {
    return sourcesResult;
  }

  // Compute statistics
  const stats = computeStats(papersResult.value, techniquesResult.value, sourcesResult.value);

  // Generate timestamp in ET
  const now = new Date(getTimeProvider().now());
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = etFormatter.formatToParts(now);
  const getPartValue = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const generatedAt = `${getPartValue('year')}-${getPartValue('month')}-${getPartValue('day')} (ET)`;

  return {
    ok: true,
    value: {
      schemaVersion: '1.0',
      generatedAt,
      papers: papersResult.value,
      techniques: techniquesResult.value,
      sources: sourcesResult.value,
      stats,
    },
  };
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get techniques filtered by status.
 */
export function getTechniquesByStatus(
  index: ResearchIndex,
  status: TechniqueStatus
): readonly ResearchTechniqueWithId[] {
  return index.techniques.filter((t) => t.status === status);
}

/**
 * Get techniques filtered by priority.
 */
export function getTechniquesByPriority(
  index: ResearchIndex,
  priority: 'P1' | 'P2' | 'P3' | 'P4'
): readonly ResearchTechniqueWithId[] {
  return index.techniques.filter((t) => t.priority === priority);
}

/**
 * Get techniques filtered by topic.
 */
export function getTechniquesByTopic(
  index: ResearchIndex,
  topic: ResearchTopic
): readonly ResearchTechniqueWithId[] {
  return index.techniques.filter((t) => t.topic === topic);
}

/**
 * Get papers filtered by topic.
 */
export function getPapersByTopic(
  index: ResearchIndex,
  topic: ResearchTopic
): readonly ResearchPaperWithId[] {
  return index.papers.filter((p) => p.topics.includes(topic));
}

/**
 * Get recently reviewed papers (sorted by review date descending).
 */
export function getRecentlyReviewedPapers(
  index: ResearchIndex,
  limit: number = 5
): readonly ResearchPaperWithId[] {
  return [...index.papers]
    .filter(
      (p): p is ResearchPaperWithId & { reviewed_date: string } =>
        typeof p.reviewed_date === 'string'
    )
    .sort((a, b) => b.reviewed_date.localeCompare(a.reviewed_date))
    .slice(0, limit);
}

/**
 * Get techniques with GitHub issues.
 */
export function getTechniquesWithIssues(index: ResearchIndex): readonly ResearchTechniqueWithId[] {
  return index.techniques.filter((t) => t.implementation_issue !== null);
}
