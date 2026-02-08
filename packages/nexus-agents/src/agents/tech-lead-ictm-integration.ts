/**
 * nexus-agents/agents - Orchestrator ICTM Integration
 *
 * Enriches expert assignments with ICTM configurations for
 * dynamic sub-agent creation. Bridges the Orchestrator orchestration
 * loop with the ICTM pattern.
 *
 * @see Issue #756
 * @see https://arxiv.org/abs/2602.03786
 * @module agents/tech-lead-ictm-integration
 */

import type { SubTask, TaskAnalysis, ExpertAssignment } from './tech-lead-types.js';
import { inferICTM } from './ictm/ictm-factory.js';
import type { ICTMInferenceResult } from './ictm/ictm-types.js';

/**
 * Result of ICTM enrichment across all assignments.
 */
export interface ICTMEnrichmentResult {
  /** Enriched assignments with ICTM configs attached */
  assignments: ExpertAssignment[];
  /** Per-subtask inference results for observability */
  inferences: Map<string, ICTMInferenceResult>;
  /** Average confidence across all inferences */
  averageConfidence: number;
}

/**
 * Build a subtask lookup map from an array of subtasks.
 */
function buildSubtaskMap(subtasks: SubTask[]): Map<string, SubTask> {
  const map = new Map<string, SubTask>();
  for (const st of subtasks) {
    map.set(st.id, st);
  }
  return map;
}

/**
 * Calculate average confidence from inference results.
 */
function calcAverageConfidence(inferences: Map<string, ICTMInferenceResult>): number {
  if (inferences.size === 0) return 0;
  let sum = 0;
  for (const inference of inferences.values()) {
    sum += inference.confidence;
  }
  return sum / inferences.size;
}

/**
 * Enrich expert assignments with ICTM configurations.
 *
 * For each assignment, looks up the corresponding subtask and infers
 * an optimal ICTM configuration. Assignments without matching subtasks
 * are returned unchanged.
 *
 * @param assignments - Expert assignments from selectExperts()
 * @param subtasks - Decomposed subtasks
 * @param analysis - Parent task analysis
 * @returns Enriched assignments with ICTM configs and inference metadata
 */
export function enrichAssignmentsWithICTM(
  assignments: ExpertAssignment[],
  subtasks: SubTask[],
  analysis: TaskAnalysis
): ICTMEnrichmentResult {
  const subtaskMap = buildSubtaskMap(subtasks);
  const inferences = new Map<string, ICTMInferenceResult>();

  const enriched = assignments.map((assignment) => {
    const subtask = subtaskMap.get(assignment.subtaskId);
    if (subtask === undefined) {
      return assignment;
    }

    const inference = inferICTM(subtask, analysis);
    inferences.set(assignment.subtaskId, inference);

    return {
      ...assignment,
      ictmConfig: inference.config,
    };
  });

  return {
    assignments: enriched,
    inferences,
    averageConfidence: calcAverageConfidence(inferences),
  };
}
