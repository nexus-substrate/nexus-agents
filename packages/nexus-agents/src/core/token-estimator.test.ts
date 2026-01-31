/**
 * nexus-agents/core - Token Estimator Tests
 *
 * @module core/token-estimator.test
 * (Source: Issue #574 - Router consolidation)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TokenEstimator,
  getTokenEstimator,
  createTokenEstimator,
  resetTokenEstimator,
  estimateTokens,
  estimateTokensForProvider,
  type TokenEstimatorProvider,
  type ITokenEstimator,
} from './token-estimator.js';

describe('TokenEstimator', () => {
  let estimator: ITokenEstimator;

  beforeEach(() => {
    estimator = new TokenEstimator();
  });

  describe('estimateText', () => {
    it('should estimate tokens for generic provider (~4 chars/token)', () => {
      const text = 'Hello world'; // 11 chars
      const tokens = estimator.estimateText(text);
      expect(tokens).toBe(Math.ceil(11 / 4)); // 3 tokens
    });

    it('should estimate tokens for Claude provider (~3.5 chars/token)', () => {
      const text = 'Hello world'; // 11 chars
      const tokens = estimator.estimateText(text, 'claude');
      expect(tokens).toBe(Math.ceil(11 / 3.5)); // 4 tokens
    });

    it('should estimate tokens for OpenAI provider (~4 chars/token)', () => {
      const text = 'Hello world'; // 11 chars
      const tokens = estimator.estimateText(text, 'openai');
      expect(tokens).toBe(Math.ceil(11 / 4)); // 3 tokens
    });

    it('should estimate tokens for Gemini provider (~4 chars/token)', () => {
      const text = 'Hello world'; // 11 chars
      const tokens = estimator.estimateText(text, 'gemini');
      expect(tokens).toBe(Math.ceil(11 / 4)); // 3 tokens
    });

    it('should handle empty string', () => {
      const tokens = estimator.estimateText('');
      expect(tokens).toBe(0);
    });

    it('should handle long text', () => {
      const text = 'a'.repeat(1000);
      const tokens = estimator.estimateText(text);
      expect(tokens).toBe(250); // 1000 / 4
    });
  });

  describe('estimateTask', () => {
    it('should estimate input and output tokens', () => {
      const description = 'Write a function that adds two numbers';
      const estimate = estimator.estimateTask(description);

      expect(estimate.input).toBeGreaterThan(0);
      expect(estimate.output).toBeGreaterThan(0);
      expect(estimate.total).toBe(estimate.input + estimate.output);
      expect(estimate.provider).toBe('generic');
    });

    it('should use default output multiplier of 0.5', () => {
      const description = 'a'.repeat(100); // 100 chars = 25 tokens
      const estimate = estimator.estimateTask(description);

      expect(estimate.input).toBe(25);
      expect(estimate.output).toBe(13); // ceil(25 * 0.5)
    });

    it('should use custom output multiplier', () => {
      const description = 'a'.repeat(100); // 100 chars = 25 tokens
      const estimate = estimator.estimateTask(description, {
        outputMultiplier: 2.0,
      });

      expect(estimate.input).toBe(25);
      expect(estimate.output).toBe(50); // 25 * 2.0
    });

    it('should use fixed output when specified', () => {
      const description = 'a'.repeat(100);
      const estimate = estimator.estimateTask(description, {
        fixedOutput: 1000,
      });

      expect(estimate.output).toBe(1000);
    });

    it('should use specified provider', () => {
      const description = 'a'.repeat(100);
      const estimate = estimator.estimateTask(description, {
        provider: 'claude',
      });

      expect(estimate.provider).toBe('claude');
      expect(estimate.input).toBe(Math.ceil(100 / 3.5)); // 29 tokens
    });
  });

  describe('getCharsPerToken', () => {
    it('should return correct ratio for each provider', () => {
      expect(estimator.getCharsPerToken('claude')).toBe(3.5);
      expect(estimator.getCharsPerToken('openai')).toBe(4.0);
      expect(estimator.getCharsPerToken('gemini')).toBe(4.0);
      expect(estimator.getCharsPerToken('generic')).toBe(4.0);
    });

    it('should return default ratio when no provider specified', () => {
      expect(estimator.getCharsPerToken()).toBe(4.0);
    });
  });

  describe('constructor with default provider', () => {
    it('should use specified default provider', () => {
      const claudeEstimator = new TokenEstimator('claude');
      const text = 'a'.repeat(100);

      const tokens = claudeEstimator.estimateText(text);
      expect(tokens).toBe(Math.ceil(100 / 3.5)); // Uses Claude ratio
    });
  });
});

describe('Token estimator factory functions', () => {
  afterEach(() => {
    resetTokenEstimator();
  });

  describe('getTokenEstimator', () => {
    it('should return shared instance', () => {
      const instance1 = getTokenEstimator();
      const instance2 = getTokenEstimator();
      expect(instance1).toBe(instance2);
    });

    it('should return functional estimator', () => {
      const estimator = getTokenEstimator();
      const tokens = estimator.estimateText('test');
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('createTokenEstimator', () => {
    it('should create new instance each time', () => {
      const instance1 = createTokenEstimator();
      const instance2 = createTokenEstimator();
      expect(instance1).not.toBe(instance2);
    });

    it('should accept default provider', () => {
      const claudeEstimator = createTokenEstimator('claude');
      const tokens = claudeEstimator.estimateText('a'.repeat(35));
      expect(tokens).toBe(10); // 35 / 3.5 = 10
    });
  });

  describe('resetTokenEstimator', () => {
    it('should reset shared instance', () => {
      const instance1 = getTokenEstimator();
      resetTokenEstimator();
      const instance2 = getTokenEstimator();
      expect(instance1).not.toBe(instance2);
    });
  });
});

describe('Quick estimation functions', () => {
  afterEach(() => {
    resetTokenEstimator();
  });

  describe('estimateTokens', () => {
    it('should estimate tokens using generic provider', () => {
      const tokens = estimateTokens('Hello world');
      expect(tokens).toBe(3); // 11 / 4 = 2.75 -> 3
    });
  });

  describe('estimateTokensForProvider', () => {
    it('should estimate tokens for specified provider', () => {
      const claudeTokens = estimateTokensForProvider('Hello world', 'claude');
      const openaiTokens = estimateTokensForProvider('Hello world', 'openai');

      // Claude has lower chars/token, so more tokens
      expect(claudeTokens).toBeGreaterThanOrEqual(openaiTokens);
    });

    it('should work with all providers', () => {
      const providers: TokenEstimatorProvider[] = ['claude', 'openai', 'gemini', 'generic'];

      for (const provider of providers) {
        const tokens = estimateTokensForProvider('test', provider);
        expect(tokens).toBeGreaterThan(0);
      }
    });
  });
});
