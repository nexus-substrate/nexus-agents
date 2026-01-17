/**
 * nexus-agents/mcp/safety - STPA Zod Schemas
 *
 * Runtime validation schemas for STPA types.
 * Extracted from stpa-types.ts to maintain file size limits.
 *
 * @module mcp/safety/stpa-schemas
 * (Source: Issue #339)
 */

import { z } from 'zod';
// Import enums directly from stpa-enums.ts to avoid circular dependencies
import { HazardCategory, HazardSeverity, ConstraintPriority, RiskLevel } from './stpa-enums.js';

// =============================================================================
// Enum Schemas
// =============================================================================

/**
 * Zod schema for HazardCategory validation.
 */
export const HazardCategorySchema = z.nativeEnum(HazardCategory);

/**
 * Zod schema for HazardSeverity validation.
 */
export const HazardSeveritySchema = z.nativeEnum(HazardSeverity);

/**
 * Zod schema for ConstraintPriority validation.
 */
export const ConstraintPrioritySchema = z.nativeEnum(ConstraintPriority);

/**
 * Zod schema for RiskLevel validation.
 */
export const RiskLevelSchema = z.nativeEnum(RiskLevel);

// =============================================================================
// Core Type Schemas
// =============================================================================

/**
 * Zod schema for TriggerPattern validation.
 */
export const TriggerPatternSchema = z.object({
  parameter: z.string().min(1),
  matchType: z.enum(['contains', 'regex', 'equals', 'startsWith', 'endsWith']),
  pattern: z.string(),
  reason: z.string(),
});

/**
 * Zod schema for Hazard validation.
 */
export const HazardSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  category: HazardCategorySchema,
  severity: HazardSeveritySchema,
  likelihood: z.enum(['almost_certain', 'likely', 'possible', 'unlikely', 'rare']),
  triggerConditions: z.array(z.string()),
  consequences: z.array(z.string()),
});

/**
 * Zod schema for UnsafeControlAction validation.
 */
export const UnsafeControlActionSchema = z.object({
  id: z.string().min(1),
  toolName: z.string().min(1),
  type: z.enum(['not_provided', 'provided_causes_hazard', 'wrong_timing', 'wrong_duration']),
  description: z.string(),
  unsafeContext: z.string(),
  relatedHazards: z.array(z.string()),
  triggerPatterns: z.array(TriggerPatternSchema).optional(),
});

/**
 * Zod schema for SafetyConstraint validation.
 */
export const SafetyConstraintSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  mitigates: z.array(z.string()),
  enforcement: z.enum([
    'prevent',
    'require_confirmation',
    'alert',
    'sanitize',
    'rate_limit',
    'require_privilege',
  ]),
  validationFunction: z.string().optional(),
  priority: ConstraintPrioritySchema,
});

// =============================================================================
// Tool Definition Schemas
// =============================================================================

/**
 * Zod schema for PropertySchema validation.
 */
export const PropertySchemaSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  enum: z.array(z.unknown()).optional(),
  pattern: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
});

/**
 * Zod schema for ToolInputSchema validation.
 */
export const ToolInputSchemaSchema = z.object({
  type: z.string(),
  properties: z.record(PropertySchemaSchema).optional(),
  required: z.array(z.string()).optional(),
  additionalProperties: z.boolean().optional(),
});

/**
 * Zod schema for ToolDefinition validation.
 */
export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: ToolInputSchemaSchema,
});

// =============================================================================
// Configuration Schema
// =============================================================================

/**
 * Zod schema for AnalysisConfiguration validation.
 */
export const AnalysisConfigurationSchema = z.object({
  includeLowSeverity: z.boolean().default(true),
  generateAllConstraints: z.boolean().default(true),
  checkInteractions: z.boolean().default(true),
  maxHazardsPerTool: z.number().int().min(1).max(100).default(50),
  categories: z.array(HazardCategorySchema).default([]),
});

export type AnalysisConfigurationInput = z.input<typeof AnalysisConfigurationSchema>;

// =============================================================================
// Validation Result Schemas
// =============================================================================

/**
 * Zod schema for ConstraintViolation validation.
 */
export const ConstraintViolationSchema = z.object({
  constraintId: z.string().min(1),
  constraintDescription: z.string(),
  severity: HazardSeveritySchema,
  details: z.string(),
  remediation: z.string(),
});

/**
 * Zod schema for ValidationWarning validation.
 */
export const ValidationWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  affected: z.string(),
});

/**
 * Zod schema for ValidationResult validation.
 */
export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  toolName: z.string().min(1),
  violations: z.array(ConstraintViolationSchema),
  passed: z.array(z.string()),
  warnings: z.array(ValidationWarningSchema),
  validatedAt: z.date(),
});
