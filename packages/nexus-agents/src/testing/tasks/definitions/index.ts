/**
 * nexus-agents/testing/tasks/definitions - Task Definition Exports
 *
 * Exports all 15 evaluation task definitions and the combined array.
 */

import type { EvaluationTask } from '../task-types.js';

// Export all individual task definitions
export { TASK_001_SIMPLE_FUNCTION } from './task-001.js';
export { TASK_002_ALGORITHM_DESIGN } from './task-002.js';
export { TASK_003_CODEBASE_ANALYSIS } from './task-003.js';
export { TASK_004_TEST_GENERATION } from './task-004.js';
export { TASK_005_ARCHITECTURE_DECISION } from './task-005.js';
export { TASK_006_REFACTORING } from './task-006.js';
export { TASK_007_DEBUGGING } from './task-007.js';
export { TASK_008_DOCUMENTATION } from './task-008.js';
export { TASK_009_PERFORMANCE } from './task-009.js';
export { TASK_010_ERROR_HANDLING } from './task-010.js';
export { TASK_011_API_DESIGN } from './task-011.js';
export { TASK_012_CONCURRENCY } from './task-012.js';
export { TASK_013_SCHEMA_MIGRATION } from './task-013.js';
export { TASK_014_SECURITY_REVIEW } from './task-014.js';
export { TASK_015_INTEGRATION } from './task-015.js';

// Import for array construction
import { TASK_001_SIMPLE_FUNCTION } from './task-001.js';
import { TASK_002_ALGORITHM_DESIGN } from './task-002.js';
import { TASK_003_CODEBASE_ANALYSIS } from './task-003.js';
import { TASK_004_TEST_GENERATION } from './task-004.js';
import { TASK_005_ARCHITECTURE_DECISION } from './task-005.js';
import { TASK_006_REFACTORING } from './task-006.js';
import { TASK_007_DEBUGGING } from './task-007.js';
import { TASK_008_DOCUMENTATION } from './task-008.js';
import { TASK_009_PERFORMANCE } from './task-009.js';
import { TASK_010_ERROR_HANDLING } from './task-010.js';
import { TASK_011_API_DESIGN } from './task-011.js';
import { TASK_012_CONCURRENCY } from './task-012.js';
import { TASK_013_SCHEMA_MIGRATION } from './task-013.js';
import { TASK_014_SECURITY_REVIEW } from './task-014.js';
import { TASK_015_INTEGRATION } from './task-015.js';

/**
 * All evaluation tasks in order.
 *
 * Contains 15 tasks covering various capabilities:
 * - Code generation (simple to complex)
 * - Algorithm design
 * - Codebase analysis
 * - Test generation
 * - Architecture decisions
 * - Refactoring
 * - Debugging
 * - Documentation
 * - Performance optimization
 * - Error handling
 * - API design
 * - Concurrency
 * - Schema migration
 * - Security review
 * - Integration patterns
 */
export const EVALUATION_TASKS: readonly EvaluationTask[] = [
  TASK_001_SIMPLE_FUNCTION,
  TASK_002_ALGORITHM_DESIGN,
  TASK_003_CODEBASE_ANALYSIS,
  TASK_004_TEST_GENERATION,
  TASK_005_ARCHITECTURE_DECISION,
  TASK_006_REFACTORING,
  TASK_007_DEBUGGING,
  TASK_008_DOCUMENTATION,
  TASK_009_PERFORMANCE,
  TASK_010_ERROR_HANDLING,
  TASK_011_API_DESIGN,
  TASK_012_CONCURRENCY,
  TASK_013_SCHEMA_MIGRATION,
  TASK_014_SECURITY_REVIEW,
  TASK_015_INTEGRATION,
] as const;
