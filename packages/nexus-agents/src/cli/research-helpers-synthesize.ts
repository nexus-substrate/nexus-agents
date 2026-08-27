/**
 * Research Synthesis Helper
 *
 * Groups papers by topic cluster and generates structured synthesis
 * summaries with themes, findings, and implementation opportunities.
 *
 * @module cli/research-helpers-synthesize
 * (Source: Issue #1386 — Research Synthesis Pipeline)
 */

import { z } from 'zod';
import { loadPapersRegistry } from './research-helpers-io.js';
import type { PapersRegistry } from './research-types.js';
import type { Result } from '../core/result.js';
import { getErrorMessage } from '../core/index.js';
import { TECHNIQUE_IMPLEMENTATION_MAP, FEATURE_GATE_INVENTORY } from './research-alignment-map.js';
import { normalizeTopicToCanonical } from '../research/topic-aliases.js';

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
  readonly qualityScore: number;
  readonly evidenceTier: 'high' | 'medium' | 'low';
  /** Source URI — the paper URL, or `arxiv:<id>` (#2663 provenance). */
  readonly sourceUri?: string;
  /** Publication date as recorded in the registry (#2663 provenance). */
  readonly publicationDate?: string;
}

/**
 * A reference to a source paper, carried into synthesis output so a
 * cluster is traceable back to its inputs (#2663).
 */
export interface SynthesisPaperRef {
  readonly id: string;
  readonly title: string;
  readonly sourceUri?: string;
}

/**
 * A synthesized insight with its provenance (#2663). `sourcePaperIds` is
 * never empty — every merged claim is attributed. When two papers assert
 * the same finding, BOTH ids appear, so a contradiction is *representable*
 * as multiple attributed sources rather than silently collapsed into one.
 */
export interface AttributedInsight {
  readonly insight: string;
  readonly sourcePaperIds: readonly string[];
}

/**
 * Structural enforcement of the #2663 provenance invariant: every
 * synthesized insight must carry at least one source paper id. A doc rule
 * alone is fragile — this Zod schema makes "no unattributed claim" a
 * validated guarantee, not a hope.
 */
export const AttributedInsightSchema = z.object({
  insight: z.string().min(1),
  sourcePaperIds: z.array(z.string().min(1)).min(1),
});

/** A cluster of related papers grouped by topic. */
export interface PaperCluster {
  readonly topic: string;
  readonly papers: readonly SynthesisPaper[];
  readonly paperCount: number;
}

/** A technique aligned to an existing implementation. */
export interface TechniqueAlignment {
  readonly technique: string;
  readonly status: 'implemented' | 'partial' | 'not-started';
  readonly canonicalPath?: string | undefined;
  readonly improvementHint?: string | undefined;
}

/** Quality distribution within a cluster. */
export interface QualityDistribution {
  readonly avgScore: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
}

/** Synthesis output for a single topic cluster. */
export interface ClusterSynthesis {
  readonly topic: string;
  readonly paperCount: number;
  readonly papers: readonly SynthesisPaperRef[];
  readonly commonThemes: readonly string[];
  readonly keyInsights: readonly AttributedInsight[];
  /**
   * How many attributed findings this cluster actually had (#5001).
   *
   * `keyInsights` is capped, and the cap bites: against the live registry six
   * of eleven clusters exceed it, `orchestration` with 55. A caller seeing
   * `paperCount: 40` beside ten insights could not tell "these are the
   * cluster's insights" from "these are ten of fifty-five". A bounded read is
   * fine; a bounded read reported as complete is not.
   */
  readonly totalInsights: number;
  readonly techniques: readonly string[];
  readonly implementationOpportunities: readonly string[];
  readonly gaps: readonly string[];
  readonly alignedTechniques: readonly TechniqueAlignment[];
  readonly qualityDistribution: QualityDistribution;
}

/** Summary of alignment between research and implementation. */
export interface AlignmentSummary {
  readonly implemented: number;
  readonly partial: number;
  readonly notStarted: number;
  readonly total: number;
  readonly topOpportunities: readonly string[];
  /**
   * How many improvement opportunities existed before `topOpportunities` was
   * capped (#5001).
   *
   * The alignment map holds twelve `partial` techniques carrying a hint, so
   * the cap bites on any repo whose research touches most of them. Ten listed
   * entries look identical whether ten or fifty were found; a bounded read is
   * fine, a bounded read reported as complete is not. Mirrors
   * `ClusterSynthesis.totalInsights`.
   */
  readonly totalOpportunities: number;
}

/** Summary of a single feature gate for synthesis output. */
export interface FeatureGateStatus {
  readonly envVar: string;
  readonly defaultValue: string;
  readonly description: string;
  readonly linkedTechniqueCount: number;
}

