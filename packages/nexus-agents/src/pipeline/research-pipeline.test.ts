/**
 * Tests for Research-to-Project Pipeline (#1711)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runResearchPipeline } from './research-pipeline.js';
import type {
  ResearchPipelineStages,
  ResearchTrack,
  TrackFinding,
  ResearchSynthesis,
  ResearchDeliverable,
} from './research-pipeline.js';
import type { VoteResult } from './dev-pipeline.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function makeTrack(id: string, title: string): ResearchTrack {
  return {
    id,
    title,
    description: `Research ${title}`,
    methodology: 'Primary sources',
    outputBudget: 2000,
    sources: ['upstream-repo', 'CVE-DB'],
  };
}

function makeFinding(trackId: string): TrackFinding {
  return {
    trackId,
    summary: `Findings for ${trackId}`,
    evidence: [{ source: 'repo', claim: 'Verified', tier: 'primary' }],
    confidence: 'high',
    gaps: [],
  };
}

function makeSynthesis(recommendation: string): ResearchSynthesis {
  return {
    findings: [makeFinding('track-1')],
    contradictions: [],
    recommendation,
    deliverables: [{ type: 'executive_memo', title: 'Assessment', content: 'Go recommendation' }],
  };
}

function makeApprovedVote(): VoteResult {
  return { kind: 'approved', approvalPercentage: 83 };
}

function makeRejectedVote(feedback: string): VoteResult {
  return { kind: 'rejected', feedback, approvalPercentage: 33 };
}

function makeConditionalVote(): VoteResult {
  return {
    kind: 'conditional_go',
    conditions: ['Must validate reproducible builds'],
    caveats: ['Hardware testing burden is high'],
    approvalPercentage: 67,
  };
}

function makeDeliverable(type: ResearchDeliverable['type']): ResearchDeliverable {
  return { type, title: `${type} deliverable`, content: `Content for ${type}` };
}

function createMockStages(): ResearchPipelineStages {
  return {
    decompose: vi
      .fn<(prompt: string) => Promise<ResearchTrack[]>>()
      .mockResolvedValue([
        makeTrack('track-a', 'Security Analysis'),
        makeTrack('track-b', 'Competitive Landscape'),
      ]),
    investigate: vi
      .fn<(track: ResearchTrack) => Promise<TrackFinding>>()
      .mockImplementation((track) => Promise.resolve(makeFinding(track.id))),
    synthesize: vi
      .fn<
        (
          prompt: string,
          findings: readonly TrackFinding[],
          priorFeedback?: string
        ) => Promise<ResearchSynthesis>
      >()
      .mockResolvedValue(makeSynthesis('Go — credible security gaps found')),
    vote: vi
      .fn<(synthesis: ResearchSynthesis) => Promise<VoteResult>>()
      .mockResolvedValue(makeApprovedVote()),
    scaffold: vi
      .fn<(synthesis: ResearchSynthesis) => Promise<ResearchDeliverable[]>>()
      .mockResolvedValue([makeDeliverable('executive_memo'), makeDeliverable('risk_register')]),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('runResearchPipeline', () => {
  let stages: ResearchPipelineStages;

  beforeEach(() => {
    stages = createMockStages();
  });

  it('runs all 5 phases end-to-end when vote approves', async () => {
    const result = await runResearchPipeline('Investigate Ventoy security', stages);

    expect(result.completed).toBe(true);
    expect(result.tracks).toHaveLength(2);
    expect(result.findings).toHaveLength(2);
    expect(result.synthesis).not.toBeNull();
    expect(result.vote).toEqual(makeApprovedVote());
    expect(result.deliverables).toHaveLength(2);
    expect(result.voteIterations).toBe(1);

    expect(stages.decompose).toHaveBeenCalledOnce();
    expect(stages.investigate).toHaveBeenCalledTimes(2);
    expect(stages.synthesize).toHaveBeenCalledOnce();
    expect(stages.vote).toHaveBeenCalledOnce();
    expect(stages.scaffold).toHaveBeenCalledOnce();
  });

  it('skips scaffold when vote rejects', async () => {
    vi.mocked(stages.vote).mockResolvedValue(makeRejectedVote('Insufficient evidence'));

    const result = await runResearchPipeline('Investigate Ventoy', stages, {
      maxVoteIterations: 1,
    });

    expect(result.completed).toBe(true);
    expect(result.vote).toEqual(makeRejectedVote('Insufficient evidence'));
    expect(result.deliverables).toHaveLength(1); // From synthesis.deliverables
    expect(stages.scaffold).not.toHaveBeenCalled();
  });

  it('iterates synthesize→vote when rejected with feedback', async () => {
    const voteMock = vi.mocked(stages.vote);
    voteMock.mockResolvedValueOnce(makeRejectedVote('Need more CVE data'));
    voteMock.mockResolvedValueOnce(makeApprovedVote());

    const result = await runResearchPipeline('Investigate Ventoy', stages, {
      maxVoteIterations: 3,
    });

    expect(result.voteIterations).toBe(2);
    expect(result.vote).toEqual(makeApprovedVote());
    expect(stages.synthesize).toHaveBeenCalledTimes(2);
    // Second call should include feedback
    expect(vi.mocked(stages.synthesize).mock.calls[1]?.[2]).toBe('Need more CVE data');
  });

  it('respects maxVoteIterations limit', async () => {
    vi.mocked(stages.vote).mockResolvedValue(makeRejectedVote('Always reject'));

    const result = await runResearchPipeline('Investigate Ventoy', stages, {
      maxVoteIterations: 2,
    });

    expect(result.voteIterations).toBe(2);
    expect(stages.synthesize).toHaveBeenCalledTimes(2);
    expect(stages.vote).toHaveBeenCalledTimes(2);
    expect(stages.scaffold).not.toHaveBeenCalled();
  });

  it('stops after vote in dryRun mode', async () => {
    const result = await runResearchPipeline('Investigate Ventoy', stages, {
      dryRun: true,
    });

    expect(result.completed).toBe(false);
    expect(result.tracks).toHaveLength(2);
    expect(result.findings).toHaveLength(2);
    expect(result.vote).toEqual(makeApprovedVote());
    expect(result.deliverables).toHaveLength(0);
    expect(stages.scaffold).not.toHaveBeenCalled();
  });

  it('handles conditional_go vote', async () => {
    vi.mocked(stages.vote).mockResolvedValue(makeConditionalVote());

    const result = await runResearchPipeline('Investigate Ventoy', stages);

    expect(result.completed).toBe(true);
    expect(result.vote?.kind).toBe('conditional_go');
    expect(stages.scaffold).toHaveBeenCalledOnce();
  });

  it('respects maxParallelTracks for wave execution', async () => {
    // 4 tracks, maxParallel=2 → 2 waves
    vi.mocked(stages.decompose).mockResolvedValue([
      makeTrack('a', 'A'),
      makeTrack('b', 'B'),
      makeTrack('c', 'C'),
      makeTrack('d', 'D'),
    ]);

    const callOrder: string[] = [];
    vi.mocked(stages.investigate).mockImplementation((track) => {
      callOrder.push(track.id);
      return Promise.resolve(makeFinding(track.id));
    });

    const result = await runResearchPipeline('Test', stages, {
      maxParallelTracks: 2,
    });

    expect(result.findings).toHaveLength(4);
    // All 4 tracks investigated
    expect(callOrder).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns empty tracks for empty decompose result', async () => {
    vi.mocked(stages.decompose).mockResolvedValue([]);

    const result = await runResearchPipeline('Empty prompt', stages);

    expect(result.tracks).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
    expect(stages.investigate).not.toHaveBeenCalled();
  });

  it('passes prior feedback to synthesize on iteration', async () => {
    vi.mocked(stages.vote)
      .mockResolvedValueOnce(makeRejectedVote('Need more evidence on perf'))
      .mockResolvedValueOnce(makeApprovedVote());

    await runResearchPipeline('Test prompt', stages, { maxVoteIterations: 3 });

    expect(stages.synthesize).toHaveBeenCalledTimes(2);
    const secondCallArgs = vi.mocked(stages.synthesize).mock.calls[1];
    expect(secondCallArgs?.[2]).toBe('Need more evidence on perf');
  });

  it('handles single-track decompose without wave errors', async () => {
    vi.mocked(stages.decompose).mockResolvedValue([makeTrack('only', 'Only Track')]);

    const result = await runResearchPipeline('Test', stages, { maxParallelTracks: 4 });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.trackId).toBe('only');
  });
});

describe('RESEARCH_PIPELINE_PLUGIN registration', () => {
  it('registers into PluginRegistry with valid manifest', async () => {
    const { RESEARCH_PIPELINE_PLUGIN } = await import('./core-plugins.js');
    const { PluginRegistry } = await import('./plugin-registry.js');

    const registry = new PluginRegistry();
    const result = registry.register(RESEARCH_PIPELINE_PLUGIN);

    expect(result.ok).toBe(true);
    expect(RESEARCH_PIPELINE_PLUGIN.manifest.id).toBe('nexus:research-pipeline');
    expect(RESEARCH_PIPELINE_PLUGIN.manifest.stages.length).toBeGreaterThanOrEqual(4);
  });
});
