/**
 * Product Type Detector
 *
 * Detects product type from task content using keyword matching against
 * the product matrix taxonomy. Used by SharedTaskAnalyzer to
 * enrich analysis results with product routing information.
 *
 * @module core/task-analysis/product-type-detector
 * (Source: Epic #643 Phase 3 - Product Matrix Routing)
 */

import type { ProductType } from '../../config/product-matrix/types.js';

/**
 * Result of product type detection.
 */
export interface ProductTypeDetection {
  readonly type: ProductType;
  readonly confidence: number;
}

/** Product type keyword patterns for detection */
const PRODUCT_TYPE_KEYWORDS: Record<ProductType, readonly string[]> = {
  api: ['rest', 'graphql', 'endpoint', 'api gateway', 'http handler', 'serialization'],
  'web-service': ['full-stack', 'web service', 'backend', 'server-side'],
  cli: ['command line', 'cli', 'terminal', 'shell script', 'argument parsing'],
  'frontend-web': ['react', 'vue', 'angular', 'spa', 'browser', 'component', 'ui/ux'],
  mobile: ['ios', 'android', 'react native', 'flutter', 'mobile app'],
  'data-pipeline': ['etl', 'pipeline', 'kafka', 'streaming', 'batch processing', 'airflow'],
  'ml-service': ['model', 'machine learning', 'pytorch', 'tensorflow', 'inference'],
  'infra-module': ['terraform', 'kubernetes', 'infrastructure', 'iac', 'cloud', 'docker'],
};

/**
 * Detects the product type from task content by scoring keyword matches.
 *
 * @param content - Task content to analyze
 * @param signals - Mutable array to push matched signal names into
 * @returns Detection result with type and confidence, or undefined if no match
 */
export function detectProductType(
  content: string,
  signals: string[]
): ProductTypeDetection | undefined {
  const lower = content.toLowerCase();
  const scores: Partial<Record<ProductType, number>> = {};
  let totalMatches = 0;

  for (const [type, keywords] of Object.entries(PRODUCT_TYPE_KEYWORDS) as Array<
    [ProductType, readonly string[]]
  >) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        scores[type] = (scores[type] ?? 0) + 1;
        totalMatches++;
        signals.push(`productType:${type}:${keyword}`);
      }
    }
  }

  if (totalMatches === 0) return undefined;

  // Find the product type with the highest score
  let bestType: ProductType | undefined;
  let bestScore = 0;
  for (const [type, score] of Object.entries(scores) as Array<[ProductType, number]>) {
    if (score > bestScore) {
      bestType = type;
      bestScore = score;
    }
  }

  if (bestType === undefined) return undefined;

  const confidence = bestScore / totalMatches;
  return { type: bestType, confidence };
}
