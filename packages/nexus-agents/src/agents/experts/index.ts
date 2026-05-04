/**
 * nexus-agents/agents - Expert System
 *
 * Dynamic expert factory and registry for creating specialized agents.
 * Includes task analysis and expert selection algorithms.
 * Also exports specialized expert agent implementations.
 */

// ============================================================================
// Expert Types and Schemas (Shared)
// ============================================================================

export {
  type ExpertDomain,
  type ExpertOptions,
  type ExpertOutput,
  type CodeAnalysisResult,
  type CodeChange,
  type SecurityAnalysisResult,
  type Vulnerability,
  type ComplianceStatus,
  type ArchitectureAnalysisResult,
  type ArchitecturePattern,
  type ArchitectureDecision,
  type SystemComponent,
  type TestingAnalysisResult,
  type GeneratedTest,
  type CoverageMetrics,
  type TestQuality,
  type DocumentationResult,
  type DocumentationSection,
  type ApiDocumentation,
  type ApiEndpoint,
  type ApiType,
  ExpertDomainSchema,
  ExpertOptionsSchema,
  ExpertOutputSchema,
  VulnerabilitySeveritySchema,
  VulnerabilitySchema,
  CodeChangeSchema,
  GeneratedTestSchema,
  CoverageMetricsSchema,
  EXPERT_DEFAULT_TEMPERATURES,
  EXPERT_DEFAULT_CAPABILITIES,
} from './expert-types.js';

// ============================================================================
// Specialized Expert Agents
// ============================================================================

// CodeExpert - Code generation, refactoring, optimization, debugging
export { CodeExpert, createCodeExpert, type CodeExpertOptions } from './code-expert.js';

// SecurityExpert - Security review, vulnerability detection, hardening
export {
  SecurityExpert,
  createSecurityExpert,
  type SecurityExpertOptions,
  type SecurityFocusArea,
} from './security-expert.js';

// ArchitectureExpert - System design, patterns, architecture decisions
export {
  ArchitectureExpert,
  createArchitectureExpert,
  type ArchitectureExpertOptions,
  type ArchitectureStyle,
  type QualityAttribute,
} from './architecture-expert.js';

// TestingExpert - Test generation, coverage analysis, quality assurance
export { TestingExpert, createTestingExpert, type TestingExpertOptions } from './testing-expert.js';

// DocumentationExpert - Documentation generation, API docs, README
export {
  DocumentationExpert,
  createDocumentationExpert,
  type DocumentationExpertOptions,
} from './documentation-expert.js';

// ============================================================================
// Expert Factory System (Dynamic Expert Creation)
// ============================================================================

// Configuration types and schemas
export {
  type ExpertConfig,
  type ModelPreference,
  type BuiltInExpertType,
  ExpertConfigSchema,
  ModelPreferenceSchema,
  BuiltInExpertTypeSchema,
  BUILT_IN_EXPERTS,
  EXPERT_TYPE_TO_ROLE,
  validateExpertConfig,
  safeValidateExpertConfig,
} from './expert-config.js';

// Factory for creating experts
export {
  ExpertFactory,
  Expert,
  FactoryError,
  createFromICTM,
  type CreateExpertOptions,
} from './expert-factory.js';

// Registry for managing experts
export {
  ExpertRegistry,
  RegistryError,
  getExpertRegistry,
  type RegisterOptions,
  type QueryOptions,
  type RegistryStats,
} from './expert-registry.js';

// Expert selection
export {
  selectExperts,
  quickSelect,
  createDefaultRegistry,
  resetDefaultRegistry,
  SelectionError,
  ExpertCollaborationPattern,
  type ExpertCollaborationPatternType,
  ScoreBreakdownSchema,
  ExpertMatchSchema,
  SelectionResultSchema,
  SelectionOptionsSchema,
  type ExpertDefinition,
  type ExpertMatch,
  type ScoreBreakdown,
  type SelectionResult,
  type SelectionOptions,
  type ExpertRegistry as SelectionExpertRegistry,
} from './expert-selector.js';
