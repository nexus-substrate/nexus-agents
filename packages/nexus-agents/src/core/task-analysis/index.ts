/**
 * nexus-agents/core/task-analysis - Task Analysis Module
 *
 * Provides task classification and analysis utilities used by routing
 * and protocol selection layers.
 *
 * @module core/task-analysis
 */

// Legacy reasoning/knowledge classifier (use SharedTaskAnalyzer for new code)
export {
  TaskTypeClassifier,
  createTaskTypeClassifier,
  type TaskType,
  type ClassificationResult,
  type ClassificationSignal,
  type TaskTypeClassifierConfig,
} from './task-type-classifier.js';

// Unified task analyzer (ADR-0004 - consolidates 5 independent analyzers)
export type {
  ISharedTaskAnalyzer,
  TaskAnalysisResult,
  SharedTaskAnalyzerConfig,
  ReasoningKnowledgeType,
  ComplexityLevel,
  TaskTypeCategory,
  TaskCapabilities,
  TaskConstraints,
  RequiredCapabilities,
} from './shared-task-analyzer.js';

export { SharedTaskAnalyzer, createSharedTaskAnalyzer } from './shared-task-analyzer.js';

// Advocate analysis functions (Issue #903)
export {
  computeAmbiguityScore,
  extractConstraints,
  inferRequiredCapabilities,
} from './task-analysis-advocate.js';

// Capability gap detection (Issue #906)
export type {
  CapabilityGapReport,
  CapabilityGap,
  AvailableCapabilities,
} from './capability-gap-detector.js';
export {
  detectCapabilityGaps,
  getAvailableToolCount,
  getAvailableExpertCount,
} from './capability-gap-detector.js';

// Capability gap ledger — aggregates discarded gap reports into a build backlog (#3555)
export {
  createCapabilityGapLedger,
  getGapLedger,
  setGapLedger,
  resetGapLedger,
  recordRoutingGaps,
} from './capability-gap-ledger.js';
export type { ICapabilityGapLedger, GapSummary, GapContext } from './capability-gap-ledger.js';

// Task profile adapter for legacy compatibility (Issue #586)
export type { TaskProfile, BanditContext } from './task-profile-adapter.js';
export {
  taskAnalysisResultToTaskProfile,
  taskAnalysisResultToBanditContext,
  summarizeTaskProfile,
} from './task-profile-adapter.js';

// Expert selector adapter for legacy compatibility (ADR-0004, Issue #593)
export type {
  ExpertTaskDomain,
  ExpertTaskComplexity,
  ExpertTaskAnalysisResult,
} from './task-profile-adapter.js';
export { toExpertTaskAnalysisResult } from './task-profile-adapter.js';
