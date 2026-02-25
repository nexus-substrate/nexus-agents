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
import { getOutcomeStore } from '../../orchestration/outcomes/index.js';
import { DEFAULT_CLI } from '../../config/model-capabilities-types.js';

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

/** Records expert creation outcome for adaptive routing. */
export function recordExpertOutcome(role: string, success: boolean, durationMs: number): void {
  try {
    const store = getOutcomeStore();
    store.append({
      id: `expert-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      cli: DEFAULT_CLI,
      category: 'code_generation',
      model: 'expert',
      success,
      durationMs,
      timestamp: new Date().toISOString(),
      source: 'manual',
    });
  } catch {
    // Best-effort — don't fail the tool
  }
}
