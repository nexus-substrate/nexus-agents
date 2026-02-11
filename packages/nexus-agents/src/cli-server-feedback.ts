/**
 * nexus-agents CLI Server Feedback Integration
 *
 * Initializes FeedbackIntegration for closed-loop learning.
 * Connects routing decisions to outcome feedback.
 *
 * @module cli-server-feedback
 * (Source: Issue #490 - Wire FeedbackIntegration to production)
 */

import type { ILogger } from './core/logger.js';
import type { IFeedbackIntegration } from './learning/feedback-integration.js';
import {
  FeedbackIntegration,
  createFeedbackIntegration,
  type FeedbackIntegrationConfig,
} from './learning/feedback-integration.js';
import type { ICompositeRouter } from './cli-adapters/composite-router.js';
import { getErrorMessage } from './core/index.js';

/**
 * Options for FeedbackIntegration initialization.
 */
export interface InitializeFeedbackOptions {
  /** Logger instance */
  readonly logger: ILogger;
  /** Optional custom configuration */
  readonly config?: Partial<FeedbackIntegrationConfig>;
  /** Optional CompositeRouter to attach */
  readonly router?: ICompositeRouter;
}

/**
 * Result of FeedbackIntegration initialization.
 */
export interface FeedbackInitResult {
  /** Whether initialization succeeded */
  readonly initialized: boolean;
  /** The FeedbackIntegration instance (if initialized) */
  readonly feedbackIntegration?: IFeedbackIntegration;
  /** Reason for initialization result */
  readonly reason: string;
}

// Module-level state
let globalFeedbackIntegration: IFeedbackIntegration | undefined;

/**
 * Initializes FeedbackIntegration for production use.
 * Creates a singleton instance that can be accessed via getFeedbackIntegration().
 *
 * @param options - Initialization options
 * @returns Result with initialized FeedbackIntegration
 */
export function initializeFeedbackIntegration(
  options: InitializeFeedbackOptions
): FeedbackInitResult {
  const { logger, config, router } = options;

  try {
    // Create FeedbackIntegration instance
    globalFeedbackIntegration = createFeedbackIntegration({
      enableAutoFeedback: true, // Enable automatic feedback collection
      ...config,
      logger,
    });

    // Attach CompositeRouter if provided
    if (router !== undefined && globalFeedbackIntegration instanceof FeedbackIntegration) {
      globalFeedbackIntegration.registerCompositeRouter(router);
      logger.debug('FeedbackIntegration attached to CompositeRouter');
    }

    logger.info('FeedbackIntegration initialized', {
      enableAutoFeedback: config?.enableAutoFeedback ?? true,
      hasRouter: router !== undefined,
    });

    return {
      initialized: true,
      feedbackIntegration: globalFeedbackIntegration,
      reason: 'FeedbackIntegration created successfully',
    };
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn('FeedbackIntegration initialization failed', { error: message });

    return {
      initialized: false,
      reason: `Initialization failed: ${message}`,
    };
  }
}

/**
 * Gets the global FeedbackIntegration instance.
 * Returns undefined if not initialized.
 */
export function getFeedbackIntegration(): IFeedbackIntegration | undefined {
  return globalFeedbackIntegration;
}

/**
 * Checks if FeedbackIntegration is initialized.
 */
export function isFeedbackInitialized(): boolean {
  return globalFeedbackIntegration !== undefined;
}

/**
 * Resets FeedbackIntegration state (for testing).
 */
export function resetFeedbackIntegration(): void {
  globalFeedbackIntegration = undefined;
}
