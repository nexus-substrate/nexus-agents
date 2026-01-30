/**
 * nexus-agents/core/task-analysis - Task Analysis Module
 *
 * Provides task classification and analysis utilities used by routing
 * and protocol selection layers.
 *
 * @module core/task-analysis
 */

export {
  TaskTypeClassifier,
  createTaskTypeClassifier,
  type TaskType,
  type ClassificationResult,
  type ClassificationSignal,
  type TaskTypeClassifierConfig,
} from './task-type-classifier.js';
