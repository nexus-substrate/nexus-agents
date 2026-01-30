/**
 * nexus-agents/agents - Multi-Agent Reflexion Types
 *
 * Types for MAR (Multi-Agent Reflexion) protocol implementation.
 * (Source: arxiv:2512.20845 - MAR: Multi-Agent Reflexion Improves Reasoning)
 *
 * MAR replaces single-agent self-critique with structured debate among
 * persona-based critics to avoid "degeneration of thought."
 */

import { z } from 'zod';

/**
 * Persona definition for a critic agent.
 * Each persona provides a unique perspective during reflexion.
 */
export interface Persona {
  /** Unique identifier for this persona */
  readonly id: string;
  /** Role name (e.g., "devil's advocate", "security critic") */
  readonly role: string;
  /** System prompt defining the persona's behavior */
  readonly systemPrompt: string;
  /** Areas this persona focuses on during critique */
  readonly focusAreas: readonly string[];
  /** Weight for this persona's critiques (0-1) */
  readonly weight: number;
}

/**
 * Schema for Persona validation.
 */
export const PersonaSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  systemPrompt: z.string().min(1),
  focusAreas: z.array(z.string()).min(1),
  weight: z.number().min(0).max(1).default(1),
});

/**
 * Individual critique from a persona.
 */
export interface PersonaCritique {
  /** ID of the persona providing critique */
  readonly personaId: string;
  /** Role of the persona */
  readonly role: string;
  /** The critique text */
  readonly critique: string;
  /** Suggested improvement based on the critique */
  readonly suggestedImprovement: string;
  /** Severity of issues found (0-1, 1 = critical) */
  readonly severity: number;
  /** Specific issues identified */
  readonly issues: readonly string[];
}

/**
 * Schema for PersonaCritique validation.
 */
export const PersonaCritiqueSchema = z.object({
  personaId: z.string().min(1),
  role: z.string().min(1),
  critique: z.string(),
  suggestedImprovement: z.string(),
  severity: z.number().min(0).max(1),
  issues: z.array(z.string()),
});

/**
 * Result of a debate round synthesizing multiple critiques.
 */
export interface DebateResult {
  /** Synthesized reflection from all critiques */
  readonly synthesizedReflection: string;
  /** Consensus severity level */
  readonly consensusSeverity: number;
  /** Key points of agreement among critics */
  readonly agreements: readonly string[];
  /** Points of disagreement requiring resolution */
  readonly disagreements: readonly string[];
  /** Prioritized action items */
  readonly actionItems: readonly string[];
}

/**
 * Schema for DebateResult validation.
 */
export const DebateResultSchema = z.object({
  synthesizedReflection: z.string(),
  consensusSeverity: z.number().min(0).max(1),
  agreements: z.array(z.string()),
  disagreements: z.array(z.string()),
  actionItems: z.array(z.string()),
});

/**
 * Single reflexion iteration containing critiques and improvements.
 */
export interface ReflexionRound {
  /** Iteration number (0-indexed) */
  readonly iteration: number;
  /** Original output being critiqued */
  readonly originalOutput: unknown;
  /** Critiques from all personas */
  readonly critiques: readonly PersonaCritique[];
  /** Debate result synthesizing critiques */
  readonly debate: DebateResult;
  /** Improved output after applying feedback */
  readonly improvedOutput: unknown;
  /** Time taken for this round in ms */
  readonly durationMs: number;
}

/**
 * Schema for ReflexionRound validation.
 */
export const ReflexionRoundSchema = z.object({
  iteration: z.number().int().min(0),
  originalOutput: z.unknown(),
  critiques: z.array(PersonaCritiqueSchema),
  debate: DebateResultSchema,
  improvedOutput: z.unknown(),
  durationMs: z.number().min(0),
});

/**
 * Configuration for the reflexion protocol.
 */
