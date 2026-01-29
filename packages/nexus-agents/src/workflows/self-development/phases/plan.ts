/**
 * Phase 3: PLAN (TRINITY)
 *
 * TRINITY Thinker/Worker/Verifier planning for self-development workflow.
 *
 * @module workflows/self-development/phases/plan
 */

import type { Task } from '../../../core/index.js';
import { createLogger } from '../../../core/index.js';
import type { TrinityResult } from '../../../agents/collaboration/trinity-types.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type {
  SelfDevWorkflowState,
  AnalyzeOutput,
  ResearchOutput,
  PlanOutput,
  ImplementationPlan,
} from '../types.js';
import { createSimpleAgent, checkFailFast } from './shared.js';

const logger = createLogger({ component: 'self-dev-phase-plan' });

/**
 * Build task description for TRINITY planning from analysis and research.
 */
function buildPlanTaskDescription(analyze: AnalyzeOutput, research: ResearchOutput): string {
  const issue = analyze.selectedIssue;
  const parts = [
    `Create implementation plan for: ${issue.title}`,
    '',
    '## Issue Details',
    `Number: #${String(issue.number)}`,
    `Type: ${issue.type}`,
    `Complexity: ${String(issue.complexity)}/5`,
    `Estimated Effort: ${issue.estimatedEffort}`,
    '',
    '## Description',
    issue.body || 'No description provided',
    '',
    '## Research Context',
    research.synthesizedContext,
    '',
    '## Dependencies',
    issue.dependencies.length > 0 ? issue.dependencies.join('\n') : 'None identified',
    '',
    '## Known Risks',
    issue.risks.length > 0 ? issue.risks.join('\n') : 'None identified',
  ];
  return parts.join('\n');
}

/**
 * Parse file paths from implementation description.
 */
function parseFilesFromImplementation(implementation: string): ImplementationPlan['files'] {
  const files: ImplementationPlan['files'] = [];
  const filePattern = /(create|modify|add|update)\s+([a-zA-Z0-9_./-]+\.(ts|js|json|md))/gi;
  let match;
  while ((match = filePattern.exec(implementation)) !== null) {
    const action = match[1]?.toLowerCase();
    const path = match[2];
    if (path !== undefined) {
      files.push({
        path,
        action: action === 'create' || action === 'add' ? 'create' : 'modify',
        description: `${action ?? 'modify'} ${path}`,
      });
    }
  }
  return files;
}

/**
 * Extract test plan from completed steps.
 */
function extractTestPlan(stepsCompleted: readonly string[]): string {
  const testSteps = stepsCompleted.filter(
    (s) => s.toLowerCase().includes('test') || s.toLowerCase().includes('spec')
  );
  return testSteps.length > 0 ? testSteps.join('\n') : 'Add unit tests for new functionality';
}

/**
 * Generate implementation steps based on issue type.
 * Provides actionable guidance even without LLM-based planning.
 */
function generateStepsForType(issueType: string, _issueTitle: string): string[] {
  const baseSteps = [
    'Review existing code patterns in affected areas',
    'Implement changes following project conventions',
    'Add/update unit tests for modified functionality',
    'Run lint and typecheck to verify code quality',
    'Update documentation if public API changes',
  ];

  const typeSpecificSteps: Record<string, string[]> = {
    bug: [
      'Reproduce the bug and identify root cause',
      'Write failing test that demonstrates the bug',
      ...baseSteps.slice(1),
      'Verify fix does not regress other functionality',
    ],
    security: [
      'Analyze security implications and threat model',
      'Review OWASP guidelines for this type of vulnerability',
      ...baseSteps.slice(1),
      'Verify no new attack vectors are introduced',
      'Consider adding security-focused tests',
    ],
    enhancement: baseSteps,
    'tech-debt': [
      'Document current behavior before refactoring',
      'Ensure comprehensive test coverage exists',
      'Make incremental, reviewable changes',
      ...baseSteps.slice(2),
    ],
    architecture: [
      'Document proposed architecture changes',
      'Identify all affected components and interfaces',
      'Plan migration path for existing code',
      ...baseSteps.slice(1),
    ],
  };

  return typeSpecificSteps[issueType] ?? baseSteps;
}

/**
 * Build implementation plan structure from analysis and research.
 * Uses heuristic analysis when TrinityCoordinator unavailable.
 */
