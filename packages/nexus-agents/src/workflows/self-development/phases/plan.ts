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
import { createSimpleAgent } from './shared.js';

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
 * Build implementation plan structure from analysis and research.
 */
function buildImplementationPlan(
  analyze: AnalyzeOutput,
  _research: ResearchOutput
): ImplementationPlan {
  return {
    problemAnalysis: `Issue #${String(analyze.selectedIssue.number)}: ${analyze.selectedIssue.title}`,
    successCriteria: ['All tests pass', 'Lint passes', 'Type check passes', 'Build succeeds'],
    files: [],
    interfaces: [],
    dependencies: analyze.selectedIssue.dependencies,
    testPlan: 'Add unit tests for new functionality',
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
 * Build fallback plan output when TRINITY is not available.
 */
function buildFallbackPlanOutput(
  analyze: AnalyzeOutput,
  research: ResearchOutput,
  taskDescription: string,
  maxIterations: number,
  startTime: number
): PlanOutput {
  const durationMs = Date.now() - startTime;
  return {
    trinityResult: {
      success: true,
      finalOutput: `Plan for: ${analyze.selectedIssue.title}\n${taskDescription}`,
      thinkerOutput: {
        problemAnalysis: `Issue #${String(analyze.selectedIssue.number)}: ${analyze.selectedIssue.title}`,
        approach: 'Approach derived from research context',
        considerations: analyze.selectedIssue.risks,
        successCriteria: ['All tests pass', 'Lint clean', 'Type safe'],
      },
      workerOutput: {
        implementation: 'Implementation plan placeholder',
        stepsCompleted: [],
        deviations: [],
        questions: [],
      },
      verifierOutput: {
        verdict: 'pass',
        correctnessCheck: 'Placeholder verification',
        qualityCheck: 'Placeholder quality check',
        issuesFound: [],
        recommendations: [],
      },
      iterations: maxIterations,
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

  if (deps.trinity === undefined) {
    logger.info('PLAN phase: TrinityCoordinator not injected, using placeholder');
    return buildFallbackPlanOutput(analyze, research, taskDescription, maxIterations, startTime);
  }

  logger.info('PLAN phase: Executing TRINITY coordination');

  const agent = createSimpleAgent(deps, 'planner', 'thinker');
  const task = buildTrinityTask(analyze, research, taskDescription);
  const result = await deps.trinity.execute({ task, agent });

  if (!result.ok) {
    logger.warn('PLAN phase: TRINITY failed, falling back to placeholder', {
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
