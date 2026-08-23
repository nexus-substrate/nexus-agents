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
// Audit Pipeline Template
// ============================================================================

/** Security audit pipeline: analyze → scan → report. */
export const AUDIT_PIPELINE_TEMPLATE: PipelineTemplate = {
  id: 'audit',
  name: 'Security Audit Pipeline',
  stages: ['analyze', 'scan', 'report'],
};

// ============================================================================
// Greenfield Pipeline Template
// ============================================================================

/** Greenfield pipeline: parseSpec → research → plan → vote → scaffold → decompose → implement → qa → security. */
export const GREENFIELD_PIPELINE_TEMPLATE: PipelineTemplate = {
  id: 'greenfield',
  name: 'Greenfield Pipeline',
  stages: [
    'parseSpec',
    'research',
    'plan',
    'vote',
    'scaffold',
    'decompose',
    'implement',
    'qa',
    'security',
  ],
  dryRunStopAfter: 'vote',
};

// ============================================================================
// General Pipeline Template
// ============================================================================

/**
 * General-purpose pipeline for tasks that don't match a specific template.
 * Includes security gate (fail-safe: unclassified tasks must not bypass security).
 */
export const GENERAL_PIPELINE_TEMPLATE: PipelineTemplate = {
  id: 'general',
  name: 'General Pipeline',
  // #4580: `decompose` was missing. Both `implement` and `qa` read
  // `state[TASKS]`, which only `decompose` writes — so this template
  // implemented nothing and reviewed nothing, and the QA stage reported
  // success over an empty review set (`[].every()` is true). Surfaced by
  // making that verdict honest; a template with implement+qa stages that
  // cannot receive tasks is the bug, not the honest verdict.
  stages: ['research', 'plan', 'vote', 'decompose', 'implement', 'qa', 'security'],
  dryRunStopAfter: 'vote',
};

// ============================================================================
// Template Registry
// ============================================================================

/** All available pipeline templates. */
export const PIPELINE_TEMPLATES: ReadonlyMap<string, PipelineTemplate> = new Map([
  ['dev', DEV_PIPELINE_TEMPLATE],
  // The `research` template (decompose → investigate → synthesize → vote →
  // scaffold) was retired in #3488: `investigate`/`synthesize` had no stage
  // implementation and the order was incoherent, so it could never run.
  // Research-classified tasks fall back to `general`/`dev` (#3489), which
  // already cover research → plan → vote. The complete-but-unwired
  // `runResearchPipeline` subsystem (#1711) was removed as dead lineage in
  // #3492 (consensus_vote 5/0) — superseded by these templates + the
  // MetaOrchestrator `research` strategy routing to `run_pipeline`.
  ['audit', AUDIT_PIPELINE_TEMPLATE],
  ['greenfield', GREENFIELD_PIPELINE_TEMPLATE],
  ['general', GENERAL_PIPELINE_TEMPLATE],
]);

/** Get a pipeline template by ID. */
export function getTemplate(id: string): PipelineTemplate | undefined {
  return PIPELINE_TEMPLATES.get(id);
}

/** List all available template IDs. */
export function listTemplateIds(): readonly string[] {
  return [...PIPELINE_TEMPLATES.keys()];
}