function buildImplementationPlan(
  analyze: AnalyzeOutput,
  research: ResearchOutput
): ImplementationPlan {
  const issue = analyze.selectedIssue;

  return {
    problemAnalysis: `Issue #${String(issue.number)}: ${issue.title}`,
    successCriteria: [
      'All tests pass',
      'Lint passes with zero errors',
      'Type check passes',
      'Build succeeds',
      ...issue.risks.map((r) => `Risk mitigated: ${r}`),
    ],
    files: research.codebase.relevantFiles.map((f) => ({
      path: f,
      action: 'modify' as const,
      description: `Review and update ${f}`,
    })),
    interfaces: research.codebase.interfaces,
    dependencies: issue.dependencies,
    testPlan:
      research.codebase.testPatterns.length > 0
        ? research.codebase.testPatterns.join('\n')
        : 'Add unit tests following patterns in: src/**/*.test.ts',
  };
}

/**
 * Build implementation plan from TRINITY result.
 */
function buildImplementationPlanFromTrinity(
  trinityResult: TrinityResult,
  analyze: AnalyzeOutput
): ImplementationPlan {
  const thinker = trinityResult.thinkerOutput;
  const worker = trinityResult.workerOutput;

  return {
    problemAnalysis: thinker.problemAnalysis,
    successCriteria: thinker.successCriteria,
    files: parseFilesFromImplementation(worker.implementation),
    interfaces: [],
    dependencies: analyze.selectedIssue.dependencies,
    testPlan: extractTestPlan(worker.stepsCompleted),
  };
}

/**
 * Build TRINITY task from analyze and research outputs.
 */
function buildTrinityTask(
  analyze: AnalyzeOutput,
  research: ResearchOutput,
  taskDescription: string
): Task {
  return {
    id: `plan-${String(analyze.selectedIssue.number)}`,
    description: taskDescription,
    context: {
      metadata: {
        issue: analyze.selectedIssue,
        research: research.synthesizedContext,
      },
    },
    constraints: {
      maxTokens: 4000,
      maxDuration: 300000,
    },
  };
}

/**
 * Build plan output from TRINITY coordinator result.
 */
function buildPlanOutputFromTrinity(
  trinityResult: TrinityResult,
  analyze: AnalyzeOutput,
  startTime: number
): PlanOutput {
  return {
    trinityResult,
    plan: buildImplementationPlanFromTrinity(trinityResult, analyze),
    iterations: trinityResult.iterations,
    verified: trinityResult.verifierOutput.verdict === 'pass',
    durationMs: Date.now() - startTime,
  };
}

/**
 * Build implementation guidance markdown for fallback plan.
 */
function buildImplementationGuidance(
  issue: AnalyzeOutput['selectedIssue'],
  steps: string[],
  relevantFiles: string[]
): string {
  const fileSection =
    relevantFiles.length > 0
      ? relevantFiles.map((f) => `- ${f}`)
      : ['- Identify affected files based on issue description'];
  const riskSection =
    issue.risks.length > 0 ? ['', '### Risks to Address', ...issue.risks.map((r) => `- ${r}`)] : [];

  return [
    `## Implementation Plan for Issue #${String(issue.number)}`,
    '',
    `**Type:** ${issue.type}`,
    `**Complexity:** ${String(issue.complexity)}/5`,
    `**Estimated Effort:** ${issue.estimatedEffort}`,
    '',
    '### Steps',
    ...steps.map((s, i) => `${String(i + 1)}. ${s}`),
    '',
    '### Files to Review',
    ...fileSection,
    '',
    '### Success Criteria',
    '- All tests pass',
    '- Lint passes with zero errors',
    '- Type check passes',
    '- Build succeeds',
    ...riskSection,
  ].join('\n');
}

/** Build thinker output for fallback plan. */
function buildFallbackThinkerOutput(
  issue: AnalyzeOutput['selectedIssue']
): TrinityResult['thinkerOutput'] {
  return {
    problemAnalysis: `Issue #${String(issue.number)}: ${issue.title}\n\n${issue.body || 'No description'}`,
    approach: `Heuristic-based ${issue.type} implementation approach`,
    considerations: [
      ...issue.risks,
      ...(issue.dependencies.length > 0 ? [`Depends on: ${issue.dependencies.join(', ')}`] : []),
    ],
    successCriteria: [
      'All tests pass',
      'Lint passes with zero errors',
      'Type check passes',
      'Build succeeds',
    ],
  };
}

/** Build worker output for fallback plan. */
function buildFallbackWorkerOutput(
  guidance: string,
  steps: string[],
  hasFiles: boolean
): TrinityResult['workerOutput'] {
  return {
    implementation: guidance,
    stepsCompleted: steps.map((s, i) => `Step ${String(i + 1)} planned: ${s}`),
    deviations: [],
    questions: hasFiles ? [] : ['Which files should be modified?'],
  };
}