export interface ReflexionConfig {
  /** Maximum number of reflexion iterations */
  readonly maxIterations: number;
  /** Minimum severity threshold to continue iterating (0-1) */
  readonly severityThreshold: number;
  /** Personas to use for critique */
  readonly personas: readonly Persona[];
  /** Timeout per iteration in ms */
  readonly iterationTimeoutMs: number;
  /** Whether to require consensus among critics */
  readonly requireConsensus: boolean;
  /**
   * Allow synthetic (heuristic) critiques when no real critique generator is available.
   * (Issue #509 - Fail-safe Reflexion)
   *
   * WARNING: Synthetic critiques use simple heuristics (e.g., output length) instead of
   * real LLM analysis. This may lead to poor quality feedback and incorrect refinements.
   * Only use for testing/development.
   * Default: false (throws SyntheticCritiqueError when no generator available)
   */
  readonly allowSyntheticCritiques: boolean;
}

/**
 * Schema for ReflexionConfig validation.
 */
export const ReflexionConfigSchema = z.object({
  maxIterations: z.number().int().min(1).max(10).default(3),
  severityThreshold: z.number().min(0).max(1).default(0.3),
  personas: z.array(PersonaSchema).min(2),
  iterationTimeoutMs: z.number().min(1000).default(60000),
  requireConsensus: z.boolean().default(false),
  allowSyntheticCritiques: z.boolean().default(false),
});

/**
 * Result of the complete reflexion process.
 */
export interface ReflexionResult {
  /** All reflexion rounds executed */
  readonly rounds: readonly ReflexionRound[];
  /** Final improved output */
  readonly finalOutput: unknown;
  /** Total number of iterations */
  readonly totalIterations: number;
  /** Whether reflexion converged (severity below threshold) */
  readonly converged: boolean;
  /** Reason for termination */
  readonly terminationReason: 'converged' | 'max_iterations' | 'timeout' | 'error';
  /** Total time taken in ms */
  readonly totalDurationMs: number;
}

/**
 * Schema for ReflexionResult validation.
 */
export const ReflexionResultSchema = z.object({
  rounds: z.array(ReflexionRoundSchema),
  finalOutput: z.unknown(),
  totalIterations: z.number().int().min(0),
  converged: z.boolean(),
  terminationReason: z.enum(['converged', 'max_iterations', 'timeout', 'error']),
  totalDurationMs: z.number().min(0),
});

/**
 * Default personas for code review reflexion.
 */
export const DEFAULT_CODE_REVIEW_PERSONAS: readonly Persona[] = [
  {
    id: 'devils-advocate',
    role: "Devil's Advocate",
    systemPrompt: `You are a devil's advocate critic. Your job is to find potential problems,
edge cases, and weaknesses in the code. Be skeptical and thorough. Look for:
- Edge cases that might cause failures
- Assumptions that might be wrong
- Potential performance issues
- Missing error handling`,
    focusAreas: ['edge cases', 'assumptions', 'failure modes'],
    weight: 1.0,
  },
  {
    id: 'security-critic',
    role: 'Security Critic',
    systemPrompt: `You are a security-focused critic. Analyze the code for security vulnerabilities:
- Input validation issues
- Injection vulnerabilities
- Authentication/authorization flaws
- Data exposure risks
- OWASP Top 10 concerns`,
    focusAreas: ['security', 'vulnerabilities', 'data protection'],
    weight: 1.0,
  },
  {
    id: 'maintainability-critic',
    role: 'Maintainability Critic',
    systemPrompt: `You are a maintainability critic. Evaluate the code for long-term maintenance:
- Code clarity and readability
- Documentation quality
- Naming conventions
- Complexity and modularity
- Test coverage considerations`,
    focusAreas: ['readability', 'documentation', 'complexity'],
    weight: 0.8,
  },
] as const;

/**
 * Calculates weighted average severity from critiques.
 */
export function calculateWeightedSeverity(
  critiques: readonly PersonaCritique[],
  personas: readonly Persona[]
): number {
  if (critiques.length === 0) return 0;

  const personaMap = new Map(personas.map((p) => [p.id, p]));
  let totalWeight = 0;
  let weightedSum = 0;

  for (const critique of critiques) {
    const persona = personaMap.get(critique.personaId);
    const weight = persona?.weight ?? 1;
    weightedSum += critique.severity * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
