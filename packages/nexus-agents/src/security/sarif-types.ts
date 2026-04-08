/**
 * SARIF Types and Security Finding Schema (#1682)
 *
 * Types for parsing SARIF (Static Analysis Results Interchange Format)
 * output from security scanners (Semgrep, CodeQL, Bandit, ESLint).
 * Normalizes findings into a unified schema for MCP tool consumption.
 *
 * @module security/sarif-types
 * (Source: Issue #1681, #1682 — Proactive Defensive Security)
 */

import { z } from 'zod';

// ============================================================================
// Unified Security Finding Schema
// ============================================================================

/** Severity levels aligned with CVSS and common scanner output. */
export const FindingSeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

/** A normalized security finding from any SARIF-compatible scanner. */
export const SecurityFindingSchema = z.object({
  /** Unique finding ID (scanner-specific rule ID). */
  id: z.string().min(1),
  /** Scanner that produced this finding. */
  scanner: z.string().min(1),
  /** Rule identifier (e.g., 'javascript.lang.security.detect-eval'). */
  rule: z.string().min(1),
  /** Normalized severity. */
  severity: FindingSeveritySchema,
  /** Human-readable description of the finding. */
  message: z.string().min(1).max(2000),
  /** File path where the finding was detected. */
  file: z.string().min(1),
  /** Start line number (1-based). */
  startLine: z.number().int().min(1),
  /** End line number (1-based, optional). */
  endLine: z.number().int().min(1).optional(),
  /** CWE identifiers (e.g., ['CWE-79', 'CWE-89']). */
  cweIds: z.array(z.string()).default([]),
  /** Scanner confidence (0-1). */
  confidence: z.number().min(0).max(1).default(0.5),
  /** Code snippet around the finding (optional). */
  snippet: z.string().max(500).optional(),
  /** Help URL for remediation guidance. */
  helpUrl: z.string().optional(),
});

export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

/** Result of parsing a SARIF file. */
export interface SarifParseResult {
  /** Scanner name extracted from SARIF. */
  readonly scanner: string;
  /** Total findings parsed. */
  readonly totalFindings: number;
  /** Findings sorted by severity (critical first). */
  readonly findings: readonly SecurityFinding[];
  /** Parsing errors (non-fatal). */
  readonly errors: readonly string[];
}

// ============================================================================
// SARIF Input Types (subset of the SARIF 2.1.0 spec we need)
// ============================================================================

/** SARIF result level → our severity mapping. */
export const SARIF_LEVEL_MAP: Readonly<Record<string, FindingSeverity>> = {
  error: 'high',
  warning: 'medium',
  note: 'low',
  none: 'info',
};

/** Severity order for sorting (lower = more severe). */
export const SEVERITY_ORDER: Readonly<Record<FindingSeverity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
