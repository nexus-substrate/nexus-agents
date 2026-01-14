/**
 * Agreement-Based Cascade Router Helpers
 *
 * Helper functions for response similarity and clustering.
 *
 * @module cli-adapters/agreement-cascade-helpers
 * (Source: Issue #121, arXiv:2410.10347)
 */

import type { CliResponse, CliName } from './types.js';
import type { CascadeStage, ResponseCluster, StageResult } from './agreement-cascade-types.js';

/**
 * Tokenize text into a set of normalized tokens.
 */
export function tokenize(text: string): Set<string> {
  // Extract meaningful tokens (words, code identifiers)
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  return new Set(tokens);
}

/**
 * Calculate similarity between two responses using token overlap.
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0;
  }

  // Jaccard similarity
  const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

/**
 * Calculate average pairwise similarity within a cluster.
 */
export function calculateClusterSimilarity(
  models: readonly CliName[],
  responses: ReadonlyMap<CliName, CliResponse>
): number {
  if (models.length <= 1) return 1;

  let totalSimilarity = 0;
  let pairCount = 0;

  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const resp1 = responses.get(models[i] as CliName);
      const resp2 = responses.get(models[j] as CliName);
      if (resp1 !== undefined && resp2 !== undefined) {
        totalSimilarity += calculateSimilarity(resp1.text, resp2.text);
        pairCount++;
      }
    }
  }

  return pairCount > 0 ? totalSimilarity / pairCount : 0;
}

/**
 * Cluster responses by semantic similarity.
 * Uses simplified token overlap as similarity metric.
 */
export function clusterResponses(responses: ReadonlyMap<CliName, CliResponse>): ResponseCluster[] {
  const entries = Array.from(responses.entries());
  const clusters: ResponseCluster[] = [];
  const assigned = new Set<CliName>();

  for (const [model, response] of entries) {
    if (assigned.has(model)) continue;

    // Start a new cluster with this response
    const clusterModels: CliName[] = [model];
    assigned.add(model);

    // Find similar responses
    for (const [otherModel, otherResponse] of entries) {
      if (assigned.has(otherModel)) continue;

      const similarity = calculateSimilarity(response.text, otherResponse.text);
      if (similarity >= 0.7) {
        clusterModels.push(otherModel);
        assigned.add(otherModel);
      }
    }

    clusters.push({
      models: clusterModels,
      response,
      internalSimilarity: calculateClusterSimilarity(clusterModels, responses),
    });
  }

  return clusters;
}

/**
 * Select the best response from all stage results.
 */
export function selectBestResponse(
  stageHistory: readonly StageResult[]
): { response: CliResponse; model: CliName } | undefined {
  // Prefer responses from later stages (more capable models)
  for (let i = stageHistory.length - 1; i >= 0; i--) {
    const stage = stageHistory[i];
    if (stage === undefined) continue;

    // Find the response with best characteristics
    const candidates = Array.from(stage.responses.entries());
    if (candidates.length > 0) {
      // Sort by response length (longer responses often more complete)
      candidates.sort((a, b) => b[1].text.length - a[1].text.length);
      const best = candidates[0];
      if (best !== undefined) {
        return { response: best[1], model: best[0] };
      }
    }
  }

  return undefined;
}

/**
 * Creates default cascade stages for typical usage.
 * Fast -> Balanced -> Powerful progression.
 */
export function createDefaultCascadeStages(): CascadeStage[] {
  return [
    {
      name: 'fast',
      models: ['gemini'] as CliName[], // Fast, cheap
      costWeight: 1,
    },
    {
      name: 'balanced',
      models: ['gemini', 'codex'] as CliName[], // Multiple models for agreement
      costWeight: 3,
    },
    {
      name: 'powerful',
      models: ['claude', 'gemini'] as CliName[], // High capability
      costWeight: 10,
    },
  ];
}
