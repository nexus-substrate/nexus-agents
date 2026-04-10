/**
 * Compile stage — transforms enriched data into final compiled output.
 *
 * Follows the same Stage interface pattern as SourcingStage/DedupStage/EnrichStage.
 *
 * (Source: Issue #1730)
 */
import type {
  Stage,
  StageName,
  StageResult,
  StageContext,
  Checkpoint,
  NormalizedPaper,
} from './types.js';
import type {
  EnrichedAuthorSummary,
  CompiledAuthor,
  CompileOutput,
  CompileMetrics,
} from './types.js';

export class CompileStage implements Stage {
  readonly name: StageName = 'compile';
  readonly description = 'Compile enriched data into final output';

  execute(ctx: StageContext): Promise<StageResult> {
    const prevCheckpoint = ctx.previousCheckpoint;

    if (ctx.dryRun === true) {
      return Promise.resolve({
        ok: true as const,
        stage: this.name,
        data: { compiledAuthors: [], metrics: this.emptyMetrics() },
      });
    }

    const authors =
      (prevCheckpoint?.data['enrichedAuthors'] as EnrichedAuthorSummary[] | undefined) ?? [];
    const papers = (prevCheckpoint?.data['papers'] as NormalizedPaper[] | undefined) ?? [];

    const output = this.compile(authors, papers);

    const checkpoint: Checkpoint = {
      stage: this.name,
      completedAt: new Date().toISOString(),
      data: {
        compiledAuthors: output.compiledAuthors,
        metrics: output.metrics,
      },
    };

    return Promise.resolve({
      ok: true as const,
      stage: this.name,
      data: output,
      checkpoint,
    });
  }

  private compile(authors: EnrichedAuthorSummary[], papers: NormalizedPaper[]): CompileOutput {
    const paperMap = new Map<string, NormalizedPaper>();
    for (const paper of papers) {
      paperMap.set(paper.id, paper);
    }

    const compiledAuthors: CompiledAuthor[] = authors.map((author) => {
      const authorPapers = author.paperIds
        .map((id) => paperMap.get(id))
        .filter((p): p is NormalizedPaper => p !== undefined)
        .map((p) => ({
          id: p.id,
          title: p.title,
          url: p.url,
          publishedAt: p.publishedAt,
        }));

      return {
        name: author.originalName,
        affiliation: author.affiliation,
        paperCount: authorPapers.length,
        papers: authorPapers,
        confidenceScore: author.confidenceScore,
        resolvedProfiles: author.resolvedIdentity?.profiles ?? {},
        compiledAt: new Date().toISOString(),
      };
    });

    return {
      compiledAuthors,
      metrics: {
        authorsCompiled: compiledAuthors.length,
        papersCompiled: papers.length,
        outputFiles: 1,
      },
    };
  }

  private emptyMetrics(): CompileMetrics {
    return { authorsCompiled: 0, papersCompiled: 0, outputFiles: 0 };
  }
}
