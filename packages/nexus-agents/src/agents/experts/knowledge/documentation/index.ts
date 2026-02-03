/**
 * Documentation Knowledge Modules
 *
 * Domain knowledge for enriching documentation expert agent prompts.
 * Contains documentation standards, technical writing guidelines, and API doc patterns.
 *
 * @module agents/experts/knowledge/documentation
 * (Source: Epic #643 / Issue #648 - Phase 1d)
 */

import type { KnowledgeModule } from '../types.js';
import { DIATAXIS_MODULE } from './diataxis.js';

export { DIATAXIS_MODULE } from './diataxis.js';

/**
 * Documentation domain knowledge modules.
 * Includes the Diataxis framework for documentation structure and patterns.
 */
export const DOCUMENTATION_KNOWLEDGE_MODULES: readonly KnowledgeModule[] = [DIATAXIS_MODULE];
