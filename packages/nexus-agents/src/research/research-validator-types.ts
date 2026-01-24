/**
 * nexus-agents/research - Research Validator Types
 *
 * Type definitions and constants for the research registry validator.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 * @see docs/research/RESEARCH_INDEX.md
 */

import type { PapersRegistry, TechniquesRegistry, ValidationSeverity } from './research-schemas.js';

// ============================================================================
// Validator Options
// ============================================================================

/**
 * Options for the validator.
 */
export interface ValidatorOptions {
  /** Project root path for file existence checks */
  readonly projectRoot: string;
  /** Check if integration files exist */
  readonly checkFileExistence: boolean;
  /** Treat warnings as errors */
  readonly strict: boolean;
}

/**
 * Default validator options.
 */
export const DEFAULT_VALIDATOR_OPTIONS: ValidatorOptions = {
  projectRoot: process.cwd(),
  checkFileExistence: true,
  strict: false,
};

// ============================================================================
// Parsed Registry
// ============================================================================

/**
 * Parsed registry data for validation.
 */
export interface ParsedRegistry {
  readonly papers: PapersRegistry;
  readonly techniques: TechniquesRegistry;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Options for creating a validation issue.
 */
export interface CreateIssueOptions {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly file: string;
  readonly issuePath?: string;
  readonly suggestion?: string;
}
