/**
 * Research Review and Prioritize Handlers
 *
 * Implements the discover → score → issue → vote end-to-end workflows.
 *
 * @module cli/research-helpers-review
 * (Source: Research System Enhancement - Phase 3A/3B)
 */

import type { DiscoveredSource } from './research-helpers-sources.js';
import type { Result } from '../core/result.js';
import { rankDiscoveredItems, type QualityScore } from './research-helpers-scoring.js';
import {
  createResearchIssue,
  formatResearchIssueBody,
  type ResearchFinding,
} from './research-helpers-issues.js';
import { loadTechniquesRegistry } from './research-helpers-io.js';
import type { TechniquesRegistry } from './research-types.js';

// =============================================================================
// REVIEW HANDLER
// =============================================================================

/** Options for the review command. */
export interface ReviewOptions {
  readonly topic: string;
  readonly maxResults: number;
  readonly createIssues: boolean;
  readonly vote: boolean;
}

/** Result of a review operation. */
export interface ReviewResult {
  readonly topic: string;
  readonly itemCount: number;
  readonly rankedItems: Array<{ item: DiscoveredSource; score: QualityScore }>;
  readonly issuesCreated: string[];
  readonly errors: string[];
}

/**
 * Execute a research review: discover → score → rank → (optionally) create issues.
 *
 * @param options - Review options
 * @param discoverFn - Function that discovers items from sources
 * @returns Review result with ranked items and any created issues
 */
export async function executeReview(
  options: ReviewOptions,
  discoverFn: (
    topic: string,
    maxResults: number
  ) => Promise<{ results: DiscoveredSource[]; errors: string[] }>
): Promise<ReviewResult> {
  const { results, errors } = await discoverFn(options.topic, options.maxResults);
  const ranked = rankDiscoveredItems(results, options.topic);
  const issuesCreated: string[] = [];

  if (options.createIssues) {
    const highQuality = ranked.filter((r) => r.score.composite >= 0.6);
    for (const { item, score } of highQuality.slice(0, 5)) {
      const finding: ResearchFinding = {
        title: item.title,
        source: item.source,
        url: item.url,
        description: item.description,
        relevance: item.relevance,
        priority: score.composite >= 0.8 ? 'P1' : 'P2',
      };
      const body = formatResearchIssueBody([finding]);
      const result = await createResearchIssue({
        title: `research: ${item.title}`,
        body,
        labels: ['research', 'discovered'],
      });
      if (result.ok) issuesCreated.push(result.value.url);
      else errors.push(`Issue creation failed: ${result.error.message}`);
    }
  }

  return {
    topic: options.topic,
    itemCount: results.length,
    rankedItems: ranked,
    issuesCreated,
    errors,
  };
}

/** Format review results for CLI display. */
export function formatReviewResults(result: ReviewResult): string {
  const lines: string[] = [];
  lines.push(`Research Review: "${result.topic}"`);
  lines.push('='.repeat(60));
  lines.push(`Found ${String(result.itemCount)} items, ranked by quality score`);
  lines.push('');

  for (const { item, score } of result.rankedItems.slice(0, 20)) {
    const scoreStr = String(Math.round(score.composite * 100));
    lines.push(`  [${scoreStr}%] ${item.title}`);
    lines.push(`    Source: ${item.source} | Relevance: ${item.relevance}`);
    lines.push(`    URL: ${item.url}`);
    lines.push('');
  }

  if (result.issuesCreated.length > 0) {
    lines.push(`Issues created: ${String(result.issuesCreated.length)}`);
    for (const url of result.issuesCreated) lines.push(`  - ${url}`);
  }

  if (result.errors.length > 0) {
    lines.push('Errors:');
    for (const err of result.errors) lines.push(`  - ${err}`);
  }

  return lines.join('\n');
}

// =============================================================================
// PRIORITIZE HANDLER
// =============================================================================

/** Options for the prioritize command. */
export interface PrioritizeOptions {
  readonly topic?: string | undefined;
  readonly vote: boolean;
}

/** Priority backlog item. */
interface BacklogItem {
  readonly id: string;
  readonly name: string;
  readonly topic: string;
  readonly status: string;
  readonly priority: string;
}

/** Extract backlog items from a loaded registry. */
function extractBacklogItems(registry: TechniquesRegistry, topic?: string): BacklogItem[] {
  const items: BacklogItem[] = [];
  for (const [id, tech] of Object.entries(registry.techniques)) {
    if (topic !== undefined && tech.topic !== topic) continue;
    if (tech.status === 'implemented' || tech.status === 'rejected') continue;
    items.push({
      id,
      name: tech.name,
      topic: tech.topic,
      status: tech.status,
      priority: tech.priority ?? 'unset',
    });
  }
  const priorityOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3, unset: 4 };
  items.sort((a, b) => (priorityOrder[a.priority] ?? 5) - (priorityOrder[b.priority] ?? 5));
  return items;
}

/** Build priority backlog from techniques registry. */
async function buildBacklog(topic?: string): Promise<Result<BacklogItem[], Error>> {
  const techResult = await loadTechniquesRegistry();
  if (!techResult.ok) {
    return {
      ok: false,
      error: new Error(`Failed to load techniques registry: ${techResult.error.message}`),
    };
  }
  return { ok: true, value: extractBacklogItems(techResult.value, topic) };
}

/**
 * Execute the prioritize command.
 *
 * @param options - Prioritize options
 * @returns Formatted prioritized backlog string
 */
export async function executePrioritize(options: PrioritizeOptions): Promise<string> {
  const result = await buildBacklog(options.topic);
  if (!result.ok) return `Error: ${result.error.message}`;

  const items = result.value;
  if (items.length === 0) {
    return options.topic !== undefined
      ? `No actionable techniques found for topic: ${options.topic}`
      : 'No actionable techniques found in registry';
  }

  const lines: string[] = [];
  lines.push('Research Priority Backlog');
  lines.push('='.repeat(60));
  lines.push(`${String(items.length)} actionable techniques`);
  lines.push('');

  // Group by topic
  const byTopic = new Map<string, BacklogItem[]>();
  for (const item of items) {
    const existing = byTopic.get(item.topic) ?? [];
    existing.push(item);
    byTopic.set(item.topic, existing);
  }

  for (const [topic, topicItems] of byTopic) {
    lines.push(`## ${topic} (${String(topicItems.length)} items)`);
    for (const item of topicItems) {
      lines.push(`  [${item.priority}] ${item.name} (${item.status})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
