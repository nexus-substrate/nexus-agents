/**
 * Research-to-Project Pipeline (#1711)
 *
 * Orchestrates external research and greenfield project feasibility studies:
 *
 *   1. DECOMPOSE — break prompt into bounded research tracks
 *   2. INVESTIGATE — parallel research agents per track
 *   3. SYNTHESIZE — merge findings, identify contradictions
 *   4. VOTE — go/no-go/conditional consensus decision
 *   5. SCAFFOLD — (if go) generate deliverables and project skeleton
 *
 * Unlike dev-pipeline (self-improvement), this pipeline produces
 * external-facing research deliverables and project scaffolds.
 *
 * @module pipeline/research-pipeline
 */

import { createLogger } from '../core/index.js';
import {
  saveStageCheckpoint,
  loadCheckpointState,
  cleanupCheckpoint,
} from './pipeline-checkpoint.js';
import type { PipelineCheckpointState } from './pipeline-checkpoint.js';
import type { VoteResult } from './dev-pipeline.js';
import { isApproved, getVoteFeedback } from './dev-pipeline.js';

const logger = createLogger({ component: 'research-pipeline' });

// ============================================================================
// Types
// ============================================================================

/** A bounded research track extracted from the user's prompt. */
export interface ResearchTrack {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly methodology: string;
  readonly outputBudget: number;
  readonly sources: readonly string[];
}

/** Result of investigating a single research track. */
export interface TrackFinding {
  readonly trackId: string;
  readonly summary: string;
  readonly evidence: readonly EvidenceItem[];
  readonly confidence: 'high' | 'medium' | 'low';
  readonly gaps: readonly string[];
}

/** A single piece of evidence cited in findings. */
export interface EvidenceItem {
  readonly source: string;
  readonly claim: string;
  readonly tier: 'primary' | 'secondary' | 'tertiary';
}

/** Synthesized research output across all tracks. */
export interface ResearchSynthesis {
  readonly findings: readonly TrackFinding[];
  readonly contradictions: readonly string[];
  readonly recommendation: string;
  readonly deliverables: readonly ResearchDeliverable[];
}

/** A structured deliverable produced by the pipeline. */
export interface ResearchDeliverable {
  readonly type:
    | 'executive_memo'
    | 'security_report'
    | 'mvp_scope'
    | 'architecture_rec'
    | 'risk_register';
  readonly title: string;
  readonly content: string;
}

/** Overall pipeline result. */
export interface ResearchPipelineResult {
  readonly completed: boolean;
  readonly tracks: readonly ResearchTrack[];
  readonly findings: readonly TrackFinding[];
  readonly synthesis: ResearchSynthesis | null;
  readonly vote: VoteResult | null;
  readonly deliverables: readonly ResearchDeliverable[];
  readonly voteIterations: number;
}

// ============================================================================
// Pipeline Stage Interfaces
// ============================================================================

/** Pluggable stage implementations — inject real or mock agents. */
export interface ResearchPipelineStages {
  /** Decompose prompt into bounded research tracks. */
  decompose(prompt: string): Promise<ResearchTrack[]>;
  /** Investigate a single research track. */
  investigate(track: ResearchTrack): Promise<TrackFinding>;
  /** Synthesize findings across all tracks. */
  synthesize(
    prompt: string,
    findings: readonly TrackFinding[],
    priorFeedback?: string
  ): Promise<ResearchSynthesis>;
  /** Consensus vote on whether to proceed. */
  vote(synthesis: ResearchSynthesis): Promise<VoteResult>;
  /** Generate project scaffold if go decision. */
  scaffold(synthesis: ResearchSynthesis): Promise<ResearchDeliverable[]>;
}

// ============================================================================
// Options
// ============================================================================

/** Options for research pipeline execution. */
export interface ResearchPipelineOptions {
  /** Session ID for checkpoint/resume. Omit for no persistence. */
  readonly sessionId?: string | undefined;
  /** When true, stop after vote and return partial result. */
  readonly dryRun?: boolean | undefined;
  /** Max vote→synthesize iterations (default: 3). */
  readonly maxVoteIterations?: number | undefined;
  /** Max parallel investigation tracks (default: 4). */
  readonly maxParallelTracks?: number | undefined;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_VOTE_ITERATIONS = 3;
const DEFAULT_MAX_PARALLEL_TRACKS = 4;

// ============================================================================
// Pipeline Execution
// ============================================================================

/**
 * Execute the research-to-project pipeline.
 *
 * When `sessionId` is provided, each stage checkpoints to disk. On crash,
 * re-running with the same sessionId resumes from the last completed stage.
 */
export async function runResearchPipeline(
  prompt: string,
  stages: ResearchPipelineStages,
  options?: ResearchPipelineOptions
): Promise<ResearchPipelineResult> {
  const sid = options?.sessionId;
  const maxVoteIter = options?.maxVoteIterations ?? DEFAULT_MAX_VOTE_ITERATIONS;
  const maxParallel = options?.maxParallelTracks ?? DEFAULT_MAX_PARALLEL_TRACKS;
  const prior = sid !== undefined ? loadCheckpointState(sid) : null;

  // Phase 1: Decompose
  const tracks = await runOrResumeDecompose(prior, prompt, stages, sid);

  // Phase 2: Investigate (parallel, bounded concurrency)
  const findings = await runOrResumeInvestigate(prior, tracks, stages, sid, maxParallel);

  // Phase 3-4: Synthesize + Vote loop
  const { synthesis, vote, iterations } = await runSynthesizeVoteLoop(
    prompt,
    findings,
    stages,
    sid,
    maxVoteIter
  );

  // Dry run: stop after vote
  if (options?.dryRun === true) {
    logger.info('Dry run — stopping after vote');
    return buildResult({
      completed: false,
      tracks,
      findings,
      synthesis,
      vote,
      deliverables: [],
      voteIterations: iterations,
    });
  }

  // Phase 5: Scaffold (only if approved)
  const deliverables = await runScaffold(synthesis, vote, stages, sid);

  if (sid !== undefined) cleanupCheckpoint(sid);

  return buildResult({
    completed: true,
    tracks,
    findings,
    synthesis,
    vote,
    deliverables,
    voteIterations: iterations,
  });
}

// ============================================================================
// Phase Helpers
// ============================================================================

/** Decompose prompt into tracks, or resume from checkpoint. */
async function runOrResumeDecompose(
  prior: PipelineCheckpointState | null,
  prompt: string,
  stages: ResearchPipelineStages,
  sid: string | undefined
): Promise<ResearchTrack[]> {
  // Resume: if we already have tasks from a prior decompose, skip
  if (prior?.tasks !== undefined && prior.tasks.length > 0) {
    logger.info('Resuming from checkpoint — decompose already complete');
    return prior.tasks.map(taskToTrack);
  }

  logger.info('Phase 1: Decomposing prompt into research tracks');
  const tracks = await stages.decompose(prompt);
  if (sid !== undefined) {
    saveStageCheckpoint(sid, 'research', { type: 'research', text: JSON.stringify(tracks) });
  }
  return tracks;
}

/** Convert a PipelineTask to a ResearchTrack (for checkpoint resume). */
function taskToTrack(task: { id: string; title: string; description: string }): ResearchTrack {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    methodology: 'Resumed from checkpoint',
    outputBudget: 2000,
    sources: [],
  };
}

