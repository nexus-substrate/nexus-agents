/**
 * Research Synthesis Helper
 *
 * Groups papers by topic cluster and generates structured synthesis
 * summaries with themes, findings, and implementation opportunities.
 *
 * @module cli/research-helpers-synthesize
 * (Source: Issue #1386 — Research Synthesis Pipeline)
 */

import { loadPapersRegistry } from './research-helpers-io.js';
import type { PapersRegistry } from './research-types.js';
import type { Result } from '../core/result.js';
import { getErrorMessage } from '../core/index.js';

// =============================================================================
// TYPES
// =============================================================================

/** A paper entry from the registry, simplified for synthesis. */
export interface SynthesisPaper {
  readonly id: string;
  readonly title: string;
  readonly topics: readonly string[];
  readonly tags: readonly string[];
  readonly summary: string;
  readonly keyFindings: readonly string[];
  readonly relevance: string;
  readonly implementationStatus: string;
  readonly techniquesExtracted: readonly string[];
}

/** A cluster of related papers grouped by topic. */
export interface PaperCluster {
  readonly topic: string;
  readonly papers: readonly SynthesisPaper[];
  readonly paperCount: number;
}

/** Synthesis output for a single topic cluster. */
export interface ClusterSynthesis {
  readonly topic: string;
  readonly paperCount: number;
  readonly papers: readonly string[];
  readonly commonThemes: readonly string[];
  readonly keyInsights: readonly string[];
  readonly techniques: readonly string[];
  readonly implementationOpportunities: readonly string[];
  readonly gaps: readonly string[];
}

/** Full synthesis result across all clusters. */
export interface SynthesisResult {
  readonly clusters: readonly ClusterSynthesis[];
  readonly totalPapers: number;
  readonly topicCount: number;
  readonly crossCuttingThemes: readonly string[];
}

