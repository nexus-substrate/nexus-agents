/**
 * Create Expert — Recording Helpers
 *
 * Memory and outcome store recording for expert creation.
 * Best-effort — never fails the tool.
 *
 * @module mcp/tools/create-expert-recording
 * (Source: Issue #1174 — Add observability to dark MCP tools)
 */

import { createLogger, getErrorMessage } from '../../core/index.js';
import { getToolMemory } from './tool-memory.js';

const logger = createLogger({ tool: 'create-expert' });

/** Records a successful expert creation to session memory. */
export function recordExpertCreated(role: string, expertId: string): void {
  try {
    const memory = getToolMemory();
    memory.recordTask({
      approach: `Created ${role} expert (${expertId})`,
      challenges: [],
      durationMs: 0,
    });
    memory.recordLearning({
      pattern: `Expert created: ${role}`,
      context: `expertId=${expertId}`,
      confidence: 0.9,
      source: 'manual',
    });
  } catch (error: unknown) {
    logger.warn('Failed to record expert creation', { error: getErrorMessage(error) });
  }
}

/** Records a failed expert creation to session memory. */
export function recordExpertError(role: string, errorMessage: string): void {
  try {
    const memory = getToolMemory();
    memory.recordError({
      error: `Expert creation failed for ${role}: ${errorMessage.slice(0, 150)}`,
      solution: 'Check adapter availability and role validity',
      filePattern: 'mcp/tools/create-expert',
    });
  } catch (error: unknown) {
    logger.warn('Failed to record expert error', { error: getErrorMessage(error) });
  }
}

// #3624: expert CREATION is not a model execution, so it is NO LONGER recorded
// to the OutcomeStore (it polluted per-cli×category model-quality stats with
// fabricated cli=DEFAULT_CLI/model='expert' rows — consensus_vote DROP, 7/7).
// Creation telemetry still lives in session memory via recordExpertCreated /
// recordExpertError above; if creation reliability needs metrics, use a
// dedicated counter, not the model-execution OutcomeStore.
