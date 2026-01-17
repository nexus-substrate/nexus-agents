/**
 * nexus-agents/mcp/safety - STPA Safety Analysis Framework
 *
 * System-Theoretic Process Analysis (STPA) framework for analyzing
 * MCP tool safety, identifying hazards, and generating safety constraints.
 */

// Types
export {
  // Enums
  HazardCategory,
  HazardSeverity,
  HazardLikelihood,
  UnsafeControlActionType,
  ConstraintEnforcement,
  ConstraintPriority,
  RiskLevel,
  // Interfaces
  type Hazard,
  type UnsafeControlAction,
  type TriggerPattern,
  type SafetyConstraint,
  type ToolAnalysisResult,
  type StpaAnalysisResult,
  type AnalysisSummary,
  type HazardInteraction,
  type AnalysisMetadata,
  type AnalysisConfiguration,
  type AnalysisConfigurationInput,
  type ToolDefinition,
  type ToolInputSchema,
  type PropertySchema,
  type ValidationResult,
  type ConstraintViolation,
  type ValidationWarning,
  // Constants
  DEFAULT_ANALYSIS_CONFIG,
  // Schemas
  HazardCategorySchema,
  ToolDefinitionSchema,
  AnalysisConfigurationSchema,
} from './stpa-types.js';

// Hazard Catalog
export {
  ToolCategory,
  classifyTool,
  classifyToolMultiple,
  getHazardsForTool,
  getTriggerPatternsForCategory,
  // Pre-defined hazards
  FILE_READ_HAZARDS,
  FILE_WRITE_HAZARDS,
  FILE_DELETE_HAZARDS,
  SHELL_EXECUTE_HAZARDS,
  NETWORK_HAZARDS,
  DATABASE_HAZARDS,
  AUTH_HAZARDS,
  ORCHESTRATION_HAZARDS,
  // Trigger patterns
  PATH_TRIGGER_PATTERNS,
  SHELL_TRIGGER_PATTERNS,
  NETWORK_TRIGGER_PATTERNS,
  // Catalog
  HAZARD_CATALOG,
} from './hazard-catalog.js';

// Analyzer
export {
  // Core functions
  analyzeToolForHazards,
  generateUnsafeControlActions,
  generateSafetyConstraints,
  validateToolAgainstConstraints,
  analyzeTools,
  // Error types
  StpaAnalysisError,
} from './stpa-analyzer.js';
