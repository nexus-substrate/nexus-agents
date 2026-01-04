/**
 * @nexus-agents/agents - TechLead Expert Selection Helpers
 *
 * Helper functions for selecting and scoring experts for subtask assignment.
 */

import type { AgentRole } from '@nexus-agents/core';
import type { SubTask, ExpertAssignment } from './tech-lead-types.js';
import { EXPERT_CAPABILITIES } from './tech-lead-types.js';

/**
 * Build selection reason for expert assignment.
 */
export function buildSelectionReason(role: AgentRole, subtask: SubTask): string {
  const capabilities = EXPERT_CAPABILITIES[role];
  const matched = subtask.requiredCapabilities.filter((c) => capabilities.includes(c));

  if (matched.length > 0) {
    return `Matches capabilities: ${matched.join(', ')}`;
  }

  return `Best available for task type`;
}

/**
 * Score a single expert role for capability match.
 */
function scoreRoleCapabilities(
  subtask: SubTask,
  role: AgentRole,
  expertWeights: Partial<Record<AgentRole, number>>
): number {
  const capabilities = EXPERT_CAPABILITIES[role];
  let score = 0;

  for (const required of subtask.requiredCapabilities) {
    if (capabilities.includes(required)) {
      score += 2;
    }
  }

  const weight = expertWeights[role] ?? 1;
  return score * weight;
}

/**
 * Apply keyword-based score boosts.
 */
function applyKeywordBoosts(scores: Record<AgentRole, number>, description: string): void {
  const desc = description.toLowerCase();
  const boosts: Array<{ keywords: string[]; role: AgentRole }> = [
    { keywords: ['code', 'implement'], role: 'code_expert' },
    { keywords: ['architecture', 'design'], role: 'architecture_expert' },
    { keywords: ['security', 'vulnerab'], role: 'security_expert' },
    { keywords: ['document', 'readme'], role: 'documentation_expert' },
    { keywords: ['test', 'coverage'], role: 'testing_expert' },
  ];

  for (const { keywords, role } of boosts) {
    if (keywords.some((kw) => desc.includes(kw))) {
      scores[role] += 3;
    }
  }
}

/**
 * Score all expert roles for a subtask.
 */
function scoreExperts(
  subtask: SubTask,
  expertWeights: Partial<Record<AgentRole, number>>
): Record<AgentRole, number> {
  const roles: AgentRole[] = [
    'tech_lead',
    'code_expert',
    'architecture_expert',
    'security_expert',
    'documentation_expert',
    'testing_expert',
    'custom',
  ];

  const scores: Record<AgentRole, number> = {} as Record<AgentRole, number>;
  for (const role of roles) {
    scores[role] = scoreRoleCapabilities(subtask, role, expertWeights);
  }

  applyKeywordBoosts(scores, subtask.description);

  return scores;
}

/**
 * Find the best expert from scores.
 */
function findBestExpert(scores: Record<AgentRole, number>): {
  bestRole: AgentRole;
  bestScore: number;
} {
  let bestRole: AgentRole = 'code_expert';
  let bestScore = 0;

  for (const [role, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestRole = role as AgentRole;
    }
  }

  return { bestRole, bestScore };
}

/**
 * Select an expert for a single subtask.
 */
export function selectExpertForSubtask(
  subtask: SubTask,
  expertWeights: Partial<Record<AgentRole, number>>
): ExpertAssignment {
  // If already assigned, use that role
  if (subtask.assignedRole !== undefined) {
    return {
      subtaskId: subtask.id,
      expertRole: subtask.assignedRole,
      selectionReason: 'Pre-assigned role',
      confidence: 1.0,
    };
  }

  const scores = scoreExperts(subtask, expertWeights);
  const { bestRole, bestScore } = findBestExpert(scores);
  const maxPossibleScore = subtask.requiredCapabilities.length * 2 + 3;
  const confidence = maxPossibleScore > 0 ? Math.min(1, bestScore / maxPossibleScore) : 0.5;

  return {
    subtaskId: subtask.id,
    expertRole: bestRole,
    selectionReason: buildSelectionReason(bestRole, subtask),
    confidence,
  };
}
