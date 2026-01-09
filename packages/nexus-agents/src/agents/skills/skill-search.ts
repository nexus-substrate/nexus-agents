/**
 * nexus-agents/agents - Skill Search Helpers
 *
 * Search and relevance scoring for the skill library.
 *
 * @module agents/skills/skill-search
 * (Source: arXiv:2305.16291, Issue #150)
 */

import type { Skill, SkillQuery, SkillMetrics } from './skill-types.js';

/**
 * Extracts keywords from text, filtering stop words.
 */
export function extractKeywords(text: string, stopWords: Set<string>): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .filter((word) => !stopWords.has(word));
}

/**
 * Calculates relevance score for a skill based on keywords.
 */
export function calculateRelevanceScore(
  skill: Skill,
  keywords: string[],
  metrics: SkillMetrics | undefined
): number {
  let score = 0;
  const nameLower = skill.name.toLowerCase();
  const descLower = skill.description.toLowerCase();
  const tagsLower = skill.tags.map((t) => t.toLowerCase());

  for (const keyword of keywords) {
    if (nameLower.includes(keyword)) score += 3;
    if (descLower.includes(keyword)) score += 1;
    if (tagsLower.some((t) => t.includes(keyword))) score += 2;
  }

  if (metrics !== undefined && metrics.successRate > 0.5) {
    score *= 1 + metrics.successRate * 0.5;
  }

  return score;
}

/**
 * Checks if a skill matches category filter.
 */
export function matchesCategory(skill: Skill, query: SkillQuery): boolean {
  return query.category === undefined || skill.category === query.category;
}

/**
 * Checks if a skill matches complexity filter.
 */
export function matchesComplexity(skill: Skill, query: SkillQuery): boolean {
  return query.complexity === undefined || skill.complexity === query.complexity;
}

/**
 * Checks if a skill matches search text.
 */
export function matchesSearch(skill: Skill, query: SkillQuery): boolean {
  if (query.search === undefined) return true;
  const searchLower = query.search.toLowerCase();
  const nameMatch = skill.name.toLowerCase().includes(searchLower);
  const descMatch = skill.description.toLowerCase().includes(searchLower);
  return nameMatch || descMatch;
}

/**
 * Checks if a skill matches tag filter.
 */
export function matchesTags(skill: Skill, query: SkillQuery): boolean {
  if (query.tags === undefined || query.tags.length === 0) return true;
  return query.tags.some((tag) => skill.tags.includes(tag));
}

/**
 * Checks if a skill matches success rate filter.
 */
export function matchesSuccessRate(
  skillId: string,
  query: SkillQuery,
  getMetrics: (id: string) => SkillMetrics | undefined
): boolean {
  if (query.minSuccessRate === undefined) return true;
  const metrics = getMetrics(skillId);
  return metrics !== undefined && metrics.successRate >= query.minSuccessRate;
}

/**
 * Checks if a skill matches all query criteria.
 */
export function matchesAllCriteria(
  skill: Skill,
  query: SkillQuery,
  getMetrics: (id: string) => SkillMetrics | undefined
): boolean {
  return (
    matchesCategory(skill, query) &&
    matchesComplexity(skill, query) &&
    matchesSearch(skill, query) &&
    matchesTags(skill, query) &&
    matchesSuccessRate(skill.id, query, getMetrics)
  );
}
