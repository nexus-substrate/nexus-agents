/**
 * nexus-agents/agents - Enriched Expert Prompts
 *
 * Composes built-in expert system prompts with domain-specific knowledge
 * from the knowledge modules. Each function appends a concise knowledge
 * summary to the base system prompt for its expert domain.
 *
 * @module agents/experts/enriched-prompts
 * (Source: Epic #643 - Phase 5a: Expert Knowledge Base Enhancement)
 */

import { getArchitectureKnowledgePrompt } from './knowledge/architecture/index.js';
import { getSecurityKnowledgePrompt } from './knowledge/security/index.js';
import { getDevOpsKnowledgePrompt } from './knowledge/devops/index.js';
import { getResearchKnowledgePrompt } from './knowledge/research/index.js';

/**
 * Enrich a base system prompt with domain knowledge.
 * Appends the knowledge prompt after the base prompt with a separator.
 *
 * @param basePrompt - The expert's base system prompt
 * @param knowledgePrompt - Formatted domain knowledge string
 * @returns Combined prompt with knowledge injected
 */
function enrichPrompt(basePrompt: string, knowledgePrompt: string): string {
  return `${basePrompt}\n\n${knowledgePrompt}`;
}

/**
 * Build an enriched architecture expert system prompt.
 *
 * @param basePrompt - The architecture expert's base system prompt
 * @returns System prompt enriched with architecture domain knowledge
 */
export function buildArchitecturePrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getArchitectureKnowledgePrompt());
}

/**
 * Build an enriched security expert system prompt.
 *
 * @param basePrompt - The security expert's base system prompt
 * @returns System prompt enriched with security domain knowledge
 */
export function buildSecurityPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getSecurityKnowledgePrompt());
}

/**
 * Build an enriched DevOps expert system prompt.
 *
 * @param basePrompt - The DevOps expert's base system prompt
 * @returns System prompt enriched with DevOps domain knowledge
 */
export function buildDevOpsPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getDevOpsKnowledgePrompt());
}

/**
 * Build an enriched research expert system prompt.
 *
 * @param basePrompt - The research expert's base system prompt
 * @returns System prompt enriched with research domain knowledge
 */
export function buildResearchPrompt(basePrompt: string): string {
  return enrichPrompt(basePrompt, getResearchKnowledgePrompt());
}
