/**
 * nexus-agents/agents - Self-Improving Module
 *
 * SICA (Self-Improving Coding Agent) implementation.
 * A unified agent that performs tasks AND improves its own implementation.
 *
 * @module agents/self-improving
 * (Source: arXiv:2504.15228, Issue #151)
 */

// Types
export type {
  VersionId,
  VersionStatus,
  AgentConfiguration,
  AgentVersion,
  ExecutionMetrics,
  VersionMetrics,
  ImprovementAttempt,
  ConfigurationChange,
  ImprovementValidation,
  ValidationCheck,
  SicaConfig,
  SicaEventType,
  SicaEvent,
  SicaExecutionResult,
  ImprovementOptions,
} from './sica-types.js';

export { DEFAULT_SICA_CONFIG } from './sica-types.js';

// Version Manager
export { SicaVersionManager, createVersionManager } from './sica-version-manager.js';

// Agent
export { SicaAgent, createSicaAgent, type SicaAgentOptions } from './sica-agent.js';
