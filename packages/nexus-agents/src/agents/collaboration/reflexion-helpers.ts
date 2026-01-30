/**
 * Reflexion Protocol Helpers
 * (Source: Issue #221)
 *
 * Helper functions for critique generation and debate synthesis
 * in the Multi-Agent Reflexion protocol.
 */

import type { Task, TaskResult } from '../../core/index.js';
import { getTimeProvider } from '../../core/index.js';
import type {
  Persona,
  PersonaCritique,
  DebateResult,
  ReflexionRound,
  ReflexionConfig,
  ReflexionResult,
} from './reflexion-types.js';
import { ReflexionConfigSchema, DEFAULT_CODE_REVIEW_PERSONAS } from './reflexion-types.js';

/**
 * Error thrown when synthetic critiques are used without explicit opt-in.
 * (Source: Issue #509 - Fail-safe Reflexion)
 *
 * By default, Reflexion requires a real critique generator (LLM-based) to function properly.
 * Using synthetic critiques returns heuristic results that may lead to poor refinements.
 * To explicitly opt-in to synthetic critiques, set `allowSyntheticCritiques: true`.
 */
export class SyntheticCritiqueError extends Error {
  constructor(reason: string) {
    super(
      `Reflexion critique generation cannot proceed: ${reason}. ` +
        'To use synthetic critiques (NOT RECOMMENDED), set allowSyntheticCritiques: true'
    );
    this.name = 'SyntheticCritiqueError';
  }
}

/** Default reflexion configuration values. */
export const REFLEXION_DEFAULTS = {
  maxIterations: 3,
  severityThreshold: 0.3,
  iterationTimeoutMs: 60000,
  requireConsensus: false,
  allowSyntheticCritiques: false,
} as const;

/** Partial reflexion config for user overrides. */
export interface PartialReflexionConfig {
  readonly maxIterations?: number;
  readonly severityThreshold?: number;
  readonly personas?: readonly Persona[];
  readonly iterationTimeoutMs?: number;
  readonly requireConsensus?: boolean;
  /** Allow synthetic critiques when no real critique generator is available (Issue #509) */
  readonly allowSyntheticCritiques?: boolean;
}

/** Builds and validates the reflexion configuration. */
export function buildReflexionConfig(userConfig?: PartialReflexionConfig): ReflexionConfig {
  const config = userConfig ?? {};
  const configInput = {
    maxIterations: config.maxIterations ?? REFLEXION_DEFAULTS.maxIterations,
    severityThreshold: config.severityThreshold ?? REFLEXION_DEFAULTS.severityThreshold,
    personas: config.personas ?? DEFAULT_CODE_REVIEW_PERSONAS,
    iterationTimeoutMs: config.iterationTimeoutMs ?? REFLEXION_DEFAULTS.iterationTimeoutMs,
    requireConsensus: config.requireConsensus ?? REFLEXION_DEFAULTS.requireConsensus,
    allowSyntheticCritiques:
      config.allowSyntheticCritiques ?? REFLEXION_DEFAULTS.allowSyntheticCritiques,
  };

  const parsedConfig = ReflexionConfigSchema.safeParse(configInput);
  if (!parsedConfig.success) {
    throw new Error(`Invalid reflexion config: ${parsedConfig.error.message}`);
  }
  return parsedConfig.data;
}

/** Formats the refinement task for the producer agent. */
export function formatRefinementTask(
  originalTask: Task,
  currentOutput: unknown,
  debate: DebateResult
): Task {
  const outputStr =
    typeof currentOutput === 'string' ? currentOutput : JSON.stringify(currentOutput, null, 2);
  const actionItemsStr = debate.actionItems.map((a, i) => `${String(i + 1)}. ${a}`).join('\n');

  return {
    ...originalTask,
    id: `${originalTask.id}-refinement-${String(getTimeProvider().now())}`,
    description: `Improve the following output based on critic feedback:

ORIGINAL OUTPUT:
${outputStr}

CRITIC FEEDBACK:
${debate.synthesizedReflection}

ACTION ITEMS:
${actionItemsStr}

Please provide an improved version addressing the feedback.`,
  };
}