/** Investigate tracks in parallel with bounded concurrency. */
async function runOrResumeInvestigate(
  prior: PipelineCheckpointState | null,
  tracks: readonly ResearchTrack[],
  stages: ResearchPipelineStages,
  sid: string | undefined,
  maxParallel: number
): Promise<TrackFinding[]> {
  // Resume: if plan text contains findings JSON
  if (prior?.plan !== undefined) {
    try {
      return JSON.parse(prior.plan) as TrackFinding[];
    } catch {
      // Fall through to re-investigate
    }
  }

  logger.info('Phase 2: Investigating tracks', { count: tracks.length, maxParallel });
  const findings: TrackFinding[] = [];

  // Process in waves of maxParallel
  for (let i = 0; i < tracks.length; i += maxParallel) {
    const wave = tracks.slice(i, i + maxParallel);
    const results = await Promise.all(wave.map((track) => stages.investigate(track)));
    findings.push(...results);
  }

  if (sid !== undefined) {
    saveStageCheckpoint(sid, 'plan', {
      type: 'plan',
      text: JSON.stringify(findings),
      iterations: 0,
    });
  }
  return findings;
}

/** Synthesize + Vote loop with feedback iteration. */
async function runSynthesizeVoteLoop(
  prompt: string,
  findings: readonly TrackFinding[],
  stages: ResearchPipelineStages,
  sid: string | undefined,
  maxIterations: number
): Promise<{ synthesis: ResearchSynthesis; vote: VoteResult; iterations: number }> {
  let feedback: string | undefined;
  let synthesis: ResearchSynthesis | undefined;
  let vote: VoteResult | undefined;

  for (let i = 0; i < maxIterations; i++) {
    logger.info('Phase 3: Synthesizing findings', { iteration: i + 1, maxIterations });
    synthesis = await stages.synthesize(prompt, findings, feedback);

    logger.info('Phase 4: Voting on synthesis');
    vote = await stages.vote(synthesis);

    if (sid !== undefined) {
      saveStageCheckpoint(sid, 'vote', {
        type: 'vote',
        approved: isApproved(vote),
        conditional: vote.kind === 'conditional_go',
        iterations: i + 1,
      });
    }

    if (isApproved(vote)) {
      return { synthesis, vote, iterations: i + 1 };
    }

    feedback = getVoteFeedback(vote);
    logger.info('Vote rejected, iterating', { iteration: i + 1, feedback });
  }

  // Exhausted iterations — return last state
  return {
    synthesis: synthesis as ResearchSynthesis,
    vote: vote as VoteResult,
    iterations: maxIterations,
  };
}

/** Generate scaffold deliverables if vote approved. */
async function runScaffold(
  synthesis: ResearchSynthesis,
  vote: VoteResult,
  stages: ResearchPipelineStages,
  sid: string | undefined
): Promise<ResearchDeliverable[]> {
  if (!isApproved(vote)) {
    logger.info('Vote not approved — skipping scaffold');
    return synthesis.deliverables.slice();
  }

  logger.info('Phase 5: Scaffolding project');
  const deliverables = await stages.scaffold(synthesis);

  if (sid !== undefined) {
    saveStageCheckpoint(sid, 'implement', {
      type: 'implement',
      tasks: deliverables.map((d, i) => ({
        id: `deliverable-${String(i)}`,
        title: d.title,
        description: d.type,
        assignedTo: 'researcher' as const,
        status: 'done' as const,
      })),
    });
  }
  return deliverables;
}

// ============================================================================
// Result Builder
// ============================================================================

interface BuildResultInput {
  readonly completed: boolean;
  readonly tracks: readonly ResearchTrack[];
  readonly findings: readonly TrackFinding[];
  readonly synthesis: ResearchSynthesis | null;
  readonly vote: VoteResult | null;
  readonly deliverables: readonly ResearchDeliverable[];
  readonly voteIterations: number;
}

function buildResult(input: BuildResultInput): ResearchPipelineResult {
  return input;
}
