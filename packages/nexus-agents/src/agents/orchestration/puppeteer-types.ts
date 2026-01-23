/**
 * Puppeteer Orchestration Types
 *
 * Type definitions for Puppeteer-style learned orchestration.
 * Implements centralized orchestrator with dynamic agent selection
 * via learned/rule-based policies.
 *
 * @module agents/orchestration/puppeteer-types
 * (Source: Issue #335, arXiv:2505.19591)
 */

// Re-export state types
export type {
  AgentStepOutput,
  PuppeteerStateMetadata,
  PuppeteerState,
  AgentDistribution,
} from './puppeteer-state-types.js';

// Re-export result types
export type {
  PuppeteerTerminationReason,
  PuppeteerStepResult,
  HubAgentInfo,
  CycleInfo,
  EmergentPatterns,
  PuppeteerMetrics,
  PuppeteerResult,
} from './puppeteer-result-types.js';

// Re-export config types
export type {
  PolicyMode,
  PuppeteerConfig,
  PuppeteerExecuteOptions,
  ReasoningPattern,
  PuppetDefinition,
  IPuppetAgent,
} from './puppeteer-config-types.js';

export { DEFAULT_PUPPETEER_CONFIG, DEFAULT_PUPPETS } from './puppeteer-config-types.js';

// Re-export schemas
export {
  PolicyModeSchema,
  TerminationReasonSchema,
  ReasoningPatternSchema,
  PuppeteerConfigSchema,
} from './puppeteer-schemas.js';
