/**
 * Domain-specific barrel exports
 * Split from main index.ts for file size compliance (Issue #285)
 *
 * Each file corresponds to a domain in the nexus-agents package.
 * Re-exports maintain backward compatibility with the main index.ts
 */

export * from './core.js';
export * from './config.js';
export * from './adapters.js';
export * from './agents.js';
export * from './agents-compat.js';
export * from './agents-skills.js';
export * from './agents-ictm.js';
export * from './workflows.js';
export * from './mcp.js';
export * from './cli-adapters.js';
export * from './context.js';
export * from './learning.js';
export * from './audit.js';
export * from './security.js';
export * from './consensus.js';
export * from './observability.js';
export * from './orchestration.js';
export * from './swe-bench.js';
export * from './pipeline.js';
export * from './scm.js';
