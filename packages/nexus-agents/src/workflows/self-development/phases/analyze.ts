/**
 * Phase 1: ANALYZE
 *
 * Issue analysis and prioritization for self-development workflow.
 *
 * @module workflows/self-development/phases/analyze
 */

import { createLogger, getTimeProvider } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, AnalyzeOutput } from '../types.js';
import { checkFailFast } from './shared.js';

const logger = createLogger({ component: 'self-dev-phase-analyze' });

/**
 * Calculate score adjustment from priority labels.
 */
function getPriorityLabelScore(labels: readonly string[]): number {
  if (labels.includes('P1') || labels.includes('priority:high')) return 30;
  if (labels.includes('P2') || labels.includes('priority:medium')) return 20;
  if (labels.includes('P3') || labels.includes('priority:low')) return 10;
  return 0;
}

/**
 * Calculate score adjustment from type labels.
 */
function getTypeLabelScore(labels: readonly string[]): number {
  let score = 0;
  if (labels.includes('bug')) score += 15;
  if (labels.includes('security')) score += 25;
  if (labels.includes('good first issue')) score += 10;
  return score;
}

/**
 * Calculate score adjustment from content complexity.
 */
function getContentScore(title: string, body: string): number {
  let score = 0;
  const wordCount = body.split(/\s+/).length;
  if (wordCount < 100) score += 5;
  if (title.length < 50) score += 3;
  return score;
}

/**
 * Calculate priority score based on issue metadata.
 */
function calculatePriorityScore(labels: readonly string[], title: string, body: string): number {
  const base = 50;
  const priorityScore = getPriorityLabelScore(labels);
  const typeScore = getTypeLabelScore(labels);
  const contentScore = getContentScore(title, body);
  return Math.min(100, base + priorityScore + typeScore + contentScore);
}

/**
 * Estimate complexity from issue content.
 */
function estimateComplexity(body: string, labels: readonly string[]): number {
  if (labels.includes('complexity:high')) return 5;
  if (labels.includes('complexity:medium')) return 3;
  if (labels.includes('complexity:low')) return 1;

  let complexity = 2;
  const wordCount = body.split(/\s+/).length;
  if (wordCount > 500) complexity += 1;
  if (wordCount > 1000) complexity += 1;

  const complexKeywords = ['refactor', 'architecture', 'breaking', 'migration'];
  for (const keyword of complexKeywords) {
    if (body.toLowerCase().includes(keyword)) complexity += 1;
  }

  return Math.min(5, complexity);
}

/**
 * Determine issue type from labels.
 */
function determineIssueType(
  labels: readonly string[]
): 'bug' | 'enhancement' | 'architecture' | 'security' | 'tech-debt' {
  if (labels.includes('bug')) return 'bug';
  if (labels.includes('security')) return 'security';
  if (labels.includes('architecture')) return 'architecture';
  if (labels.includes('refactor') || labels.includes('tech-debt')) return 'tech-debt';
  return 'enhancement';
}

/**
 * Estimate effort from complexity.
 */
function estimateEffort(complexity: number): string {
  const effortMap: Record<number, string> = {
    1: '1-2h',
    2: '2-4h',
    3: '4-8h',
    4: '1-2d',
    5: '2-5d',
  };
  return effortMap[complexity] ?? '4-8h';
}

/**
 * Extract dependencies from issue body.
 */
function extractDependencies(body: string): string[] {
  const deps: string[] = [];
  const depPattern = /depends on #(\d+)/gi;
  let match;
  while ((match = depPattern.exec(body)) !== null) {
    const num = match[1];
    if (num !== undefined) deps.push(`#${num}`);
  }
  return deps;
}

/**
 * Extract risks from issue body.
 */
function extractRisks(body: string): string[] {
  const risks: string[] = [];
  const riskKeywords = ['breaking change', 'security', 'performance', 'compatibility'];
  for (const keyword of riskKeywords) {
    if (body.toLowerCase().includes(keyword)) {
      risks.push(`${keyword} mentioned in issue`);
    }
  }
  return risks;
}

/**
 * Extract keywords from issue.
 */
function extractKeywords(title: string, body: string): string[] {
  const text = `${title} ${body}`.toLowerCase();
  const techKeywords = ['api', 'database', 'test', 'lint', 'type', 'security', 'performance'];
  return techKeywords.filter((k) => text.includes(k));
}

/**
 * Error thrown when analysis cannot proceed due to missing dependencies.
 * (Source: Issue #496 - Fail-safe analysis)
 */
