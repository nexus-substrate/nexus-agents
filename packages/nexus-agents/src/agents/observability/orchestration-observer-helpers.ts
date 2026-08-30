/**
 * nexus-agents/agents - OrchestrationObserver Helper Functions
 *
 * Pure helper functions for OrchestrationObserver that don't depend on class state.
 * Extracted to reduce main class file size and improve testability.
 *
 * @module agents/observability/orchestration-observer-helpers
 */

import type { CliName } from '../../cli-adapters/types.js';
import { computeTokenCost } from '../../learning/token-cost-core.js';
import { getDefaultRegistry } from '../../config/model-registry.js';
import { getDefaultModelForCli } from '../../config/model-config-helpers.js';
import type { CliNameLiteral } from '../../config/model-capabilities-types.js';
import type { DomainEvent } from '../collaboration/event-bus-types.js';
import { getTimeProvider } from '../../core/index.js';
import type {
  TrackedAgent,
  AgentState,
  RoutingDecision,
  SessionMetrics,
  SessionTokenTotals,
  CostMetrics,
} from './orchestration-observer-types.js';

// ============================================================================
// Payload Extraction Helpers
// ============================================================================

/**
 * Extracts a string field from a payload object safely.
 *
 * @param payload - The payload object to extract from
 * @param field - The field name to extract
 * @returns The string value or empty string if not found/invalid
 */
export function extractStringField(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  return typeof value === 'string' ? value : '';
}

/**
 * Extracts a number field from a payload object safely.
 *
 * @param payload - The payload object to extract from
 * @param field - The field name to extract
 * @param defaultValue - Default value if not found
 * @returns The number value or default if not found/invalid
 */
export function extractNumberField(
  payload: Record<string, unknown>,
  field: string,
  defaultValue = 0
): number {
  const value = payload[field];
  return typeof value === 'number' ? value : defaultValue;
}

/**
 * Extracts a boolean field from a payload object safely.
 *
 * @param payload - The payload object to extract from
 * @param field - The field name to extract
 * @returns The boolean value (defaults to false if not found/invalid)
 */
export function extractBooleanField(payload: Record<string, unknown>, field: string): boolean {
  return payload[field] === true;
}

/**
 * Extracts a string array field from a payload object safely.
 *
 * @param payload - The payload object to extract from
 * @param field - The field name to extract
 * @returns The string array or empty array if not found/invalid
 */
export function extractStringArrayField(payload: Record<string, unknown>, field: string): string[] {
  const value = payload[field];
  return Array.isArray(value) ? (value as string[]) : [];
}

/**
 * Extracts session ID from event object or payload.
 *
 * @param event - The domain event
 * @param payload - The event payload
 * @returns The session ID or empty string if not found
 */
export function extractSessionId(event: DomainEvent, payload: Record<string, unknown>): string {
  // Check event.sessionId first, then payload.sessionId
  if (event.sessionId !== undefined && event.sessionId !== '') {
    return event.sessionId;
  }
  return extractStringField(payload, 'sessionId');
}

// ============================================================================
// Object Creation Helpers
// ============================================================================

/**
 * Creates initial session metrics with default values.
 *
 * @param sessionId - The session ID
 * @returns A new SessionMetrics object with initial values
 */
export function createInitialSessionMetrics(sessionId: string): SessionMetrics {
  return {
    sessionId,
    startedAt: getTimeProvider().nowIso(),
    durationMs: 0,
    taskCount: 0,
    successCount: 0,
    failureCount: 0,
    tokenUsage: createInitialTokenUsage(),
    costMetrics: createInitialCostMetrics(),
    routingDecisions: 0,
    eventsProcessed: 0,
  };
}

/**
 * Creates initial token usage with zero values.
 *
 * @returns A new SessionTokenTotals object with zero values
 */
export function createInitialTokenUsage(): SessionTokenTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

/**
 * Creates initial cost metrics with zero values.
 *
 * @returns A new CostMetrics object with zero values
 */
export function createInitialCostMetrics(): CostMetrics {
  return {
    totalCostUsd: 0,
    costPerModel: new Map(),
  };
}

/**
 * Creates a new TrackedAgent object with initial values.
 *
 * @param agentId - The agent ID
 * @param state - The initial agent state
 * @param role - The agent role (defaults to 'unknown')
 * @param currentTask - Optional current task description
 * @returns A new TrackedAgent object
 */
export function createTrackedAgent(
  agentId: string,
  state: AgentState,
  role = 'unknown',
  currentTask?: string
): TrackedAgent {
  return {
    id: agentId,
    role,
    state,
    currentTask,
    lastUpdated: getTimeProvider().nowIso(),
    taskCount: 0,
    errorCount: 0,
  };
}

// ============================================================================
// Statistics Calculation Helpers
// ============================================================================

/**
 * Calculates routing distribution from routing history.
 *
 * @param routingHistory - The routing decision history
 * @returns A record mapping CLI names to counts
 */
export function calculateRoutingDistribution(
  routingHistory: readonly RoutingDecision[]
): Record<CliName, number> {
  const distribution: Record<CliName, number> = { claude: 0, gemini: 0, codex: 0, opencode: 0 };
  for (const decision of routingHistory) {
    distribution[decision.selectedCli]++;
  }
  return distribution;
}

/**
 * Aggregates token and cost totals from session metrics.
 *
 * @param sessionMetrics - Iterable of session metrics
 * @returns Object containing total tokens and total cost
 */
export function calculateMetricsTotals(sessionMetrics: Iterable<SessionMetrics>): {
  totalTokens: number;
  totalCost: number;
} {
  let totalTokens = 0;
  let totalCost = 0;
  for (const metrics of sessionMetrics) {
    totalTokens += metrics.tokenUsage.totalTokens;
    totalCost += metrics.costMetrics.totalCostUsd;
  }
  return { totalTokens, totalCost };
}

