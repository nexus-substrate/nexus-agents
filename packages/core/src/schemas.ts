/**
 * Zod validation schemas for core domain types.
 *
 * Uses Zod v4 API — SafeParseReturnType was removed in v4,
 * replaced by the inferred return type of schema.safeParse().
 *
 * (Source: Issue #1729)
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Paper Schema (matches PaperSearchResult port)
// ---------------------------------------------------------------------------
export const PaperSchema = z.object({
  id: z.string(),
  title: z.string(),
  abstract: z.string(),
  authors: z.array(z.string()),
  publishedAt: z.string(),
  url: z.string(),
  citations: z.number().optional(),
});

export type Paper = z.infer<typeof PaperSchema>;

// ---------------------------------------------------------------------------
// Author Schema (matches AuthorArtifact port)
// ---------------------------------------------------------------------------
export const AuthorSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Author = z.infer<typeof AuthorSchema>;

// ---------------------------------------------------------------------------
// Author Aggregate
// ---------------------------------------------------------------------------
export const AuthorAggregateSchema = z.object({
  name: z.string(),
  affiliation: z.string().optional(),
  paperIds: z.array(z.string()),
  paperCount: z.number(),
});

export type AuthorAggregate = z.infer<typeof AuthorAggregateSchema>;

// ---------------------------------------------------------------------------
// Enrichment Candidate
// ---------------------------------------------------------------------------
export const EnrichmentCandidateSchema = z.object({
  name: z.string(),
  affiliation: z.string().optional(),
  paperIds: z.array(z.string()),
});

export type EnrichmentCandidate = z.infer<typeof EnrichmentCandidateSchema>;

// ---------------------------------------------------------------------------
// Enriched Author
// ---------------------------------------------------------------------------
export const EnrichedAuthorSchema = z.object({
  originalName: z.string(),
  affiliation: z.string().optional(),
  paperIds: z.array(z.string()),
  confidenceScore: z.number(),
  evidence: z.array(z.unknown()),
  resolvedIdentity: z
    .object({
      name: z.string(),
      affiliation: z.string().optional(),
      email: z.string().optional(),
      bio: z.string().optional(),
      location: z.string().optional(),
      profiles: z.record(z.string(), z.string()),
    })
    .optional(),
  searchedAt: z.string(),
});

export type EnrichedAuthor = z.infer<typeof EnrichedAuthorSchema>;

// ---------------------------------------------------------------------------
// Stage Checkpoint (matches CheckpointData port)
// ---------------------------------------------------------------------------
export const StageCheckpointSchema = z.object({
  cursor: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type StageCheckpoint = z.infer<typeof StageCheckpointSchema>;

// ---------------------------------------------------------------------------
// Safe-parse wrappers
// Uses Zod v4 inferred return type (not z.SafeParseReturnType which was removed)
// ---------------------------------------------------------------------------
type SafeParseResult<T extends z.ZodType> = ReturnType<T['safeParse']>;

export function safeParsePaper(data: unknown): SafeParseResult<typeof PaperSchema> {
  return PaperSchema.safeParse(data);
}

export function safeParseAuthor(data: unknown): SafeParseResult<typeof AuthorSchema> {
  return AuthorSchema.safeParse(data);
}

export function safeParseAuthorAggregate(
  data: unknown
): SafeParseResult<typeof AuthorAggregateSchema> {
  return AuthorAggregateSchema.safeParse(data);
}

export function safeParseEnrichmentCandidate(
  data: unknown
): SafeParseResult<typeof EnrichmentCandidateSchema> {
  return EnrichmentCandidateSchema.safeParse(data);
}

export function safeParseEnrichedAuthor(
  data: unknown
): SafeParseResult<typeof EnrichedAuthorSchema> {
  return EnrichedAuthorSchema.safeParse(data);
}

export function safeParseStageCheckpoint(
  data: unknown
): SafeParseResult<typeof StageCheckpointSchema> {
  return StageCheckpointSchema.safeParse(data);
}
