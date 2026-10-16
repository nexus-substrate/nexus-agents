/**
 * Unified Quality Assessor interface and implementations.
 * @module research/quality-assessor
 */

import type { ResearchPaper } from './research-schemas.js';
import type { ResearchSource } from '../indexer/research-index/research-index-base-types.js';
import type { PapersRegistry, PaperEntry } from '../cli/research-types.js';
import { computeQualityScore, computeEvidenceTier } from './research-quality.js';
import { computeSourceQualityScore, computeSourceEvidenceTier } from './source-quality.js';

export interface QualityAssessmentResult {
  qualityScore: number;
  evidenceTier: 'high' | 'medium' | 'low';
}

export interface QualityAssessor<T> {
  assess(target: T): QualityAssessmentResult;
}

export class PaperQualityAssessor implements QualityAssessor<ResearchPaper> {
  assess(target: ResearchPaper): QualityAssessmentResult {
    const qualityScore = target.quality_score ?? computeQualityScore(target);
    const evidenceTier = target.evidence_tier ?? computeEvidenceTier(target);
    return { qualityScore, evidenceTier };
  }
}

export class SourceQualityAssessor implements QualityAssessor<ResearchSource> {
  assess(target: ResearchSource): QualityAssessmentResult {
    const qualityScore = target.quality_score ?? computeSourceQualityScore(target);
    const evidenceTier = target.evidence_tier ?? computeSourceEvidenceTier(target);
    return { qualityScore, evidenceTier };
  }
}

export const paperQualityAssessor: QualityAssessor<ResearchPaper> = new PaperQualityAssessor();
export const sourceQualityAssessor: QualityAssessor<ResearchSource> = new SourceQualityAssessor();

/**
 * Backfill missing quality scores and evidence tiers on papers registry.
 */
export function backfillPaperQualities(registry: PapersRegistry): {
  registry: PapersRegistry;
  modifiedCount: number;
} {
  let modifiedCount = 0;
  const updatedPapers: Record<string, PaperEntry> = {};

  for (const [id, paper] of Object.entries(registry.papers)) {
    if (paper.quality_score === undefined || paper.evidence_tier === undefined) {
      modifiedCount++;
      const qualityScore =
        paper.quality_score ?? computeQualityScore(paper as unknown as ResearchPaper);
      const evidenceTier =
        paper.evidence_tier ?? computeEvidenceTier(paper as unknown as ResearchPaper);
      updatedPapers[id] = {
        ...paper,
        quality_score: qualityScore,
        evidence_tier: evidenceTier,
      };
    } else {
      updatedPapers[id] = paper;
    }
  }

  return {
    registry: {
      ...registry,
      papers: updatedPapers,
    },
    modifiedCount,
  };
}
