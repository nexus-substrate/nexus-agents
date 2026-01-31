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
} from './shared-task-analyzer.js';

export { SharedTaskAnalyzer, createSharedTaskAnalyzer } from './shared-task-analyzer.js';

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
