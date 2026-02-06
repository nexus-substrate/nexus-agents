/**
 * nexus-agents/config - Product Matrix
 *
 * Maps product types to skill bundles and expert weights for
 * intelligent task routing. Loads configuration from YAML with
 * Zod validation, falling back to a built-in default matrix.
 *
 * @module config/product-matrix
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as yaml from 'yaml';

import { ProductMatrixSchema } from './types.js';
import type { ProductMatrix, ProductConfig, ExpertWeight } from './types.js';

// Re-export all types and schemas
export {
  PRODUCT_TYPES,
  ProductTypeSchema,
  SkillBundleEntrySchema,
  ExpertWeightSchema,
  ProductConfigSchema,
  ProductMatrixSchema,
} from './types.js';

export type {
  ProductType,
  SkillBundleEntry,
  ExpertWeight,
  ProductConfig,
  ProductMatrix,
} from './types.js';

// ---------------------------------------------------------------------------
// Default Product Matrix
// ---------------------------------------------------------------------------

/** Built-in default product matrix with all 8 product types. */
export const DEFAULT_PRODUCT_MATRIX: ProductMatrix = {
  version: 1,
  products: [
    {
      type: 'api',
      description: 'RESTful or GraphQL API service',
      skillBundle: ['coding-standards', 'api-security', 'input-validation', 'testing', 'ci-cd'],
      expertWeights: [
        { role: 'code_expert', weight: 0.9 },
        { role: 'security_expert', weight: 0.7 },
        { role: 'testing_expert', weight: 0.6 },
        { role: 'architecture_expert', weight: 0.5 },
        { role: 'documentation_expert', weight: 0.3 },
      ],
      languages: ['typescript', 'python', 'go', 'java'],
      frameworks: ['express', 'fastify', 'flask', 'django', 'gin', 'spring'],
    },
    {
      type: 'web-service',
      description: 'Full-stack web service with frontend and backend',
      skillBundle: [
        'coding-standards',
        'api-security',
        'input-validation',
        'testing',
        'ci-cd',
        'frontend-standards',
        'accessibility',
      ],
      expertWeights: [
        { role: 'code_expert', weight: 0.9 },
        { role: 'architecture_expert', weight: 0.7 },
        { role: 'security_expert', weight: 0.6 },
        { role: 'testing_expert', weight: 0.6 },
        { role: 'documentation_expert', weight: 0.4 },
        { role: 'devops_expert', weight: 0.5 },
      ],
      languages: ['typescript', 'javascript', 'python', 'go'],
      frameworks: ['next', 'nuxt', 'remix', 'rails', 'django'],
    },
    {
      type: 'cli',
      description: 'Command-line interface tool or utility',
      skillBundle: [
        'coding-standards',
        'input-validation',
        'testing',
        'error-handling',
        'documentation',
      ],
      expertWeights: [
        { role: 'code_expert', weight: 0.9 },
        { role: 'testing_expert', weight: 0.7 },
        { role: 'documentation_expert', weight: 0.6 },
        { role: 'devops_expert', weight: 0.4 },
        { role: 'architecture_expert', weight: 0.3 },
      ],
      languages: ['typescript', 'python', 'go', 'rust'],
      frameworks: ['commander', 'yargs', 'click', 'cobra', 'clap'],
    },
    {
      type: 'frontend-web',
      description: 'Browser-based frontend application (SPA or SSR)',
      skillBundle: [
        'coding-standards',
        'frontend-standards',
        'accessibility',
        'testing',
        'performance',
        'ci-cd',
      ],
      expertWeights: [
        { role: 'code_expert', weight: 0.9 },
        { role: 'testing_expert', weight: 0.7 },
        { role: 'architecture_expert', weight: 0.5 },
        { role: 'security_expert', weight: 0.4 },
        { role: 'documentation_expert', weight: 0.3 },
      ],
      languages: ['typescript', 'javascript'],
      frameworks: ['react', 'vue', 'angular', 'svelte', 'solid'],
    },
    {
      type: 'mobile',
      description: 'Native or cross-platform mobile application',
      skillBundle: [
        'coding-standards',
        'mobile-standards',
        'testing',
        'performance',
        'accessibility',
        'ci-cd',
      ],
      expertWeights: [
        { role: 'code_expert', weight: 0.9 },
        { role: 'testing_expert', weight: 0.7 },
        { role: 'architecture_expert', weight: 0.6 },
        { role: 'security_expert', weight: 0.5 },
        { role: 'documentation_expert', weight: 0.3 },
      ],
      languages: ['typescript', 'kotlin', 'swift', 'dart'],
      frameworks: ['react-native', 'flutter', 'swiftui', 'jetpack-compose'],
    },
    {
      type: 'data-pipeline',
      description: 'ETL, streaming, or batch data processing pipeline',
      skillBundle: [
        'coding-standards',
        'data-validation',
        'testing',
        'error-handling',
        'observability',
        'ci-cd',
      ],
      expertWeights: [
        { role: 'code_expert', weight: 0.8 },
        { role: 'architecture_expert', weight: 0.8 },
        { role: 'testing_expert', weight: 0.6 },
        { role: 'devops_expert', weight: 0.7 },
        { role: 'security_expert', weight: 0.4 },
        { role: 'documentation_expert', weight: 0.4 },
      ],
      languages: ['python', 'scala', 'typescript', 'sql'],
      frameworks: ['spark', 'airflow', 'dbt', 'kafka', 'flink'],
    },
    {
      type: 'ml-service',
      description: 'Machine learning model serving or training pipeline',
      skillBundle: [
        'coding-standards',
        'data-validation',
        'testing',
        'model-evaluation',
        'observability',
        'ci-cd',
        'input-validation',
      ],
      expertWeights: [
        { role: 'code_expert', weight: 0.8 },
        { role: 'architecture_expert', weight: 0.7 },
        { role: 'testing_expert', weight: 0.7 },
        { role: 'security_expert', weight: 0.5 },
        { role: 'devops_expert', weight: 0.6 },
        { role: 'documentation_expert', weight: 0.5 },
      ],
      languages: ['python', 'typescript'],
      frameworks: ['pytorch', 'tensorflow', 'scikit-learn', 'huggingface', 'mlflow'],
    },
    {
      type: 'infra-module',
      description: 'Infrastructure-as-code module or platform component',
      skillBundle: [
        'coding-standards',
        'infra-security',
        'testing',
        'documentation',
        'ci-cd',
        'drift-detection',
      ],
      expertWeights: [
        { role: 'devops_expert', weight: 0.9 },
        { role: 'security_expert', weight: 0.8 },
        { role: 'architecture_expert', weight: 0.7 },
        { role: 'testing_expert', weight: 0.5 },
        { role: 'code_expert', weight: 0.4 },
        { role: 'documentation_expert', weight: 0.6 },
      ],
      languages: ['hcl', 'typescript', 'python', 'yaml'],
      frameworks: ['terraform', 'pulumi', 'cdk', 'cloudformation', 'ansible'],
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Validates that a file path does not escape the working directory.
 * Prevents path traversal attacks when loading user-specified files.
 */
function validateFilePath(filePath: string): string {
  const resolved = resolve(filePath);
  const cwd = process.cwd();
  if (!resolved.startsWith(resolve(cwd))) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${cwd}`);
  }
  return resolved;
}

/**
 * Parses raw YAML content into an unknown value.
 * Throws with a descriptive message on parse failure.
 */
function parseYamlContent(content: string, source: string): unknown {
  try {
    return yaml.parse(content) as unknown;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown parse error';
    throw new Error(`Failed to parse YAML from ${source}: ${message}`);
  }
}

/**
 * Loads and validates a product matrix from a YAML file.
 *
 * When no `filePath` is provided the function returns the built-in
 * `DEFAULT_PRODUCT_MATRIX` constant. When a path is provided, the
 * file is read, parsed, and validated against `ProductMatrixSchema`.
 *
 * @param filePath - Optional path to a product-matrix YAML file
 * @returns A validated ProductMatrix object
 * @throws Error if the file cannot be read, parsed, or fails validation
 */
export function loadProductMatrix(filePath?: string): ProductMatrix {
  // No file specified -- return the default matrix
  if (filePath === undefined) {
    return DEFAULT_PRODUCT_MATRIX;
  }

  const resolvedPath = validateFilePath(filePath);

  if (!existsSync(resolvedPath)) {
    throw new Error(`Product matrix file not found: ${resolvedPath}`);
  }

  const content = readFileSync(resolvedPath, 'utf-8');
  const parsed = parseYamlContent(content, resolvedPath);
  const result = ProductMatrixSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Product matrix validation failed:\n${issues}`);
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Finds a product configuration by its type within a matrix.
 *
 * @param matrix - The product matrix to search
 * @param type - The product type to find
 * @returns The matching ProductConfig, or undefined if not found
 */
export function findProductConfig(matrix: ProductMatrix, type: string): ProductConfig | undefined {
  return matrix.products.find((product) => product.type === type);
}

/**
 * Returns the expert weights for a given product type, sorted by
 * weight descending (most important first).
 *
 * @param matrix - The product matrix to search
 * @param type - The product type to query
 * @returns Sorted expert weights, or an empty array if the type is not found
 */
export function getExpertWeightsByProduct(
  matrix: ProductMatrix,
  type: string
): readonly ExpertWeight[] {
  const config = findProductConfig(matrix, type);
  if (config === undefined) {
    return [];
  }
  return [...config.expertWeights].sort((a, b) => b.weight - a.weight);
}
