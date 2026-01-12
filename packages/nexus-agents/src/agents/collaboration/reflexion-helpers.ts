/**
 * Reflexion Protocol Helpers
 * (Source: Issue #221)
 *
 * Helper functions for critique generation and debate synthesis
 * in the Multi-Agent Reflexion protocol.
 */

import type { Task } from '../../core/index.js';
import type { Persona, PersonaCritique, DebateResult, ReflexionRound } from './reflexion-types.js';

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
    durationMs: Date.now() - roundStart,
  };
}
