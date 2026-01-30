/**
 * Task Type Classifier
 *
 * @deprecated Import from 'nexus-agents/core' instead.
 * This file re-exports from core/task-analysis for backward compatibility.
 *
 * @module agents/collaboration/task-type-classifier
 */

// Re-export everything from core for backward compatibility
export {
  TaskTypeClassifier,
  createTaskTypeClassifier,
  type TaskType,
  type ClassificationResult,
  type ClassificationSignal,
  type TaskTypeClassifierConfig,
} from '../../core/task-analysis/index.js';