/**
 * Counts active sessions (sessions without a completedAt timestamp).
 *
 * @param sessionMetrics - Iterable of session metrics
 * @returns The count of active sessions
 */
export function countActiveSessions(sessionMetrics: Iterable<SessionMetrics>): number {
  let count = 0;
  for (const metrics of sessionMetrics) {
    if (metrics.completedAt === undefined) {
      count++;
    }
  }
  return count;
}

/**
 * Finds the first active session (no completedAt) from metrics.
 *
 * @param sessionMetrics - Iterable of session metrics
 * @returns The first active session or undefined
 */
export function findActiveSession(
  sessionMetrics: Iterable<SessionMetrics>
): SessionMetrics | undefined {
  for (const metrics of sessionMetrics) {
    if (metrics.completedAt === undefined) {
      return metrics;
    }
  }
  return undefined;
}

// ============================================================================
// Pruning Helpers
// ============================================================================

/**
 * Identifies session IDs to remove based on max history limit.
 * Returns oldest sessions first.
 *
 * @param sessions - Array of [sessionId, metrics] entries
 * @param maxSessions - Maximum sessions to keep
 * @returns Array of session IDs to remove
 */
export function identifySessionsToRemove(
  sessions: Array<[string, SessionMetrics]>,
  maxSessions: number
): string[] {
  if (sessions.length <= maxSessions) {
    return [];
  }

  const sorted = sessions.sort((a, b) => a[1].startedAt.localeCompare(b[1].startedAt));
  const toRemove = sorted.slice(0, sessions.length - maxSessions);
  return toRemove.map(([sessionId]) => sessionId);
}

// ============================================================================
// Token Cost Calculation
// ============================================================================

/**
 * Calculates the cost for token usage based on rate.
 *
 * @param tokens - Token usage to calculate cost for
 * @param ratePerThousand - Cost rate per 1000 tokens
 * @returns The calculated cost in USD
 */
export function calculateTokenCost(tokens: SessionTokenTotals, ratePerThousand: number): number {
  return computeTokenCost(
    { input: 0, output: 0, blended: tokens.totalTokens },
    { inputPer1M: 0, outputPer1M: 0, blendedPer1M: ratePerThousand * 1000 }
  ).costUsd;
}

/**
 * Cost for one model's token usage (#5180).
 *
 * Resolution order, and each rung is a different fidelity:
 *
 *  1. A `{ input, output }` override — SPLIT, priced exactly.
 *  2. A bare-number override — BLENDED, the historical shape. Kept meaning what
 *     it always meant so an existing config produces byte-identical figures;
 *     reinterpreting it as an input rate would silently move every operator's
 *     numbers, which is the misreport this change exists to remove.
 *  3. No override — registry split rates via the canonical pricing chain.
 *
 * Rung 3 is the behaviour change. The old default was a private per-model table
 * (`claude: 0.015` blended) that understated an output-heavy run ~3x, because
 * output bills at several times input and this function was handed a split it
 * threw away.
 *
 * Returns `undefined` when no override exists AND the registry has no pricing —
 * unpriced is not $0, and the caller must be able to tell them apart.
 */
export function resolveModelCost(
  tokens: SessionTokenTotals,
  override: number | { readonly input: number; readonly output: number } | undefined
): number | undefined {
  if (typeof override === 'object') {
    return computeTokenCost(
      { input: tokens.inputTokens, output: tokens.outputTokens },
      { inputPer1M: override.input * 1000, outputPer1M: override.output * 1000 }
    ).costUsd;
  }
  if (typeof override === 'number') return calculateTokenCost(tokens, override);
  return undefined;
}

/**
 * Registry-priced cost for a model, used when no operator override exists.
 *
 * Reads the canonical pricing chain (`getDefaultRegistry`) so the observer stops
 * being a fourth pricing authority (#5121, #5180), and prices the input/output
 * split the caller already holds.
 *
 * NAMES THE EMPTY CASE: a model the registry cannot price contributes **0** to
 * the running total, and that is a floor, not a measurement. It is deliberately
 * not a substituted guess — inventing a rate here would be the misreport this
 * whole change removes. Callers that need to distinguish unpriced from free
 * should read `computeCostDetail`'s `priced` flag on the ledger path instead;
 * this counter is a session-local sum, not a billing record.
 */
export function registryCostForModel(tokens: SessionTokenTotals, model: string): number {
  // The observer keys on a CliName ('claude'), NOT a model id
  // ('claude-fable-5'), so the registry must be asked about the CLI's default
  // model. Looking the CliName up directly returns unpriced for every CLI, and
  // this function would then report $0 for everything — turning a ~3x
  // understatement into a 100% one. Caught by measuring rather than assuming;
  // it is the same CliName-vs-ModelId gap the #5122 audit flagged for the
  // budget paths.
  // Fail SOFT. This is a telemetry counter on the routing hot path: an
  // unrecognised name must contribute 0, never throw. `getDefaultModelForCli`
  // throws on an unknown CliName, and taking down a routing call to record a
  // metric would be far worse than the mispricing this function fixes.
  let pricing;
  try {
    pricing = getDefaultRegistry().getEntry(getDefaultModelForCli(model as CliNameLiteral)).pricing;
  } catch {
    return 0;
  }
  if (pricing === undefined) return 0;
  return computeTokenCost(
    { input: tokens.inputTokens, output: tokens.outputTokens },
    { inputPer1M: pricing.inputPer1M, outputPer1M: pricing.outputPer1M }
  ).costUsd;
}