/** Full synthesis result across all clusters. */
export interface SynthesisResult {
  readonly clusters: readonly ClusterSynthesis[];
  readonly totalPapers: number;
  readonly topicCount: number;
  readonly crossCuttingThemes: readonly string[];
  readonly alignmentSummary: AlignmentSummary;
  readonly featureGates: readonly FeatureGateStatus[];
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
  const alignmentSummary = buildAlignmentSummary(syntheses);
  const featureGates = buildFeatureGateSummary();

  return {
    ok: true,
    value: {
      clusters: syntheses,
      totalPapers: papers.length,
      topicCount: filtered.length,
      crossCuttingThemes: crossCutting,
      alignmentSummary,
      featureGates,
    },
  };
}

// =============================================================================
// EXTRACTION
// =============================================================================

/**
 * Safely convert a field that types say is `readonly string[]` but may be
 * null/undefined at runtime (YAML parsing of empty array fields).
 */
function safeArray(value: readonly string[]): string[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- YAML parsing can yield null despite type
  if (value === null || value === undefined) return [];
  return Array.from(value);
}

/** Extract papers from the registry structure. */
/** Source URI for a paper: prefer the URL, else `arxiv:<id>` (#2663). */
function paperSourceUri(p: PapersRegistry['papers'][string]): string | undefined {
  if (typeof p.url === 'string' && p.url.length > 0) return p.url;
  if (typeof p.arxiv_id === 'string' && p.arxiv_id.length > 0) return `arxiv:${p.arxiv_id}`;
  return undefined;
}

function extractPapers(registry: PapersRegistry): SynthesisPaper[] {
  return Object.entries(registry.papers).map(([id, p]) => {
    const sourceUri = paperSourceUri(p);
    return {
      id,
      title: p.title,
      topics: safeArray(p.topics),
      tags: safeArray(p.tags),
      summary: p.summary.trim(),
      keyFindings: safeArray(p.key_findings),
      relevance: p.relevance,
      implementationStatus: p.implementation_status,
      techniquesExtracted: safeArray(p.techniques_extracted),
      qualityScore: p.quality_score ?? 0,
      evidenceTier: p.evidence_tier ?? 'low',
      // #2663 — carry provenance from the registry into synthesis.
      ...(sourceUri !== undefined ? { sourceUri } : {}),
      ...(typeof p.publication_date === 'string' ? { publicationDate: p.publication_date } : {}),
    };
  });
}

// =============================================================================
// GROUPING
// =============================================================================

