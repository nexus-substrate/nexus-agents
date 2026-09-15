/**
 * nexus-agents CLI Server Feedback Integration
 *
 * Initializes the FeedbackIntegration the MCP server hands to
 * `delegate_to_model`. In this process it is an in-memory collector ONLY: the
 * server constructs no CompositeRouter at startup, so there is nothing to
 * attach, and the `router` option this module used to accept was never
 * supplied by its one caller (`cli-server.ts`) — removed in #4827 rather than
 * left looking wired. The live routing feedback loop closes inside
 * `CompositeRouter.executeTask` (`autoRecordFeedback`, #929) on the router the
 * expert bridge builds lazily, not through this module. Whether the server
 * should construct this instance at all is #6323.
 *
 * @module cli-server-feedback
 * (Source: Issue #490 - Wire FeedbackIntegration to production; #4827)
 */

import type { ILogger } from './core/logger.js';
import type { IFeedbackIntegration } from './learning/feedback-integration.js';
import {
  createFeedbackIntegration,
  type FeedbackIntegrationConfig,
} from './learning/feedback-integration.js';
import { getErrorMessage } from './core/index.js';

/**
 * Options for FeedbackIntegration initialization.
 */
export interface InitializeFeedbackOptions {
  /** Logger instance */
  readonly logger: ILogger;
  /** Optional custom configuration */
  readonly config?: Partial<FeedbackIntegrationConfig>;
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
 * No CompositeRouter is attached (see the module doc), so `enableAutoFeedback`
 * only governs the collector; `routeFeedbackToCompositeRouter` returns early
 * on every outcome in this process. The init log says so instead of reporting
 * a `hasRouter` that could only ever be false.
 *
 * @param options - Initialization options
 * @returns Result with initialized FeedbackIntegration
 */
export function initializeFeedbackIntegration(
  options: InitializeFeedbackOptions
): FeedbackInitResult {
  const { logger, config } = options;

  try {
    // Create FeedbackIntegration instance
    globalFeedbackIntegration = createFeedbackIntegration({
      enableAutoFeedback: true, // Enable automatic feedback collection
      ...config,
      logger,
    });

    logger.info(
      'FeedbackIntegration initialized (in-memory collector; no CompositeRouter attached)',
      {
        enableAutoFeedback: config?.enableAutoFeedback ?? true,
      }
    );

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
