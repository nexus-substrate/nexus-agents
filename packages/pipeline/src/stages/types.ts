/**
 * Stage-specific type definitions.
 *
 * Re-exports shared types and defines stage-level interfaces.
 *
 * (Source: Issue #1730)
 */
export type {
  Stage,
  StageName,
  StageResult,
  StageContext,
  Checkpoint,
  NormalizedPaper,
} from '../types.js';

export interface CompileInput {
  papers: import('../types.js').NormalizedPaper[];
  enrichedAuthors: EnrichedAuthorSummary[];
  outputDir?: string;
}

export interface EnrichedAuthorSummary {
  originalName: string;
  affiliation?: string;
  paperIds: string[];
  confidenceScore: number;
  resolvedIdentity?: {
    name: string;
    profiles: Record<string, string>;
  };
}

export interface CompiledAuthor {
  name: string;
  affiliation?: string | undefined;
  paperCount: number;
  papers: { id: string; title: string; url: string; publishedAt: string }[];
  confidenceScore: number;
  resolvedProfiles: Record<string, string>;
  compiledAt: string;
}

export interface CompileMetrics {
  authorsCompiled: number;
  papersCompiled: number;
  outputFiles: number;
}

export interface CompileOutput {
  compiledAuthors: CompiledAuthor[];
  metrics: CompileMetrics;
}