export class AnalyzeUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `ANALYZE phase cannot proceed: ${reason}. ` +
        'To use placeholder fallback (NOT RECOMMENDED), set ' +
        'config.phases.analyze.allowPlaceholderFallback = true'
    );
    this.name = 'AnalyzeUnavailableError';
  }
}

/**
 * Create placeholder output when no issues available.
 */
function createPlaceholderAnalyzeOutput(startTime: number): AnalyzeOutput {
  return {
    prioritizedIssues: [],
    selectedIssue: {
      number: 0,
      title: 'No approved issues available',
      body: '',
      labels: [],
      priorityScore: 0,
      complexity: 1,
      estimatedEffort: '1h',
      dependencies: [],
      risks: [],
      keywords: [],
      topics: [],
      type: 'enhancement',
    },
    selectionRationale: 'No issues with self-development-approved label found',
    durationMs: getTimeProvider().now() - startTime,
  };
}

/**
 * Enrich issue with analysis metadata.
 */
function enrichIssue(issue: {
  number: number;
  title: string;
  body: string;
  labels: string[];
}): AnalyzeOutput['prioritizedIssues'][0] {
  const complexity = estimateComplexity(issue.body, issue.labels) as 1 | 2 | 3 | 4 | 5;
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    labels: issue.labels,
    priorityScore: calculatePriorityScore(issue.labels, issue.title, issue.body),
    complexity,
    estimatedEffort: estimateEffort(complexity),
    dependencies: extractDependencies(issue.body),
    risks: extractRisks(issue.body),
    keywords: extractKeywords(issue.title, issue.body),
    topics: issue.labels.filter((l) => l.startsWith('topic:')).map((l) => l.slice(6)),
    type: determineIssueType(issue.labels),
  };
}

/**
 * Execute ANALYZE phase - Issue analysis and prioritization.
 *
 * By default, this phase FAILS if GitHub client is unavailable to prevent
 * workflows from proceeding with fake placeholder issues.
 * (Source: Issue #496 - Fail-safe analysis)
 */
export async function executeAnalyze(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState
): Promise<AnalyzeOutput> {
  const startTime = getTimeProvider().now();
  const allowPlaceholderFallback = state.config.phases?.analyze?.allowPlaceholderFallback === true;

  // Fail-fast check before falling back (Issue #455)
  checkFailFast(state.config.failFast, deps.githubClient, 'ANALYZE', 'GitHub client');

  if (deps.githubClient === undefined) {
    // GitHub client not injected - fail unless placeholder fallback explicitly allowed
    // (Source: Issue #496 - Fail-safe analysis)
    if (!allowPlaceholderFallback) {
      throw new AnalyzeUnavailableError('GitHub client not injected');
    }
    logger.warn(
      'ANALYZE phase: GitHub client not injected, using placeholder fallback (NOT RECOMMENDED)'
    );
    return createPlaceholderAnalyzeOutput(startTime);
  }

  logger.info('ANALYZE phase: Fetching issues with self-development-approved label');

  try {
    const issues = await deps.githubClient.listIssues(['self-development-approved']);
    if (issues.length === 0) {
      // No approved issues is a legitimate scenario - return placeholder but don't fail
      // This is different from missing client (which is a configuration error)
      logger.warn('ANALYZE phase: No approved issues found');
      return createPlaceholderAnalyzeOutput(startTime);
    }

    const prioritizedIssues = issues.map(enrichIssue);
    prioritizedIssues.sort((a, b) => b.priorityScore - a.priorityScore);

    const selectedIssue = prioritizedIssues[0];
    if (selectedIssue === undefined) {
      return createPlaceholderAnalyzeOutput(startTime);
    }

    logger.info('ANALYZE phase: Selected issue', {
      number: selectedIssue.number,
      title: selectedIssue.title,
      score: selectedIssue.priorityScore,
    });

    return {
      prioritizedIssues,
      selectedIssue,
      selectionRationale: `Selected #${String(selectedIssue.number)} with priority score ${String(selectedIssue.priorityScore)}/100`,
      durationMs: getTimeProvider().now() - startTime,
    };
  } catch (err) {
    const causeError = err instanceof Error ? err : new Error(String(err));
    logger.error('ANALYZE phase: GitHub API error', causeError);
    // API error - fail unless placeholder fallback explicitly allowed
    if (!allowPlaceholderFallback) {
      throw new AnalyzeUnavailableError(`GitHub API error: ${causeError.message}`);
    }
    logger.warn('ANALYZE phase: GitHub API failed, using placeholder fallback (NOT RECOMMENDED)');
    return createPlaceholderAnalyzeOutput(startTime);
  }
}
