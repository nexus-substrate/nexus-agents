/**
 * Architecture Knowledge Modules
 *
 * Domain knowledge for enriching architecture expert agent prompts.
 * Contains architectural patterns, system design principles, and decision frameworks.
 *
 * @module agents/experts/knowledge/architecture
 * (Source: Epic #643 / Issue #648 - Phase 1d, Phase 5a)
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

/**
 * Common architecture domain patterns for quick reference injection.
 */
export const ARCHITECTURE_DOMAIN_PATTERNS = {
  cleanArchLayers: 'Entities > Use Cases > Interface Adapters > Frameworks; deps point inward only',
  hexagonal: 'Core defines ports (interfaces); adapters implement them; swap via DI',
  solidPrinciples: 'Single Responsibility, Open/Closed, Liskov, Interface Segregation, DI',
  moduleBoundaries: 'Single barrel export; anti-corruption layers; shared kernel minimal',
  decomposition: 'Bounded contexts; one service per team; services own their data store',
} as const;

/**
 * Architecture best practices summary for prompt injection.
 */
export const ARCHITECTURE_BEST_PRACTICES = {
  designDecisions: 'Document all decisions as ADRs with context, decision, and consequences',
  tradeoffs: 'State trade-offs explicitly; no decision is free; CAP, latency vs throughput',
  monolithFirst: 'Start with modular monolith; extract when evidence of need exists',
  resilience: 'Circuit breakers on external calls; retry with backoff; timeout everything',
  scalability: 'Stateless services; caching strategy; async processing for heavy work',
} as const;

/**
 * Build a formatted knowledge prompt for architecture expert prompt injection.
 *
 * @returns Formatted string with architecture domain knowledge
 */
export function getArchitectureKnowledgePrompt(): string {
  const sections = ARCHITECTURE_KNOWLEDGE_MODULES.flatMap((module) => module.sections)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);

  const formatted = sections
    .map((section) => `### ${section.title}\n${section.content}`)
    .join('\n\n');

  return `## Architecture Domain Knowledge\n\n${formatted}`;
}
