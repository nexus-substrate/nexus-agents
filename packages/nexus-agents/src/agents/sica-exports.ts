/**
 * nexus-agents/agents - Self-Improving (SICA) Exports
 *
 * Re-exports for Self-Improving Code Agents module.
 */

// Self-Improving (SICA) exports
export {
  // Types
  type VersionId,
  type VersionStatus,
  type AgentConfiguration,
  type AgentVersion,
  type ExecutionMetrics,
  type VersionMetrics,
  type ImprovementAttempt,
  type ConfigurationChange,
  type ImprovementValidation,
  type ValidationCheck,
  type SicaConfig,
  type SicaEventType,
  type SicaEvent,
  type SicaExecutionResult,
  type ImprovementOptions,
  type SicaAgentOptions,
  // Constants
  DEFAULT_SICA_CONFIG,
  // Classes and factories
  SicaVersionManager,
  createVersionManager,
  SicaAgent,
  createSicaAgent,
} from './self-improving/index.js';
