/**
 * nexus-agents/agents - OrchestrationObserver Helper Functions
 *
 * Pure helper functions for OrchestrationObserver that don't depend on class state.
 * Extracted to reduce main class file size and improve testability.
 *
 * @module agents/observability/orchestration-observer-helpers
 */

import type { CliName } from '../../cli-adapters/types.js';
import type { DomainEvent } from '../collaboration/event-bus-types.js';
import { getTimeProvider } from '../../core/index.js';
import type {
  TrackedAgent,
  AgentState,
  RoutingDecision,
  SessionMetrics,
  TokenUsage,
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
 * @returns A new TokenUsage object with zero values
 */
export function createInitialTokenUsage(): TokenUsage {
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
  const distribution: Record<CliName, number> = { claude: 0, gemini: 0, codex: 0 };
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
export function calculateTokenCost(tokens: TokenUsage, ratePerThousand: number): number {
  return (tokens.totalTokens / 1000) * ratePerThousand;
}