/**
 * Error thrown when planning cannot proceed due to missing dependencies.
 * (Source: Issue #497 - Fail-safe planning)
 */
export class PlanUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `PLAN phase cannot proceed: ${reason}. ` +
        'To use heuristic fallback planning (NOT RECOMMENDED), set ' +
        'config.phases.plan.allowHeuristicFallback = true'
    );
    this.name = 'PlanUnavailableError';
  }
}

/**
 * Build fallback plan output when TRINITY is not available.
 * Uses heuristic-based planning instead of LLM coordination.
 * (Source: Issue #449 - Improve fallback implementations)
 */
function buildFallbackPlanOutput(
  analyze: AnalyzeOutput,
  research: ResearchOutput,
  _taskDescription: string,
  _maxIterations: number,
  startTime: number
): PlanOutput {
  const durationMs = Date.now() - startTime;
  const issue = analyze.selectedIssue;
  const steps = generateStepsForType(issue.type, issue.title);
  const guidance = buildImplementationGuidance(issue, steps, research.codebase.relevantFiles);

  return {
    trinityResult: {
      success: true,
      finalOutput: guidance,
      thinkerOutput: buildFallbackThinkerOutput(issue),
      workerOutput: buildFallbackWorkerOutput(
        guidance,
        steps,
        research.codebase.relevantFiles.length > 0
      ),
      verifierOutput: {
        verdict: 'pass',
        correctnessCheck: 'Heuristic plan follows established patterns',
        qualityCheck: `Plan complexity appropriate for ${issue.type} issue`,
        issuesFound: [],
        recommendations: [
          'Review plan with human oversight before implementation',
          'Validate file paths exist',
        ],
      },
      iterations: 1,
      totalDurationMs: durationMs,
      history: [],
      stopReason: 'verified',
    },
    plan: buildImplementationPlan(analyze, research),
    iterations: 1,
    verified: true,
    durationMs,
  };
}

/**
 * Execute PLAN phase - TRINITY Thinker/Worker/Verifier planning.
 *
 * By default, this phase FAILS if TrinityCoordinator is unavailable to prevent
 * workflows from proceeding with heuristic-based fake plans.
 * (Source: Issue #497 - Fail-safe planning)
 */
export async function executePlan(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  analyze: AnalyzeOutput,
  research: ResearchOutput
): Promise<PlanOutput> {
  const startTime = Date.now();
  const taskDescription = buildPlanTaskDescription(analyze, research);
  const config = state.config.phases?.plan;
  const maxIterations = config?.maxIterations ?? 3;
  const allowHeuristicFallback = config?.allowHeuristicFallback === true;

  // Fail-fast check before falling back (Issue #455)
  checkFailFast(state.config.failFast, deps.trinity, 'PLAN', 'TrinityCoordinator');

  if (deps.trinity === undefined) {
    // TrinityCoordinator not injected - fail unless heuristic fallback explicitly allowed
    // (Source: Issue #497 - Fail-safe planning)
    if (!allowHeuristicFallback) {
      throw new PlanUnavailableError('TrinityCoordinator not injected');
    }
    logger.warn(
      'PLAN phase: TrinityCoordinator not injected, using heuristic fallback (NOT RECOMMENDED)'
    );
    return buildFallbackPlanOutput(analyze, research, taskDescription, maxIterations, startTime);
  }

  logger.info('PLAN phase: Executing TRINITY coordination');

  const agent = createSimpleAgent(deps, 'planner', 'thinker');
  const task = buildTrinityTask(analyze, research, taskDescription);
  const result = await deps.trinity.execute({ task, agent });

  if (!result.ok) {
    // TRINITY execution failed - fail unless heuristic fallback explicitly allowed
    if (!allowHeuristicFallback) {
      throw new PlanUnavailableError(
        `TrinityCoordinator execution failed: ${result.error.message}`
      );
    }
    logger.warn('PLAN phase: TRINITY failed, using heuristic fallback (NOT RECOMMENDED)', {
      error: result.error.message,
    });
    return buildFallbackPlanOutput(analyze, research, taskDescription, maxIterations, startTime);
  }

  const trinityResult = result.value;
  logger.info('PLAN phase: TRINITY completed', {
    iterations: trinityResult.iterations,
    stopReason: trinityResult.stopReason,
  });

  return buildPlanOutputFromTrinity(trinityResult, analyze, startTime);
}
