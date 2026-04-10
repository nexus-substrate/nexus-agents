/**
 * Pipeline Templates — Declarative pipeline configurations (#1735, Phase 2)
 *
 * Predefined pipeline shapes that can be compiled into executable graphs.
 * Each template defines stage ordering and edge routing.
 *
 * @module pipeline/templates
 */

import type { PipelineTemplate } from './stage-types.js';

// ============================================================================
// Dev Pipeline Template
// ============================================================================

/** Development pipeline: research → plan → vote → decompose → implement → qa → security. */
export const DEV_PIPELINE_TEMPLATE: PipelineTemplate = {
  id: 'dev',
  name: 'Development Pipeline',
  stages: ['research', 'plan', 'vote', 'decompose', 'implement', 'qa', 'security'],
  dryRunStopAfter: 'vote',
};

// ============================================================================
// Research Pipeline Template
// ============================================================================

/** Research pipeline: decompose → investigate → synthesize → vote → scaffold. */
export const RESEARCH_PIPELINE_TEMPLATE: PipelineTemplate = {
  id: 'research',
  name: 'Research Pipeline',
  stages: ['decompose', 'investigate', 'synthesize', 'vote', 'scaffold'],
  dryRunStopAfter: 'vote',
};

// ============================================================================
// Audit Pipeline Template
// ============================================================================

/** Security audit pipeline: analyze → scan → report. */
export const AUDIT_PIPELINE_TEMPLATE: PipelineTemplate = {
  id: 'audit',
  name: 'Security Audit Pipeline',
  stages: ['analyze', 'scan', 'report'],
};

// ============================================================================
// Template Registry
// ============================================================================

/** All available pipeline templates. */
export const PIPELINE_TEMPLATES: ReadonlyMap<string, PipelineTemplate> = new Map([
  ['dev', DEV_PIPELINE_TEMPLATE],
  ['research', RESEARCH_PIPELINE_TEMPLATE],
  ['audit', AUDIT_PIPELINE_TEMPLATE],
]);

/** Get a pipeline template by ID. */
export function getTemplate(id: string): PipelineTemplate | undefined {
  return PIPELINE_TEMPLATES.get(id);
}

/** List all available template IDs. */
export function listTemplateIds(): readonly string[] {
  return [...PIPELINE_TEMPLATES.keys()];
}
