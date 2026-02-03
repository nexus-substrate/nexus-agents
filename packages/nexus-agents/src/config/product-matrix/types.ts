/**
 * nexus-agents/config - Product Matrix Type Definitions
 *
 * Zod schemas and TypeScript interfaces for mapping product types
 * to skill bundles and expert weights for intelligent task routing.
 *
 * @module config/product-matrix/types
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Product Types
// ---------------------------------------------------------------------------

/**
 * Supported product types for task routing.
 * Each type maps to a specific skill bundle and expert weight configuration.
 */
export const PRODUCT_TYPES = [
  'api',
  'web-service',
  'cli',
  'frontend-web',
  'mobile',
  'data-pipeline',
  'ml-service',
  'infra-module',
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/**
 * Schema for a valid product type identifier.
 */
export const ProductTypeSchema = z.enum(PRODUCT_TYPES, {
  errorMap: (_issue, _ctx) => ({
    message: `Invalid product type. Valid options: ${PRODUCT_TYPES.join(', ')}`,
  }),
});

/**
 * Schema for a skill bundle entry with a weight for expert weighting.
 */
export const SkillBundleEntrySchema = z.object({
  /** Skill identifier from the skill library */
  skillId: z.string().min(1, 'Skill ID is required'),
  /** Weight for expert weighting (0-1, where 1 is most important) */
  weight: z.number().min(0).max(1),
});

/**
 * Schema for expert role weighting within a product type.
 */
export const ExpertWeightSchema = z.object({
  /** Expert role identifier (e.g. code_expert, security_expert) */
  role: z.string().min(1, 'Expert role is required'),
  /** Importance weight for this expert in the product context (0-1) */
  weight: z.number().min(0).max(1),
});

/**
 * Schema for a single product type configuration.
 */
export const ProductConfigSchema = z.object({
  /** Product type identifier */
  type: ProductTypeSchema,
  /** Human-readable description of this product type */
  description: z.string().min(1, 'Description is required'),
  /** Skill IDs in the bundle for this product type */
  skillBundle: z.array(z.string().min(1)).min(1, 'At least one skill is required'),
  /** Expert role weights for task routing */
  expertWeights: z.array(ExpertWeightSchema).min(1, 'At least one expert weight is required'),
  /** Supported programming languages (optional) */
  languages: z.array(z.string().min(1)).optional(),
  /** Common frameworks for this product type (optional) */
  frameworks: z.array(z.string().min(1)).optional(),
});

/**
 * Schema for the complete product matrix configuration.
 */
export const ProductMatrixSchema = z.object({
  /** Schema version for forward compatibility */
  version: z.number().int().positive(),
  /** Product type configurations */
  products: z.array(ProductConfigSchema).min(1, 'At least one product configuration is required'),
});

// ---------------------------------------------------------------------------
// TypeScript Interfaces (inferred from Zod schemas)
// ---------------------------------------------------------------------------

/** A skill bundle entry with a weight for expert weighting. */
export type SkillBundleEntry = z.infer<typeof SkillBundleEntrySchema>;

/** Expert role weighting within a product type. */
export type ExpertWeight = z.infer<typeof ExpertWeightSchema>;

/** Configuration for a single product type. */
export type ProductConfig = z.infer<typeof ProductConfigSchema>;

/** Complete product matrix configuration. */
export type ProductMatrix = z.infer<typeof ProductMatrixSchema>;
