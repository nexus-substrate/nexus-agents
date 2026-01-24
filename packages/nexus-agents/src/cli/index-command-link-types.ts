/**
 * nexus-agents/cli - Link Validator Types
 *
 * Type definitions for link validation.
 *
 * @module cli/index-command-link-types
 * (Source: Issue #396)
 */

/** Categories of links that can be validated. */
export type LinkType = 'internal' | 'external' | 'anchor';

/** Result of validating a single link. */
export interface LinkResult {
  readonly url: string;
  readonly type: LinkType;
  readonly valid: boolean;
  readonly error?: string;
}

/** A link found in a markdown file. */
export interface FoundLink {
  readonly url: string;
  readonly type: LinkType;
  readonly line: number;
  readonly column: number;
  readonly text: string;
}

/** Result of validating all links in a file. */
export interface FileValidationResult {
  readonly filePath: string;
  readonly links: readonly FoundLink[];
  readonly brokenLinks: readonly BrokenLink[];
}

/** A broken link with error details. */
export interface BrokenLink {
  readonly url: string;
  readonly type: LinkType;
  readonly line: number;
  readonly column: number;
  readonly text: string;
  readonly error: string;
}

/** Summary of link validation results. */
export interface LinkValidationSummary {
  readonly totalFiles: number;
  readonly totalLinks: number;
  readonly brokenLinks: number;
  readonly byType: {
    readonly internal: { readonly total: number; readonly broken: number };
    readonly external: { readonly total: number; readonly broken: number };
    readonly anchor: { readonly total: number; readonly broken: number };
  };
}

/** Complete link validation result. */
export interface LinkValidationResult {
  readonly files: readonly FileValidationResult[];
  readonly summary: LinkValidationSummary;
}
