/**
 * nexus-agents/workflows - AFlow Generator Types
 *
 * Error types and interfaces for AFlow workflow generation.
 *
 * @module workflows/aflow/aflow-generator-types
 * (Source: Issue #329, arXiv:2410.10762)
 */

/**
 * Error codes for AFlow generation.
 */
export type AFlowErrorCode =
  | 'INVALID_CONFIG'
  | 'NO_VALID_ACTIONS'
  | 'SEARCH_FAILED'
  | 'TIMEOUT'
  | 'MIN_STEPS_NOT_MET';

/**
 * Error class for AFlow generation failures.
 */
export class AFlowError extends Error {
  constructor(
    message: string,
    public readonly code: AFlowErrorCode
  ) {
    super(message);
    this.name = 'AFlowError';
  }
}
