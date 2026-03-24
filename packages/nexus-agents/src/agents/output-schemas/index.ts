/**
 * nexus-agents/agents - Expert Output Schemas
 *
 * Zod schemas for structured expert outputs. Each expert role has
 * optional output validation: if the output matches the schema,
 * downstream consumers get typed structured data. If it doesn't,
 * the raw text is returned with a warning (graceful fallback).
 *
 * Inspired by CyberStrike's HackerOne-format structured reports
 * (adversary-lab research, nexus-agents #1608).
 *
 * @module agents/output-schemas
 */

import { z } from 'zod';
import type { BuiltInExpertType } from '../experts/expert-config.js';

/**
 * Security audit finding schema.
 */
export const SecurityFindingSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string(),
  location: z.string().optional(),
  description: z.string(),
  recommendation: z.string(),
  cwe: z.string().optional(),
  mitre_id: z.string().optional(),
});

/**
 * Security audit output schema.
 */
export const SecurityAuditOutputSchema = z.object({
  findings: z.array(SecurityFindingSchema),
  summary: z.string(),
  risk_level: z.enum(['critical', 'high', 'medium', 'low', 'none']).optional(),
  reasoning: z.string(),
});

/**
 * Code review item schema.
 */
export const CodeReviewItemSchema = z.object({
  category: z.enum(['bug', 'security', 'performance', 'style', 'suggestion']),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  file: z.string().optional(),
  line: z.number().optional(),
  description: z.string(),
  suggestion: z.string().optional(),
});

/**
 * Code review output schema.
 */
export const CodeReviewOutputSchema = z.object({
  items: z.array(CodeReviewItemSchema),
  summary: z.string(),
  overall_quality: z.enum(['excellent', 'good', 'acceptable', 'needs_work', 'poor']).optional(),
  reasoning: z.string(),
});

/**
 * Architecture decision schema.
 */
export const ArchitectureDecisionSchema = z.object({
  title: z.string(),
  status: z.enum(['proposed', 'accepted', 'rejected', 'superseded']).optional(),
  context: z.string(),
  decision: z.string(),
  consequences: z.array(z.string()),
  alternatives: z
    .array(
      z.object({
        name: z.string(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
      })
    )
    .optional(),
  reasoning: z.string(),
});

/**
 * Map of expert roles to their output schemas.
 * Not every role has a schema — roles without schemas return raw text.
 */
export const EXPERT_OUTPUT_SCHEMAS: Partial<Record<BuiltInExpertType, z.ZodType>> = {
  security: SecurityAuditOutputSchema,
  code: CodeReviewOutputSchema,
  architecture: ArchitectureDecisionSchema,
};

/**
 * Result of attempting to parse expert output into a structured schema.
 */
export interface StructuredOutputResult {
  /** Whether the output matched the schema */
  structured: boolean;
  /** Parsed structured data (if matched) */
  data?: unknown;
  /** Raw text output (always available) */
  rawText: string;
  /** Schema that was applied (if any) */
  schemaName?: string;
  /** Parse error message (if parsing failed) */
  parseError?: string;
}

/**
 * Attempt to parse expert output text as structured JSON matching the role's schema.
 *
 * This is a graceful parser: if the output doesn't contain valid JSON or doesn't
 * match the schema, it returns the raw text with structured=false. No error thrown.
 *
 * @param role - The expert role that produced the output
 * @param output - The raw text output from the expert
 * @returns StructuredOutputResult with parsed data or raw fallback
 */
export function tryParseStructuredOutput(
  role: BuiltInExpertType,
  output: string
): StructuredOutputResult {
  const schema = EXPERT_OUTPUT_SCHEMAS[role];
  if (!schema) {
    return { structured: false, rawText: output };
  }

  // Try to find JSON in the output (experts may wrap JSON in markdown code blocks)
  const jsonMatch =
    output.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) ?? output.match(/^\s*(\{[\s\S]*\})\s*$/);

  if (!jsonMatch) {
    return { structured: false, rawText: output, schemaName: role };
  }

  try {
    const parsed: unknown = JSON.parse(jsonMatch[1]);
    const result = schema.safeParse(parsed);

    if (result.success) {
      return {
        structured: true,
        data: result.data,
        rawText: output,
        schemaName: role,
      };
    }

    return {
      structured: false,
      rawText: output,
      schemaName: role,
      parseError: `Schema validation failed: ${result.error.message}`,
    };
  } catch {
    return {
      structured: false,
      rawText: output,
      schemaName: role,
      parseError: 'Invalid JSON in output',
    };
  }
}
