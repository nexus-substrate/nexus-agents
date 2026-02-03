/**
 * Code Knowledge Modules
 *
 * Domain knowledge for enriching code expert agent prompts.
 * Contains coding standards, design patterns, and best practices
 * for TypeScript, Python, and CI/CD pipelines.
 *
 * @module agents/experts/knowledge/code
 * (Source: Epic #643 - Standards Absorption, Phase 1c)
 */

import type { KnowledgeModule } from '../types.js';
import { TYPESCRIPT_PATTERNS } from './typescript-patterns.js';
import { PYTHON_PATTERNS } from './python-patterns.js';
import { CICD_PATTERNS } from './cicd-patterns.js';

export { TYPESCRIPT_PATTERNS } from './typescript-patterns.js';
export { PYTHON_PATTERNS } from './python-patterns.js';
export { CICD_PATTERNS } from './cicd-patterns.js';

/**
 * All code domain knowledge modules.
 * Used by the KnowledgeRegistry to enrich code expert agent prompts.
 */
export const CODE_KNOWLEDGE_MODULES: readonly KnowledgeModule[] = [
  TYPESCRIPT_PATTERNS,
  PYTHON_PATTERNS,
  CICD_PATTERNS,
];
