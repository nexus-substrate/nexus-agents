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

/**
 * Canonical 5-value finding-severity vocabulary (CVSS-aligned), most→least
 * severe. THE single source of truth — every 5-value finding-severity zod enum
 * (severity-consensus, finding-triage, agents/output-schemas, expert-types
 * VulnerabilitySeverity) and both SEVERITY_ORDER maps derive from this (#3570).
 * Tuple order is authoritative: SEVERITY_ORDER below maps it to ascending ranks.
 */
export const FINDING_SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'] as const;

/** Severity levels aligned with CVSS and common scanner output. */
export const FindingSeveritySchema = z.enum(FINDING_SEVERITY_LEVELS);
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

/**
 * Severity order for sorting (lower = more severe). Derived from the canonical
 * tuple so it can never drift from {@link FINDING_SEVERITY_LEVELS} (#3570).
 */
export const SEVERITY_ORDER: Readonly<Record<FindingSeverity, number>> = Object.fromEntries(
  FINDING_SEVERITY_LEVELS.map((level, index) => [level, index])
) as Record<FindingSeverity, number>;