/** Creates the final result payload for session submission. */
export function createFinalResultPayload(
  taskId: string,
  result: ReflexionResult,
  totalDurationMs: number
): TaskResult {
  return {
    taskId,
    output: {
      result: result.finalOutput,
      reflexion: {
        rounds: result.totalIterations,
        converged: result.converged,
        terminationReason: result.terminationReason,
      },
    },
    metadata: {
      durationMs: totalDurationMs,
      tokensUsed: 0,
      toolsUsed: [],
      model: 'reflexion-protocol',
    },
  };
}

/** Generates a critique from a specific persona. */
export function generatePersonaCritique(
  persona: Persona,
  output: unknown,
  _task: Task
): PersonaCritique {
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  const hasIssues = outputStr.length < 50;
  const focusArea = persona.focusAreas[0] ?? 'key areas';

  return {
    personaId: persona.id,
    role: persona.role,
    critique: hasIssues
      ? `As ${persona.role}, I found the output needs improvement in ${persona.focusAreas.join(', ')}.`
      : `As ${persona.role}, the output adequately addresses ${persona.focusAreas.join(', ')}.`,
    suggestedImprovement: hasIssues
      ? `Consider expanding coverage of ${focusArea}.`
      : 'No major improvements needed.',
    severity: hasIssues ? 0.6 : 0.1,
    issues: hasIssues ? [`Insufficient coverage of ${focusArea}`] : [],
  };
}

/** Categorizes issues into agreements and disagreements. */
export function categorizeIssues(critiques: readonly PersonaCritique[]): {
  agreements: string[];
  disagreements: string[];
} {
  const issueCount = new Map<string, number>();
  for (const critique of critiques) {
    for (const issue of critique.issues) {
      issueCount.set(issue, (issueCount.get(issue) ?? 0) + 1);
    }
  }

  const agreements: string[] = [];
  const disagreements: string[] = [];
  const threshold = critiques.length / 2;

  for (const [issue, count] of issueCount) {
    if (count >= threshold) {
      agreements.push(issue);
    } else {
      disagreements.push(issue);
    }
  }

  return { agreements, disagreements };
}

/** Calculates average severity across critiques. */
export function calculateAverageSeverity(critiques: readonly PersonaCritique[]): number {
  if (critiques.length === 0) return 0;
  return critiques.reduce((sum, c) => sum + c.severity, 0) / critiques.length;
}

/** Extracts action items from high-severity critiques. */
export function extractActionItems(critiques: readonly PersonaCritique[]): string[] {
  return critiques
    .filter((c) => c.severity > 0.3)
    .map((c) => c.suggestedImprovement)
    .filter((s) => s !== 'No major improvements needed.');
}

/** Runs structured debate among critiques to synthesize feedback. */
export function runDebate(critiques: readonly PersonaCritique[]): DebateResult {
  const { agreements, disagreements } = categorizeIssues(critiques);
  const avgSeverity = calculateAverageSeverity(critiques);
  const actionItems = extractActionItems(critiques);

  return {
    synthesizedReflection: `Debate complete: ${String(agreements.length)} points of agreement, ${String(disagreements.length)} points of disagreement. Average severity: ${avgSeverity.toFixed(2)}.`,
    consensusSeverity: avgSeverity,
    agreements,
    disagreements,
    actionItems,
  };
}

/** Creates a reflexion round object. */
export function createReflexionRound(
  iteration: number,
  outputs: { original: unknown; improved: unknown },
  critiques: readonly PersonaCritique[],
  debate: DebateResult,
  roundStart: number
): ReflexionRound {
  return {
    iteration,
    originalOutput: outputs.original,
    critiques,
    debate,
    improvedOutput: outputs.improved,
    durationMs: getTimeProvider().now() - roundStart,
  };
}
