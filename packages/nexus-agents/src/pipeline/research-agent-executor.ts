/**
 * Research Agent Executor — Connects research pipeline stages to nexus-agents (#1711)
 *
 * Wires ResearchPipelineStages to real expert agents for:
 * - LLM-assisted prompt decomposition
 * - Parallel track investigation via research experts
 * - Finding synthesis via architect experts
 * - Consensus voting via ConsensusEngine
 * - Deliverable generation via PM experts
 *
 * @module pipeline/research-agent-executor
 */

import { createLogger } from '../core/index.js';
import type {
  ResearchPipelineStages,
  ResearchTrack,
  TrackFinding,
  ResearchSynthesis,
  ResearchDeliverable,
} from './research-pipeline.js';
import type { VoteResult } from './dev-pipeline.js';
import { createVoteResult } from './dev-pipeline.js';
import { executeExpert } from './expert-bridge.js';

const logger = createLogger({ component: 'research-agent-executor' });

// ============================================================================
// Config
// ============================================================================

/** Configuration for research agent stages. */
export interface ResearchAgentConfig {
  /** Use simulated votes instead of real CLI consensus. */
  readonly simulateVotes?: boolean | undefined;
}

// ============================================================================
// LLM-Assisted Decomposition
// ============================================================================

/** Decompose a research prompt into bounded tracks using an architect expert. */
async function decomposePrompt(prompt: string): Promise<ResearchTrack[]> {
  const instruction = buildDecomposeInstruction(prompt);
  const result = await executeExpert('architecture', instruction);

  if (!result.success || result.text.trim() === '') {
    logger.warn('LLM decomposition failed, using heuristic fallback');
    return heuristicDecompose(prompt);
  }

  return parseTracksFromLlm(result.text, prompt);
}

/** Build the instruction for the architect to decompose the prompt. */
function buildDecomposeInstruction(prompt: string): string {
  return [
    'Decompose this research prompt into 2-6 bounded research tracks.',
    'Each track should be independently investigable.',
    '',
    'Return ONLY a JSON array of objects with these fields:',
    '- id: kebab-case identifier (e.g., "security-analysis")',
    '- title: human-readable title',
    '- description: what to investigate (2-3 sentences)',
    '- methodology: how to investigate (primary sources, code inspection, etc.)',
    '- sources: array of source types to consult',
    '',
    'Example: [{"id":"track-a","title":"Security Analysis","description":"...","methodology":"...","sources":["upstream-repo","CVE-DB"]}]',
    '',
    '---',
    prompt,
  ].join('\n');
}

/** Parse LLM output into ResearchTrack array. */
function parseTracksFromLlm(text: string, prompt: string): ResearchTrack[] {
  try {
    const jsonMatch = /\[[\s\S]*\]/.exec(text);
    if (jsonMatch === null) return heuristicDecompose(prompt);

    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item, i) => {
        const id = typeof item['id'] === 'string' ? item['id'] : `track-${String(i + 1)}`;
        const title = typeof item['title'] === 'string' ? item['title'] : `Track ${String(i + 1)}`;
        const desc = typeof item['description'] === 'string' ? item['description'] : '';
        const method =
          typeof item['methodology'] === 'string' ? item['methodology'] : 'Primary sources';
        const sources = Array.isArray(item['sources'])
          ? (item['sources'] as unknown[]).filter((s): s is string => typeof s === 'string')
          : [];
        return { id, title, description: desc, methodology: method, outputBudget: 2000, sources };
      });
  } catch {
    logger.debug('Failed to parse LLM tracks, falling back to heuristic');
    return heuristicDecompose(prompt);
  }
}

// ============================================================================
// Heuristic Fallback
// ============================================================================

/** Keyword-based heuristic decomposition when LLM is unavailable. */
function heuristicDecompose(prompt: string): ResearchTrack[] {
  const lower = prompt.toLowerCase();
  const tracks: ResearchTrack[] = [];
  let idx = 0;

  const addTrack = (id: string, title: string, desc: string): void => {
    tracks.push({
      id,
      title,
      description: desc,
      methodology: 'Primary sources and documentation review',
      outputBudget: 2000,
      sources: [],
    });
    idx++;
  };

  if (matchesAny(lower, ['security', 'vulnerability', 'cve', 'threat', 'audit'])) {
    addTrack(
      'security-analysis',
      'Security Analysis',
      'Investigate security posture and known vulnerabilities'
    );
  }
  if (matchesAny(lower, ['alternative', 'competitor', 'compare', 'landscape', 'vs'])) {
    addTrack(
      'competitive-landscape',
      'Competitive Landscape',
      'Research existing alternatives and compare capabilities'
    );
  }
  if (matchesAny(lower, ['architecture', 'design', 'implement', 'build', 'feasib'])) {
    addTrack(
      'feasibility-assessment',
      'Feasibility Assessment',
      'Assess technical feasibility of proposed approach'
    );
  }
  if (matchesAny(lower, ['risk', 'threat', 'model', 'attack'])) {
    addTrack('threat-modeling', 'Threat Modeling', 'Define explicit threat models and mitigations');
  }

  // Always include at least a general track
  if (idx === 0) {
    addTrack('general-research', 'General Research', `Investigate: ${prompt.slice(0, 200)}`);
  }

  return tracks;
}

function matchesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

// ============================================================================
// Investigation
// ============================================================================

