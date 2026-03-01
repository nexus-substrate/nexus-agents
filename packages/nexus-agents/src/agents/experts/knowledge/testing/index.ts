/**
 * Testing Knowledge Modules
 *
 * Domain knowledge for enriching testing expert agent prompts.
 * Contains unit, integration, E2E, and performance testing best practices.
 *
 * @module agents/experts/knowledge/testing
 * (Source: Epic #643 - Standards Absorption, Issue #646 - Phase 1b)
 */

import type { KnowledgeModule } from '../types.js';
import { UNIT_TESTING_PATTERNS } from './unit-patterns.js';
import { INTEGRATION_TESTING_PATTERNS } from './integration-patterns.js';
import { E2E_TESTING_PATTERNS } from './e2e-patterns.js';
import { PERFORMANCE_TESTING_PATTERNS } from './performance-patterns.js';

export { UNIT_TESTING_PATTERNS } from './unit-patterns.js';
export { INTEGRATION_TESTING_PATTERNS } from './integration-patterns.js';
export { E2E_TESTING_PATTERNS } from './e2e-patterns.js';
export { PERFORMANCE_TESTING_PATTERNS } from './performance-patterns.js';

/**
 * All testing domain knowledge modules.
 * Registered with the KnowledgeRegistry for injection into TestingExpert prompts.
 */
export const TESTING_KNOWLEDGE_MODULES: readonly KnowledgeModule[] = [
  UNIT_TESTING_PATTERNS,
  INTEGRATION_TESTING_PATTERNS,
  E2E_TESTING_PATTERNS,
  PERFORMANCE_TESTING_PATTERNS,
];

/**
 * Build a formatted knowledge prompt for testing expert prompt injection.
 *
 * @returns Formatted string with testing domain knowledge
 */
export function getTestingKnowledgePrompt(): string {
  const sections = TESTING_KNOWLEDGE_MODULES.flatMap((module) => module.sections)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);

  const formatted = sections
    .map((section) => `### ${section.title}\n${section.content}`)
    .join('\n\n');

  return `## Testing Domain Knowledge\n\n${formatted}`;
}
