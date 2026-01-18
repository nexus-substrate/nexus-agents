/**
 * nexus-agents/agents - Memory Key Generation
 *
 * Functions for generating memory keys for agent state persistence.
 * Extracted from base-agent-memory-init.ts for file size compliance.
 *
 * @module agents/memory-keys
 */

/**
 * Generates a memory key for agent state persistence.
 */
export function getAgentStateKey(agentId: string): string {
  return `agent:state:${agentId}`;
}

/**
 * Generates a memory key for task learnings.
 */
export function getTaskLearningKey(agentId: string, learningId: string): string {
  return `agent:learning:${agentId}:${learningId}`;
}

/**
 * Generates a memory key for execution patterns.
 */
export function getPatternKey(agentId: string, patternId: string): string {
  return `agent:pattern:${agentId}:${patternId}`;
}

/**
 * Generates a memory key for error resolutions.
 */
export function getErrorResolutionKey(agentId: string, errorPattern: string): string {
  const sanitized = errorPattern.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 64);
  return `agent:error:${agentId}:${sanitized}`;
}
