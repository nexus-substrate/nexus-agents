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
 * Generate heuristic best practices based on issue type.
 */
function getHeuristicBestPractices(issueType: string): string[] {
  const practices: Record<string, string[]> = {
    bug: [
      'Write a failing test first that reproduces the bug',
      'Use git bisect to identify when the bug was introduced',
      'Check for similar bugs in related code paths',
      'Document the root cause in the fix commit message',
    ],
    security: [
      'Follow OWASP security guidelines',
      'Validate all inputs at system boundaries',
      'Use parameterized queries for database operations',
      'Sanitize outputs to prevent injection attacks',
      'Add security-focused tests for the fix',
    ],
    enhancement: [
      'Follow existing code patterns and conventions',
      'Add comprehensive tests for new functionality',
      'Update documentation for public API changes',
      'Consider backward compatibility implications',
    ],
    'tech-debt': [
      'Document current behavior before refactoring',
      'Make small, incremental changes',
      'Ensure test coverage before refactoring',
      'Preserve external API contracts',
    ],
    architecture: [
      'Document the architectural decision (ADR)',
      'Consider migration path for existing code',
      'Identify all affected components',
      'Plan for rollback if needed',
    ],
  };

  return practices[issueType] ?? practices['enhancement'] ?? [];
}

/**
 * Generate common patterns based on issue keywords.
 */
function getPatternsByKeywords(keywords: readonly string[]): string[] {
  const patterns: string[] = [];

  if (keywords.includes('api')) patterns.push('Use RESTful conventions for API endpoints');
  if (keywords.includes('database')) patterns.push('Follow repository pattern for data access');
  if (keywords.includes('test')) patterns.push('Follow AAA (Arrange-Act-Assert) test pattern');
  if (keywords.includes('security')) patterns.push('Use defense-in-depth security approach');
  if (keywords.includes('performance')) patterns.push('Profile before optimizing');

  return patterns;
}

/**
 * Build synthesized context string for heuristic research.
 */
function buildHeuristicContext(
  issueType: string,
  bestPractices: string[],
  patterns: string[]
): string {
  return [
    '## Heuristic Research Summary (Model Unavailable)',
    '',
    `This is a **${issueType}** issue. Research was generated using heuristic analysis.`,
    '',
    '### Recommended Approach',
    ...bestPractices.map((p) => `- ${p}`),
    '',
    '### Common Patterns',
    ...(patterns.length > 0
      ? patterns.map((p) => `- ${p}`)
      : ['- Follow existing codebase conventions']),
    '',
    '### Next Steps',
    '- Search codebase for similar implementations',
    '- Review test patterns in related files',
    '- Check documentation for relevant guidelines',
    '',
    '_Note: Run with model adapter for comprehensive research._',
  ].join('\n');
}

/**
 * Error thrown when research cannot proceed due to model failures.
 * (Source: Issue #502 - Fail-safe research)
 */
export class ResearchUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `RESEARCH phase cannot proceed: ${reason}. ` +
        'To use heuristic fallback research (NOT RECOMMENDED), set ' +
        'config.phases.research.allowHeuristicFallback = true'
    );
    this.name = 'ResearchUnavailableError';
  }
}

/**
 * Create fallback research output with heuristic-based guidance.
 * Used when model adapter is unavailable.
 * (Source: Issue #449 - Improve fallback implementations)
 */
function createPlaceholderResearchOutput(
  startTime: number,
  issue?: { type: string; keywords: readonly string[]; title: string }
): ResearchOutput {
  const issueType = issue?.type ?? 'enhancement';
  const keywords = issue?.keywords ?? [];
  const bestPractices = getHeuristicBestPractices(issueType);
  const patterns = getPatternsByKeywords(keywords);

  return {
    codebase: {
      relevantFiles: [],
      existingPatterns: patterns,
      interfaces: [],
      testPatterns: ['Follow existing test patterns in src/**/*.test.ts'],
    },
    academic: { papers: [] },
    docs: { officialDocs: [], bestPractices, relatedGuides: [] },
    history: { relatedIssues: [], relatedPRs: [], previousAttempts: [], relevantCommits: [] },
    synthesizedContext: buildHeuristicContext(issueType, bestPractices, patterns),
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute RESEARCH phase - Multi-agent research using model adapter.
 *
 * By default, this phase FAILS if the model call fails to prevent
 * workflows from proceeding with heuristic-based fake research.
 * (Source: Issue #502 - Fail-safe research)
 */
export async function executeResearch(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  analyze: AnalyzeOutput
): Promise<ResearchOutput> {
  const startTime = Date.now();
  const issue = analyze.selectedIssue;
  const allowHeuristicFallback = state.config.phases?.research?.allowHeuristicFallback === true;

  logger.info('RESEARCH phase: Synthesizing research context', { issue: issue.number });

  const researchPrompt = buildResearchPrompt(issue);
  const response = await deps.modelAdapter.complete({
    messages: [{ role: 'user', content: researchPrompt }],
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    maxTokens: 2000,
  });

  if (!response.ok) {
    // Model call failed - fail unless heuristic fallback explicitly allowed
    // (Source: Issue #502 - Fail-safe research)
    if (!allowHeuristicFallback) {
      throw new ResearchUnavailableError(`Model call failed: ${response.error.message}`);
    }
    logger.warn('RESEARCH phase: Model call failed, using heuristic fallback (NOT RECOMMENDED)', {
      error: response.error.message,
      issueType: issue.type,
    });
    return createPlaceholderResearchOutput(startTime, {
      type: issue.type,
      keywords: issue.keywords,
      title: issue.title,
    });
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
