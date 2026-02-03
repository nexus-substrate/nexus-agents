/**
 * Architecture Knowledge Modules
 *
 * Domain knowledge for enriching architecture expert agent prompts.
 * Contains architectural patterns, system design principles, and decision frameworks.
 *
 * @module agents/experts/knowledge/architecture
 * (Source: Epic #643 / Issue #648 - Phase 1d)
 */

import type { KnowledgeModule } from '../types.js';
import { CLEAN_ARCHITECTURE_MODULE } from './clean-architecture.js';
import { MICROSERVICES_MODULE } from './microservices.js';

export { CLEAN_ARCHITECTURE_MODULE } from './clean-architecture.js';
export { MICROSERVICES_MODULE } from './microservices.js';

/**
 * Architecture domain knowledge modules.
 * Includes clean architecture patterns and microservices architecture guidance.
 */
export const ARCHITECTURE_KNOWLEDGE_MODULES: readonly KnowledgeModule[] = [
  CLEAN_ARCHITECTURE_MODULE,
  MICROSERVICES_MODULE,
];
