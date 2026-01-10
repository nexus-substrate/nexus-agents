/**
 * Phase 4: REFINE (Reflexion)
 *
 * Multi-persona reflexion critique for self-development workflow.
 *
 * @module workflows/self-development/phases/refine
 */

import type { IAgent, Task } from '../../../core/index.js';
import { createLogger } from '../../../core/index.js';
import type { SelfDevWorkflowDependencies } from '../interfaces.js';
import type { SelfDevWorkflowState, PlanOutput, RefineOutput } from '../types.js';
import { SELF_DEV_PERSONAS } from '../types.js';
import { createSimpleAgent } from './shared.js';

const logger = createLogger({ component: 'self-dev-phase-refine' });

/**
 * Find persona role by ID.
 */
export function findPersonaRole(personaId: string): string {
  const persona = SELF_DEV_PERSONAS.find((p) => p.id === personaId);
  return persona?.role ?? 'reviewer';
}

/**
 * Extract issues from expert contribution.
 */
function extractIssuesFromContribution(contribution: string): string[] {
  const issues: string[] = [];
  const lines = contribution.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('issue') || lower.includes('problem') || lower.includes('concern')) {
      const cleaned = line.replace(/^[-*#\d.]+\s*/, '').trim();
      if (cleaned.length > 10) issues.push(cleaned);
    }
  }
  return issues.slice(0, 5);
}

/**
 * Extract suggestions from expert contribution.
 */
function extractSuggestionsFromContribution(contribution: string): string[] {
  const suggestions: string[] = [];
  const lines = contribution.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('suggest') || lower.includes('recommend') || lower.includes('should')) {
      const cleaned = line.replace(/^[-*#\d.]+\s*/, '').trim();
      if (cleaned.length > 10) suggestions.push(cleaned);
    }
  }
  return suggestions.slice(0, 5);
}

/**
 * Build refinement task for reflexion protocol.
 */
export function buildRefinementTask(plan: PlanOutput): Task {
  return {
    id: `refine-${String(Date.now())}`,
    description: `Critique and refine the implementation plan:\n\n${plan.trinityResult.finalOutput}`,
    context: {
      metadata: {
        plan: plan.plan,
        successCriteria: plan.plan.successCriteria,
      },
    },
    constraints: { maxTokens: 3000, maxDuration: 180000 },
  };
}

/**
 * Create agents map from personas.
 */
function createAgentsFromPersonas(deps: SelfDevWorkflowDependencies): {
  agents: Map<string, IAgent>;
  expertIds: string[];
} {
  const agents = new Map<string, IAgent>();
  const expertIds: string[] = [];

  for (const persona of SELF_DEV_PERSONAS) {
    agents.set(persona.id, createSimpleAgent(deps, persona.id, persona.role));
    expertIds.push(persona.id);
  }

  return { agents, expertIds };
}

/**
 * Build critiques from reflexion expert results.
 */
function buildCritiquesFromReflexion(
  expertResults: Array<{
    expertId: string;
    contributionScore: number;
    result?: { output?: unknown };
  }>
): RefineOutput['critiques'] {
  return expertResults.map((expert) => {
    const contribution = expert.result?.output?.toString() ?? '';
    return {
      personaId: expert.expertId,
      role: findPersonaRole(expert.expertId),
      issues: extractIssuesFromContribution(contribution),
      suggestions: extractSuggestionsFromContribution(contribution),
      severity: expert.contributionScore < 0.7 ? 0.5 : 0.1,
    };
  });
}

/**
 * Build fallback critiques from personas.
 */
function buildFallbackCritiques(): RefineOutput['critiques'] {
  return SELF_DEV_PERSONAS.map((persona) => ({
    personaId: persona.id,
    role: persona.role,
    issues: [],
    suggestions: [`Consider ${persona.focusAreas[0] ?? 'key'} aspects`],
    severity: 0.1,
  }));
}

/**
 * Build fallback refine output.
 */
function buildFallbackRefineOutput(plan: PlanOutput, startTime: number): RefineOutput {
  return {
    reflexionResult: {
      rounds: [],
      finalOutput: plan.trinityResult.finalOutput,
      totalIterations: 1,
      converged: true,
      terminationReason: 'converged',
      totalDurationMs: Date.now() - startTime,
    },
    refinedPlan: plan.plan,
    critiques: buildFallbackCritiques(),
    iterations: 1,
    converged: true,
    finalSeverity: 0,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Build RefineOutput from successful reflexion result.
 */
function buildRefineOutputFromReflexion(
  reflexionResult: {
    success: boolean;
    expertResults: Array<{
      expertId: string;
      contributionScore: number;
      result?: { output?: unknown };
    }>;
    aggregatedResult: { output?: unknown };
  },
  plan: PlanOutput,
  startTime: number
): RefineOutput {
  const critiques = buildCritiquesFromReflexion(reflexionResult.expertResults);
  const avgSeverity =
    critiques.length > 0
      ? critiques.reduce((sum: number, c) => sum + c.severity, 0) / critiques.length
      : 0;
  const finalOutput =
    reflexionResult.aggregatedResult.output?.toString() ?? plan.trinityResult.finalOutput;

  return {
    reflexionResult: {
      rounds: [],
      finalOutput,
      totalIterations: reflexionResult.expertResults.length,
      converged: reflexionResult.success,
      terminationReason: reflexionResult.success ? 'converged' : 'max_iterations',
      totalDurationMs: Date.now() - startTime,
    },
    refinedPlan: plan.plan,
    critiques,
    iterations: reflexionResult.expertResults.length,
    converged: reflexionResult.success,
    finalSeverity: avgSeverity,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute reflexion protocol and build output.
 */
async function executeReflexionProtocol(
  deps: SelfDevWorkflowDependencies,
  plan: PlanOutput,
  maxIterations: number,
  startTime: number
): Promise<RefineOutput | null> {
  if (deps.reflexion === undefined) return null;

  logger.info('REFINE phase: Executing ReflexionProtocol');

  const { agents, expertIds } = createAgentsFromPersonas(deps);
  const refinementTask = buildRefinementTask(plan);

  const result = await deps.reflexion.execute(
    {
      sessionId: `refine-${String(Date.now())}`,
      pattern: 'reflexion',
      experts: expertIds,
      task: refinementTask,
      maxRetries: maxIterations,
    },
    agents
  );

  if (!result.ok) {
    logger.warn('REFINE phase: ReflexionProtocol failed', { error: result.error.message });
    return null;
  }

  logger.info('REFINE phase: ReflexionProtocol completed', {
    success: result.value.success,
    expertResults: result.value.expertResults.length,
  });

  return buildRefineOutputFromReflexion(result.value, plan, startTime);
}

/**
 * Execute REFINE phase - Multi-persona reflexion critique.
 */
export async function executeRefine(
  deps: SelfDevWorkflowDependencies,
  state: SelfDevWorkflowState,
  plan: PlanOutput
): Promise<RefineOutput> {
  const startTime = Date.now();
  const phaseConfig = state.config.phases?.refine;
  const maxIterations = phaseConfig?.maxIterations ?? 3;

  const reflexionOutput = await executeReflexionProtocol(deps, plan, maxIterations, startTime);
  if (reflexionOutput !== null) {
    return reflexionOutput;
  }

  logger.info('REFINE phase: ReflexionProtocol not injected, using fallback');
  return buildFallbackRefineOutput(plan, startTime);
}