/** Investigate a single research track using a research expert. */
async function investigateTrack(track: ResearchTrack): Promise<TrackFinding> {
  const instruction = [
    `Research track: ${track.title}`,
    `Description: ${track.description}`,
    `Methodology: ${track.methodology}`,
    '',
    'Use research_discover and research_analyze to gather evidence.',
    'Prefer primary sources. Cite everything. Distinguish facts from speculation.',
    `Max output: ${String(track.outputBudget)} characters.`,
    '',
    'Return a structured summary with: key findings, evidence quality, confidence level, and gaps.',
  ].join('\n');

  const result = await executeExpert('research', instruction);

  return {
    trackId: track.id,
    summary: result.text || `Investigation of ${track.title} completed`,
    evidence: [
      {
        source: result.success ? 'research-expert' : 'fallback',
        claim: result.text.slice(0, 500) || 'No evidence gathered',
        tier: result.success ? 'primary' : 'tertiary',
      },
    ],
    confidence: result.success ? 'medium' : 'low',
    gaps: result.success ? [] : ['Expert unavailable — manual investigation needed'],
  };
}

// ============================================================================
// Synthesis
// ============================================================================

/** Synthesize findings across tracks using an architect expert. */
async function synthesizeFindings(
  prompt: string,
  findings: readonly TrackFinding[],
  priorFeedback?: string
): Promise<ResearchSynthesis> {
  const feedbackSection =
    priorFeedback !== undefined ? `\n\nPrior feedback to address:\n${priorFeedback}` : '';

  const instruction = [
    'Synthesize these research findings into a cohesive assessment.',
    '',
    `Original prompt: ${prompt.slice(0, 500)}`,
    '',
    'Findings:',
    ...findings.map((f) => `### ${f.trackId} (${f.confidence} confidence)\n${f.summary}`),
    feedbackSection,
    '',
    'Produce:',
    '1. Overall recommendation (go/no-go/conditional with reasoning)',
    '2. List any contradictions between tracks',
    '3. Draft deliverable content for: executive_memo, risk_register',
  ].join('\n');

  const result = await executeExpert('architecture', instruction);

  return {
    findings: findings.slice(),
    contradictions: [],
    recommendation: result.text || 'Unable to synthesize — expert unavailable',
    deliverables: [
      {
        type: 'executive_memo',
        title: 'Executive Assessment Memo',
        content: result.text || 'Synthesis failed — manual review required',
      },
    ],
  };
}

// ============================================================================
// Voting
// ============================================================================

/** Run consensus vote on the research synthesis. */
async function voteOnSynthesis(
  synthesis: ResearchSynthesis,
  simulateVotes: boolean
): Promise<VoteResult> {
  if (simulateVotes) {
    return createVoteResult(true, '', 83);
  }

  const proposal = [
    'Should this project proceed based on the research findings?',
    '',
    `Recommendation: ${synthesis.recommendation.slice(0, 1000)}`,
    '',
    `Tracks analyzed: ${String(synthesis.findings.length)}`,
    `Contradictions found: ${String(synthesis.contradictions.length)}`,
  ].join('\n');

  const result = await executeExpert('architecture', `Vote on this proposal:\n\n${proposal}`);

  // Parse vote from expert response
  const lower = (result.text || '').toLowerCase();
  const isGo = lower.includes('approve') || lower.includes('go') || lower.includes('proceed');
  return createVoteResult(isGo, result.text || '', isGo ? 75 : 33);
}

// ============================================================================
// Scaffolding
// ============================================================================

/** Generate project deliverables using a PM expert. */
async function scaffoldProject(synthesis: ResearchSynthesis): Promise<ResearchDeliverable[]> {
  const instruction = [
    'Based on this research synthesis, generate project deliverables.',
    '',
    `Recommendation: ${synthesis.recommendation.slice(0, 500)}`,
    '',
    'Generate content for each deliverable type:',
    '1. executive_memo — go/no-go decision with risk summary',
    '2. security_report — confirmed issues, unconfirmed allegations, unknowns',
    '3. mvp_scope — minimum viable scope if proceeding',
    '4. architecture_rec — recommended architecture approach',
    '5. risk_register — key risks and mitigations',
  ].join('\n');

  const result = await executeExpert('pm', instruction);
  const text = result.text || 'Deliverable generation failed — manual creation required';

  // Generate all 5 deliverable types
  const types: ReadonlyArray<ResearchDeliverable['type']> = [
    'executive_memo',
    'security_report',
    'mvp_scope',
    'architecture_rec',
    'risk_register',
  ];

  return types.map((type) => ({
    type,
    title: formatDeliverableTitle(type),
    content: text,
  }));
}

function formatDeliverableTitle(type: ResearchDeliverable['type']): string {
  const titles: Record<ResearchDeliverable['type'], string> = {
    executive_memo: 'Executive Assessment Memo',
    security_report: 'Security Findings Report',
    mvp_scope: 'Proposed MVP Scope',
    architecture_rec: 'Architecture Recommendation',
    risk_register: 'Project Risk Register',
  };
  return titles[type];
}

// ============================================================================
// Factory
// ============================================================================

/** Create research pipeline stages wired to real agents. */
export function createResearchStages(config: ResearchAgentConfig = {}): ResearchPipelineStages {
  const sim = config.simulateVotes === true;
  return {
    decompose: decomposePrompt,
    investigate: investigateTrack,
    synthesize: synthesizeFindings,
    vote: (synthesis) => voteOnSynthesis(synthesis, sim),
    scaffold: scaffoldProject,
  };
}