/** Group papers by primary topic into clusters, normalizing free-form topics. */
function groupByTopic(papers: readonly SynthesisPaper[]): PaperCluster[] {
  const topicMap = new Map<string, SynthesisPaper[]>();

  for (const paper of papers) {
    for (const rawTopic of paper.topics) {
      const topic = normalizeTopicToCanonical(rawTopic);
      const existing = topicMap.get(topic);
      if (existing !== undefined) {
        existing.push(paper);
      } else {
        topicMap.set(topic, [paper]);
      }
    }
  }

  const clusters: PaperCluster[] = [];
  for (const [topic, unsortedPapers] of topicMap) {
    // Sort papers within cluster by quality_score descending (high-quality first)
    const topicPapers = [...unsortedPapers].sort((a, b) => b.qualityScore - a.qualityScore);
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
/** Compute quality score distribution for a set of papers. */
function computeClusterQuality(papers: readonly SynthesisPaper[]): QualityDistribution {
  const scores = papers.map((p) => p.qualityScore);
  const totalScore = scores.reduce((sum, s) => sum + s, 0);
  return {
    avgScore: scores.length > 0 ? Math.round((totalScore / scores.length) * 10) / 10 : 0,
    high: papers.filter((p) => p.evidenceTier === 'high').length,
    medium: papers.filter((p) => p.evidenceTier === 'medium').length,
    low: papers.filter((p) => p.evidenceTier === 'low').length,
  };
}

function synthesizeCluster(cluster: PaperCluster): ClusterSynthesis {
  const allTags = collectFrequencies(cluster.papers.flatMap((p) => [...p.tags]));
  const allTechniques = collectFrequencies(
    cluster.papers.flatMap((p) => [...p.techniquesExtracted])
  );

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

  // Alignment analysis: map techniques to existing implementations
  const allTechNames = [...allTechniques.keys()];
  const alignedTechniques = analyzeClusterAlignment(allTechNames);

  const qualityDistribution = computeClusterQuality(cluster.papers);

  // Add quality gap if most papers are low-quality
  if (qualityDistribution.low > qualityDistribution.high + qualityDistribution.medium) {
    gaps.push(
      `Mostly low-evidence papers (${String(qualityDistribution.low)}/${String(cluster.paperCount)}) — findings need stronger validation`
    );
  }

  return {
    ...insightFields(cluster.papers),
    topic: cluster.topic,
    paperCount: cluster.paperCount,
    papers: cluster.papers.map(toPaperRef),
    commonThemes,
    techniques,
    implementationOpportunities: uniqueOpportunities,
    gaps,
    alignedTechniques,
    qualityDistribution,
  };
}

/** Insights carried per cluster. The count dropped is disclosed, not silent. */
const MAX_CLUSTER_INSIGHTS = 10;

/** Cap on the improvement opportunities listed in the alignment summary (#5001). */
const MAX_TOP_OPPORTUNITIES = 10;

/**
 * The capped insight list plus the count it was capped from (#5001).
 *
 * Returned together so the two can never drift: a `keyInsights` without its
 * `totalInsights` is the silent truncation this replaced.
 */
function insightFields(papers: readonly SynthesisPaper[]): {
  keyInsights: readonly AttributedInsight[];
  totalInsights: number;
} {
  const all = attributeFindings(papers);
  return { keyInsights: all.slice(0, MAX_CLUSTER_INSIGHTS), totalInsights: all.length };
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
// ALIGNMENT ANALYSIS
// =============================================================================

/** Analyze technique alignment for a cluster. */
function analyzeClusterAlignment(techniques: readonly string[]): TechniqueAlignment[] {
  const alignments: TechniqueAlignment[] = [];

  for (const tech of techniques) {
    // Strip count annotation like "technique (2 papers)"
    const baseTech = tech.replace(/\s*\(\d+\s*papers?\)$/, '');
    const mapping = TECHNIQUE_IMPLEMENTATION_MAP.get(baseTech);

    if (mapping !== undefined) {
      alignments.push({
        technique: baseTech,
        status: mapping.status,
        canonicalPath: mapping.path,
        ...(mapping.hint !== undefined ? { improvementHint: mapping.hint } : {}),
      });
    } else {
      alignments.push({ technique: baseTech, status: 'not-started' });
    }
  }

  return alignments;
}

/** Build alignment summary across all clusters. */
function buildAlignmentSummary(clusters: readonly ClusterSynthesis[]): AlignmentSummary {
  const allAlignments = clusters.flatMap((c) => c.alignedTechniques);
  const implemented = allAlignments.filter((a) => a.status === 'implemented').length;
  const partial = allAlignments.filter((a) => a.status === 'partial').length;
  const notStarted = allAlignments.filter((a) => a.status === 'not-started').length;

  // Top opportunities: partial implementations with hints (most improvable)
  const opportunities = allAlignments
    .filter((a) => a.status === 'partial' && a.improvementHint !== undefined)
    .map((a) => `${a.technique}: ${a.improvementHint ?? ''}`);

  return {
    implemented,
    partial,
    notStarted,
    total: allAlignments.length,
    // Capped and counted together so the two cannot drift — a
    // `topOpportunities` without its total is the silent truncation this
    // replaced (#5001).
    topOpportunities: opportunities.slice(0, MAX_TOP_OPPORTUNITIES),
    totalOpportunities: opportunities.length,
  };
}

/** Build feature gate summary from the inventory. */
function buildFeatureGateSummary(): FeatureGateStatus[] {
  return FEATURE_GATE_INVENTORY.map((g) => ({
    envVar: g.envVar,
    defaultValue: g.defaultValue,
    description: g.description,
    linkedTechniqueCount: g.techniques?.length ?? 0,
  }));
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

/** Project a source paper to the lean reference carried into output (#2663). */
function toPaperRef(p: SynthesisPaper): SynthesisPaperRef {
  return {
    id: p.id,
    title: p.title,
    ...(p.sourceUri !== undefined ? { sourceUri: p.sourceUri } : {}),
  };
}

/**
 * Deduplicate findings across a cluster's papers WHILE preserving
 * provenance (#2663). Findings are keyed by normalized text; when two
 * papers assert the same finding, both ids are collected — so a
 * contradiction is representable as multiple attributed sources rather
 * than silently collapsed. Every returned insight is validated to carry
 * at least one source id (`AttributedInsightSchema`).
 */
function attributeFindings(papers: readonly SynthesisPaper[]): AttributedInsight[] {
  const byNormalized = new Map<string, { insight: string; sourcePaperIds: Set<string> }>();
  for (const paper of papers) {
    for (const finding of paper.keyFindings) {
      const normalized = finding.toLowerCase().trim();
      if (normalized.length === 0) continue;
      const existing = byNormalized.get(normalized);
      if (existing !== undefined) {
        existing.sourcePaperIds.add(paper.id);
      } else {
        byNormalized.set(normalized, {
          insight: finding,
          sourcePaperIds: new Set([paper.id]),
        });
      }
    }
  }
  return [...byNormalized.values()].map((e) =>
    AttributedInsightSchema.parse({ insight: e.insight, sourcePaperIds: [...e.sourcePaperIds] })
  );
}
