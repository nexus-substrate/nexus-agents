/**
 * Tests for CLI Server Feedback Integration
 *
 * @module cli-server-feedback.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ILogger } from './core/logger.js';
import type { IFeedbackIntegration } from './learning/feedback-integration.js';

// Mock the learning/feedback-integration module
vi.mock('./learning/feedback-integration.js', () => ({
  createFeedbackIntegration: vi.fn(),
}));

import { createFeedbackIntegration } from './learning/feedback-integration.js';
import {
  initializeFeedbackIntegration,
  getFeedbackIntegration,
  isFeedbackInitialized,
  resetFeedbackIntegration,
} from './cli-server-feedback.js';

function createMockLogger(): ILogger {
  const mock = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
  return mock;
}

function createMockFeedbackIntegration(): IFeedbackIntegration {
  const mock = {
    recordRoutingDecision: vi.fn(),
    recordStepOutcome: vi.fn(),
    recordOutcome: vi.fn(),
    getStats: vi.fn(),
    onOutcomeProcessed: vi.fn(),
  } as unknown as IFeedbackIntegration;
  return mock;
}

describe('cli-server-feedback', () => {
  afterEach(() => {
    resetFeedbackIntegration();
    vi.clearAllMocks();
  });

  describe('initializeFeedbackIntegration', () => {
    it('should create instance when called', () => {
      const mockLogger = createMockLogger();
      const mockInstance = createMockFeedbackIntegration();
      vi.mocked(createFeedbackIntegration).mockReturnValue(mockInstance);

      const result = initializeFeedbackIntegration({ logger: mockLogger });

      expect(result.initialized).toBe(true);
      expect(result.feedbackIntegration).toBe(mockInstance);
      expect(result.reason).toBe('FeedbackIntegration created successfully');
      expect(createFeedbackIntegration).toHaveBeenCalledWith({
        enableAutoFeedback: true,
        logger: mockLogger,
      });
    });

    it('should return initialized: false on error', () => {
      const mockLogger = createMockLogger();
      vi.mocked(createFeedbackIntegration).mockImplementation(() => {
        throw new Error('creation failed');
      });

      const result = initializeFeedbackIntegration({ logger: mockLogger });

      expect(result.initialized).toBe(false);
      expect(result.feedbackIntegration).toBeUndefined();
      expect(result.reason).toBe('Initialization failed: creation failed');
      expect(mockLogger.warn).toHaveBeenCalledWith('FeedbackIntegration initialization failed', {
        error: 'creation failed',
      });
    });

    it('should handle non-Error thrown values', () => {
      const mockLogger = createMockLogger();
      vi.mocked(createFeedbackIntegration).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error, no-throw-literal -- testing String(error) branch
        throw 'string error';
      });

      const result = initializeFeedbackIntegration({ logger: mockLogger });

      expect(result.initialized).toBe(false);
      expect(result.reason).toBe('Initialization failed: string error');
    });

    it('should merge custom config with defaults', () => {
      const mockLogger = createMockLogger();
      const mockInstance = createMockFeedbackIntegration();
      vi.mocked(createFeedbackIntegration).mockReturnValue(mockInstance);

      const customConfig = {
        enableAutoFeedback: false,
        successQualityThreshold: 0.9,
      };

      initializeFeedbackIntegration({
        logger: mockLogger,
        config: customConfig,
      });

      expect(createFeedbackIntegration).toHaveBeenCalledWith({
        enableAutoFeedback: false,
        successQualityThreshold: 0.9,
        logger: mockLogger,
      });
    });

    it('logs that no CompositeRouter is attached instead of a hasRouter that is always false (#4827)', () => {
      const mockLogger = createMockLogger();
      const mockInstance = createMockFeedbackIntegration();
      vi.mocked(createFeedbackIntegration).mockReturnValue(mockInstance);

      initializeFeedbackIntegration({ logger: mockLogger });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'FeedbackIntegration initialized (in-memory collector; no CompositeRouter attached)',
        { enableAutoFeedback: true }
      );
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        'FeedbackIntegration attached to CompositeRouter'
      );
    });
  });

  describe('getFeedbackIntegration', () => {
    it('should return undefined when not initialized', () => {
      expect(getFeedbackIntegration()).toBeUndefined();
    });

    it('should return instance when initialized', () => {
      const mockLogger = createMockLogger();
      const mockInstance = createMockFeedbackIntegration();
      vi.mocked(createFeedbackIntegration).mockReturnValue(mockInstance);

      initializeFeedbackIntegration({ logger: mockLogger });

      expect(getFeedbackIntegration()).toBe(mockInstance);
    });
  });

  describe('isFeedbackInitialized', () => {
    it('should return false initially', () => {
      expect(isFeedbackInitialized()).toBe(false);
    });

    it('should return true after initialization', () => {
      const mockLogger = createMockLogger();
      const mockInstance = createMockFeedbackIntegration();
      vi.mocked(createFeedbackIntegration).mockReturnValue(mockInstance);

      initializeFeedbackIntegration({ logger: mockLogger });

      expect(isFeedbackInitialized()).toBe(true);
    });

    it('should return false after failed initialization', () => {
      const mockLogger = createMockLogger();
      vi.mocked(createFeedbackIntegration).mockImplementation(() => {
        throw new Error('fail');
      });

      initializeFeedbackIntegration({ logger: mockLogger });

      expect(isFeedbackInitialized()).toBe(false);
    });
  });

  describe('resetFeedbackIntegration', () => {
    it('should clear singleton', () => {
      const mockLogger = createMockLogger();
      const mockInstance = createMockFeedbackIntegration();
      vi.mocked(createFeedbackIntegration).mockReturnValue(mockInstance);

      initializeFeedbackIntegration({ logger: mockLogger });
      expect(isFeedbackInitialized()).toBe(true);

      resetFeedbackIntegration();

      expect(isFeedbackInitialized()).toBe(false);
      expect(getFeedbackIntegration()).toBeUndefined();
    });
  });
});
