/**
 * Forest-of-Thought Error Types
 * @module agents/reasoning/forest-engine-errors
 */

import { AgentError } from '../../core/index.js';

/** Error thrown when Forest execution fails. */
export class ForestExecutionError extends AgentError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, options);
    this.name = 'ForestExecutionError';
  }
}

/** Error thrown when no adapter is available for Forest execution. */
export class ForestAdapterUnavailableError extends ForestExecutionError {
  constructor(reason: string) {
    super(
      `Forest execution requires a model adapter: ${reason}. ` +
        'Forest-of-Thought cannot run without LLM inference capability.'
    );
    this.name = 'ForestAdapterUnavailableError';
  }
}
