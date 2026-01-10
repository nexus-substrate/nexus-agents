/**
 * Phase 2: RESEARCH
 *
 * Multi-agent research using model adapter for self-development workflow.
 *
 * @module workflows/self-development/phases/research
 */

import { createLogger } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, AnalyzeOutput, ResearchOutput } from '../types.js';

const logger = createLogger({ component: 'self-dev-phase-research' });

const RESEARCH_SYSTEM_PROMPT = `You are a research agent for a software development workflow.
Analyze the given issue and synthesize relevant context for implementation.
Focus on:
1. Codebase patterns and relevant files
2. Best practices and official documentation
3. Related prior work and potential risks
Provide concise, actionable research findings.`;

/**
 * Build research prompt from issue details.
 */
function buildResearchPrompt(issue: AnalyzeOutput['selectedIssue']): string {
  return `Research context needed for issue #${String(issue.number)}: ${issue.title}

Type: ${issue.type}
Complexity: ${String(issue.complexity)}/5
Keywords: ${issue.keywords.join(', ') || 'none'}

Description:
${issue.body || 'No description provided'}

Provide research findings including:
- Relevant codebase patterns to follow
- Best practices for this type of change
- Potential risks or dependencies
- Recommended approach`;
}

/**
 * Extract list items from a section of text.
 */
function extractListFromSection(text: string, sectionKeyword: string): string[] {
  const items: string[] = [];
  const lines = text.split('\n');
  let inSection = false;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes(sectionKeyword)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (line.startsWith('-') || line.startsWith('*') || /^\d+\./.test(line)) {
        const item = line.replace(/^[-*\d.]+\s*/, '').trim();
        if (item.length > 0) items.push(item);
      } else if (line.trim() === '' || /^#/.test(line)) {
        inSection = false;
      }
    }
  }
  return items.slice(0, 10);
}

/**
 * Parse structured research from model response.
 */
function parseResearchResponse(
  response: string
): Omit<ResearchOutput, 'synthesizedContext' | 'durationMs'> {
  const codebase: ResearchOutput['codebase'] = {
    relevantFiles: extractListFromSection(response, 'files'),
    existingPatterns: extractListFromSection(response, 'patterns'),
    interfaces: [],
    testPatterns: extractListFromSection(response, 'test'),
  };

  return {
    codebase,
    academic: { papers: [] },
    docs: {
      officialDocs: extractListFromSection(response, 'documentation'),
      bestPractices: extractListFromSection(response, 'best practices'),
      relatedGuides: [],
    },
    history: {
      relatedIssues: [],
      relatedPRs: [],
      previousAttempts: [],
      relevantCommits: [],
    },
  };
}

/**
 * Create placeholder research output.
 */
function createPlaceholderResearchOutput(startTime: number): ResearchOutput {
  return {
    codebase: { relevantFiles: [], existingPatterns: [], interfaces: [], testPatterns: [] },
    academic: { papers: [] },
    docs: { officialDocs: [], bestPractices: [], relatedGuides: [] },
    history: { relatedIssues: [], relatedPRs: [], previousAttempts: [], relevantCommits: [] },
    synthesizedContext: 'Research could not be completed - using fallback',
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute RESEARCH phase - Multi-agent research using model adapter.
 */
export async function executeResearch(
  deps: SelfDevWorkflowDependencies,
  _state: SelfDevWorkflowState,
  analyze: AnalyzeOutput
): Promise<ResearchOutput> {
  const startTime = Date.now();
  const issue = analyze.selectedIssue;

  logger.info('RESEARCH phase: Synthesizing research context', { issue: issue.number });

  const researchPrompt = buildResearchPrompt(issue);
  const response = await deps.modelAdapter.complete({
    messages: [{ role: 'user', content: researchPrompt }],
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    maxTokens: 2000,
  });

  if (!response.ok) {
    logger.warn('RESEARCH phase: Model call failed', { error: response.error.message });
    return createPlaceholderResearchOutput(startTime);
  }

  const content = response.value.content[0];
  const synthesizedContext = content?.type === 'text' ? content.text : '';
  const parsed = parseResearchResponse(synthesizedContext);

  logger.info('RESEARCH phase: Complete', {
    contextLength: synthesizedContext.length,
    durationMs: Date.now() - startTime,
  });

  return {
    codebase: parsed.codebase,
    academic: parsed.academic,
    docs: parsed.docs,
    history: parsed.history,
    synthesizedContext,
    durationMs: Date.now() - startTime,
  };
}