/** Error for synthesis operations. */
export interface SynthesisError {
  readonly code: 'LOAD_ERROR' | 'NO_PAPERS';
  readonly message: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum papers in a cluster to generate cross-cutting themes. */
const MIN_CROSS_CUTTING_CLUSTER_SIZE = 2;

/** Tags that appear across many topics and indicate cross-cutting themes. */
const CROSS_CUTTING_TAG_THRESHOLD = 3;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Synthesize the research registry by grouping papers into topic clusters
 * and generating structured summaries.
 *
 * @param topicFilter - Optional topic to filter to a single cluster
 * @returns Structured synthesis result
 */
export async function synthesizeResearch(
  topicFilter?: string
): Promise<Result<SynthesisResult, SynthesisError>> {
  const registryResult = await loadPapersRegistry();
  if (!registryResult.ok) {
    return {
      ok: false,
      error: {
        code: 'LOAD_ERROR',
        message: `Failed to load papers: ${getErrorMessage(registryResult.error)}`,
      },
    };
  }

  const papers = extractPapers(registryResult.value);
  if (papers.length === 0) {
    return {
      ok: false,
      error: { code: 'NO_PAPERS', message: 'No papers found in registry' },
    };
  }

  const clusters = groupByTopic(papers);
  const filtered =
    topicFilter !== undefined ? clusters.filter((c) => c.topic === topicFilter) : clusters;

  const syntheses = filtered.map(synthesizeCluster);
  const crossCutting = findCrossCuttingThemes(filtered);

  return {
    ok: true,
    value: {
      clusters: syntheses,
      totalPapers: papers.length,
      topicCount: filtered.length,
      crossCuttingThemes: crossCutting,
    },
  };
}

// =============================================================================
// EXTRACTION
// =============================================================================

/** Extract papers from the registry structure. */
function extractPapers(registry: PapersRegistry): SynthesisPaper[] {
  return Object.entries(registry.papers).map(([id, p]) => ({
    id,
    title: p.title,
    topics: [...p.topics],
    tags: [...p.tags],
    summary: p.summary.trim(),
    keyFindings: [...p.key_findings],
    relevance: p.relevance,
    implementationStatus: p.implementation_status,
    techniquesExtracted: [...p.techniques_extracted],
  }));
}

// =============================================================================
// GROUPING
// =============================================================================

/** Group papers by primary topic into clusters. */
function groupByTopic(papers: readonly SynthesisPaper[]): PaperCluster[] {
  const topicMap = new Map<string, SynthesisPaper[]>();

  for (const paper of papers) {
    for (const topic of paper.topics) {
      const existing = topicMap.get(topic);
      if (existing !== undefined) {
        existing.push(paper);
      } else {
        topicMap.set(topic, [paper]);
      }
    }
  }

  const clusters: PaperCluster[] = [];
  for (const [topic, topicPapers] of topicMap) {
    clusters.push({
      topic,
      papers: topicPapers,
      paperCount: topicPapers.length,
    });
  }

  return clusters.sort((a, b) => b.paperCount - a.paperCount);
}

// =============================================================================
// SYNTHESIS
// =============================================================================

/** Generate synthesis for a single topic cluster. */
function synthesizeCluster(cluster: PaperCluster): ClusterSynthesis {
  const allTags = collectFrequencies(cluster.papers.flatMap((p) => [...p.tags]));
  const allTechniques = collectFrequencies(
    cluster.papers.flatMap((p) => [...p.techniquesExtracted])
  );
  const allFindings = cluster.papers.flatMap((p) => [...p.keyFindings]);

  // Common themes: tags that appear in 2+ papers
  const commonThemes = [...allTags.entries()]
    .filter(([, count]) => count >= MIN_CROSS_CUTTING_CLUSTER_SIZE)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  // Techniques across the cluster
  const techniques = [...allTechniques.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tech, count]) => (count > 1 ? `${tech} (${String(count)} papers)` : tech));

  // Implementation opportunities: techniques not yet implemented
  const notStarted = cluster.papers
    .filter((p) => p.implementationStatus === 'not-started')
    .flatMap((p) => [...p.techniquesExtracted]);
  const uniqueOpportunities = [...new Set(notStarted)];

  // Gaps: topics with few papers or missing techniques
  const gaps: string[] = [];
  if (cluster.paperCount === 1) {
    gaps.push(`Only 1 paper — more research needed on ${cluster.topic}`);
  }
  const highRelevanceUnimplemented = cluster.papers.filter(
    (p) => p.relevance === 'high' && p.implementationStatus === 'not-started'
  );
  if (highRelevanceUnimplemented.length > 0) {
    gaps.push(
      `${String(highRelevanceUnimplemented.length)} high-relevance paper(s) not yet implemented`
    );
  }

  return {
    topic: cluster.topic,
    paperCount: cluster.paperCount,
    papers: cluster.papers.map((p) => p.title),
    commonThemes,
    keyInsights: deduplicateFindings(allFindings).slice(0, 10),
    techniques,
    implementationOpportunities: uniqueOpportunities,
    gaps,
  };
}

/** Find themes that span multiple topic clusters. */
function findCrossCuttingThemes(clusters: readonly PaperCluster[]): string[] {
  const tagToTopics = new Map<string, Set<string>>();

  for (const cluster of clusters) {
    for (const paper of cluster.papers) {
      for (const tag of paper.tags) {
        const existing = tagToTopics.get(tag);
        if (existing !== undefined) {
          existing.add(cluster.topic);
        } else {
          tagToTopics.set(tag, new Set([cluster.topic]));
        }
      }
    }
  }

  return [...tagToTopics.entries()]
    .filter(([, topics]) => topics.size >= CROSS_CUTTING_TAG_THRESHOLD)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([tag, topics]) => `${tag} (spans: ${[...topics].join(', ')})`);
}

// =============================================================================
// UTILITIES
// =============================================================================

function collectFrequencies(items: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

/** Deduplicate findings by removing near-identical strings. */
function deduplicateFindings(findings: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const finding of findings) {
    const normalized = finding.toLowerCase().trim();
    if (normalized.length === 0) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(finding);
  }
  return result;
}
