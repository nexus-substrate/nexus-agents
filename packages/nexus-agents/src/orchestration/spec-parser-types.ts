/**
 * Type definitions for the Spec Parser module.
 *
 * Parses markdown specification documents into typed structures
 * that drive autonomous implementation workflows.
 *
 * @module orchestration/spec-parser-types
 * (Source: Issue #847 — Phase 2 of AI Software Factory Epic #843)
 */

import { z } from 'zod';

/**
 * A reference to a GitHub issue or PR extracted from spec text.
 */
export const IssueReferenceSchema = z.object({
  /** Issue/PR number */
  number: z.number().int().positive(),
  /** Raw text (e.g., "#123") */
  raw: z.string(),
});
export type IssueReference = z.infer<typeof IssueReferenceSchema>;

/**
 * A reference to a file path extracted from spec text.
 */
export const FileReferenceSchema = z.object({
  /** File path (e.g., "src/foo.ts") */
  path: z.string(),
  /** Optional line number */
  line: z.number().int().positive().optional(),
});
export type FileReference = z.infer<typeof FileReferenceSchema>;

/**
 * Technology stack inferred or specified for a specification.
 */
export const TechStackSchema = z.object({
  /** Programming language */
  language: z.string().optional(),
  /** Framework or library */
  framework: z.string().optional(),
  /** Package manager */
  packageManager: z.string().optional(),
});
export type TechStack = z.infer<typeof TechStackSchema>;

/**
 * Parsed specification from a markdown document.
 */
export const ParsedSpecSchema = z.object({
  /** Spec title (from first H1 or H2 heading) */
  title: z.string().min(1),
  /** Overview/description text */
  overview: z.string(),
  /** List of requirements */
  requirements: z.array(z.string()),
  /** Acceptance criteria (checklist items) */
  acceptanceCriteria: z.array(z.string()),
  /** Constraints or limitations */
  constraints: z.array(z.string()),
  /** Issue/PR references found in the spec */
  issueReferences: z.array(IssueReferenceSchema),
  /** File path references found in the spec */
  fileReferences: z.array(FileReferenceSchema),
  /** Sections that were missing from the spec */
  missingSections: z.array(z.string()),
  /** Raw markdown source */
  rawMarkdown: z.string(),
  /** Inferred technology stack */
  techStack: TechStackSchema.optional(),
});
export type ParsedSpec = z.infer<typeof ParsedSpecSchema>;

/**
 * Error detail when spec parsing fails.
 */
export interface SpecParseError {
  readonly message: string;
  readonly section?: string | undefined;
}

/**
 * Known section headings that the parser recognizes.
 */
export const KNOWN_SECTIONS = [
  'overview',
  'requirements',
  'acceptance criteria',
  'constraints',
  'goal',
  'description',
  'design',
  'dependencies',
] as const;

export type KnownSection = (typeof KNOWN_SECTIONS)[number];
