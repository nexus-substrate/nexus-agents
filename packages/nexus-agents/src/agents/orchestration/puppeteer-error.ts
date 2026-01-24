/**
 * Puppeteer Orchestration Error Types
 *
 * Error classes for Puppeteer orchestration failures.
 *
 * @module agents/orchestration/puppeteer-error
 * (Source: Issue #335, Issue #404)
 */

import { StepExecutionError } from './puppeteer-step-execution.js';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error class for orchestration failures.
 */
export class PuppeteerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PuppeteerError';
    Object.setPrototypeOf(this, PuppeteerError.prototype);
  }

  /**
   * Create from a StepExecutionError.
   */
  static fromStepError(stepError: StepExecutionError): PuppeteerError {
    return new PuppeteerError(stepError.message, stepError.code, stepError.context);
  }
}
