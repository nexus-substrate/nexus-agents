/**
 * Tests for confidence-aware cascade router.
 * (Source: Issue #99 - SATER pattern, arXiv:2510.05164)
 */

/* eslint-disable @typescript-eslint/no-deprecated -- Testing deprecated router scheduled for v3.0 removal */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfidenceRouter, createConfidenceRouter } from './confidence-router.js';
import type { CliTask, CliResponse, CliName, ICliAdapter, CapabilityProfile } from './types.js';

// Default capability profile for mocks
const defaultCapabilities: CapabilityProfile = {
  reasoning: 8,
  contextWindow: 200_000,
  codeGeneration: 8,
  speed: 8,
  cost: 8,
};

// Mock adapter factory
function createMockAdapter(name: CliName, response: CliResponse): ICliAdapter {
  return {
    name,
    transport: 'subprocess',
    capabilities: defaultCapabilities,
    execute: vi.fn().mockResolvedValue({ ok: true, value: response }),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      version: '1.0.0',
      versionStatus: 'supported' as const,
      lastChecked: new Date(),
    }),
    getCapacity: vi.fn().mockResolvedValue({
      remainingTokens: 100000,
      remainingRequests: 100,
      resetTime: new Date(),
      utilizationPercent: 0,
      exhausted: false,
    }),
    getVersion: vi.fn().mockResolvedValue('1.0.0'),
    getModelInfo: vi.fn().mockReturnValue({
      id: `${name}-model`,
      name: `${name} Model`,
      contextWindow: 200000,
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

// Sample tasks
const simpleTask: CliTask = {
  content: 'Write a hello world function',
};

const complexTask: CliTask = {
  content:
    'Design a distributed system architecture for handling millions of requests with optimized performance and security considerations',
};

// Sample responses
const highConfidenceResponse: CliResponse = {
  text: `Here is the implementation:

\`\`\`typescript
function helloWorld(): void {
  console.log("Hello, World!");
}
\`\`\`

This function:
1. Takes no parameters
2. Prints "Hello, World!" to the console
3. Returns void

You can call it like this: \`helloWorld();\``,
  model: 'gemini-flash',
  usage: { inputTokens: 10, outputTokens: 50 },
  durationMs: 500,
};

const lowConfidenceResponse: CliResponse = {
  text: `I think this might work, but I'm not sure. Maybe you could try something like this? It's probably correct, although I'm uncertain about some edge cases. However, there might be alternatives...`,
  model: 'gemini-flash',
  usage: { inputTokens: 10, outputTokens: 30 },
  durationMs: 300,
};

const veryShortResponse: CliResponse = {
  text: 'Done.',
  model: 'gemini-flash',
  usage: { inputTokens: 10, outputTokens: 2 },
  durationMs: 100,
};

describe('ConfidenceRouter', () => {
  let router: ConfidenceRouter;
  let mockGemini: ICliAdapter;
  let mockClaude: ICliAdapter;
  let adapters: Map<CliName, ICliAdapter>;

  beforeEach(() => {
    mockGemini = createMockAdapter('gemini', highConfidenceResponse);
    mockClaude = createMockAdapter('claude', highConfidenceResponse);
    adapters = new Map([
      ['gemini', mockGemini],
      ['claude', mockClaude],
    ]);
    router = new ConfidenceRouter(adapters);
  });

  describe('estimateConfidence', () => {
    it('should return high confidence for well-structured responses', () => {
      const confidence = router.estimateConfidence(simpleTask, highConfidenceResponse);
      expect(confidence.score).toBeGreaterThan(0.7);
      expect(confidence.shouldEscalate).toBe(false);
    });

    it('should return low confidence for hedging responses', () => {
      const confidence = router.estimateConfidence(simpleTask, lowConfidenceResponse);
      expect(confidence.score).toBeLessThan(0.7);
      expect(confidence.shouldEscalate).toBe(true);
      expect(confidence.reason).toContain('hedging');
    });

    it('should penalize very short responses via length factor', () => {
      const confidence = router.estimateConfidence(simpleTask, veryShortResponse);
      // Length factor should be significantly penalized for very short responses
      expect(confidence.factors.lengthFactor).toBeLessThan(0.5);
      // But overall score may still be acceptable due to other factors
      // (no hedging, no uncertainty in "Done.")
      expect(confidence.score).toBeLessThan(0.8);
    });

    it('should include confidence factors breakdown', () => {
      const confidence = router.estimateConfidence(simpleTask, highConfidenceResponse);
      expect(confidence.factors).toHaveProperty('lengthFactor');
      expect(confidence.factors).toHaveProperty('hedgingFactor');
      expect(confidence.factors).toHaveProperty('structureFactor');
      expect(confidence.factors).toHaveProperty('uncertaintyFactor');
    });

    it('should detect structured elements (code blocks, lists)', () => {
      const confidence = router.estimateConfidence(simpleTask, highConfidenceResponse);
      expect(confidence.factors.structureFactor).toBeGreaterThan(0.6);
    });
  });

  describe('shouldEscalate', () => {
    it('should return true when confidence below threshold', () => {
      const lowConfidence = {
        score: 0.5,
        factors: {
          lengthFactor: 0.5,
          hedgingFactor: 0.5,
          structureFactor: 0.5,
          uncertaintyFactor: 0.5,
        },
        shouldEscalate: true,
        reason: 'test',
      };
      expect(router.shouldEscalate(lowConfidence, 0.7)).toBe(true);
    });

    it('should return false when confidence above threshold', () => {
      const highConfidence = {
        score: 0.9,
        factors: {
          lengthFactor: 1.0,
          hedgingFactor: 1.0,
          structureFactor: 1.0,
          uncertaintyFactor: 1.0,
        },
        shouldEscalate: false,
        reason: 'test',
      };
      expect(router.shouldEscalate(highConfidence, 0.7)).toBe(false);
    });

    it('should return false when confidence equals threshold', () => {
      const borderConfidence = {
        score: 0.7,
        factors: {
          lengthFactor: 0.7,
          hedgingFactor: 0.7,
          structureFactor: 0.7,
          uncertaintyFactor: 0.7,
        },
        shouldEscalate: false,
        reason: 'test',
      };
      expect(router.shouldEscalate(borderConfidence, 0.7)).toBe(false);
    });
  });

  describe('executeWithCascade', () => {
    it('should return fast model response when confidence is high', async () => {
      const result = await router.executeWithCascade(simpleTask);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.escalated).toBe(false);
        expect(result.value.modelsUsed).toEqual(['gemini']);
        expect(mockGemini.execute).toHaveBeenCalledTimes(1);
        expect(mockClaude.execute).not.toHaveBeenCalled();
      }
    });

    it('should escalate to expensive model when confidence is low', async () => {
      mockGemini = createMockAdapter('gemini', lowConfidenceResponse);
      adapters.set('gemini', mockGemini);
      router = new ConfidenceRouter(adapters);

      const result = await router.executeWithCascade(simpleTask);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.escalated).toBe(true);
        expect(result.value.escalationCount).toBe(1);
        expect(result.value.modelsUsed).toContain('gemini');
        expect(result.value.modelsUsed).toContain('claude');
        expect(mockClaude.execute).toHaveBeenCalled();
      }
    });

    it('should track confidence history through cascade', async () => {
      mockGemini = createMockAdapter('gemini', lowConfidenceResponse);
      adapters.set('gemini', mockGemini);
      router = new ConfidenceRouter(adapters);

      const result = await router.executeWithCascade(simpleTask);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidenceHistory.length).toBe(2);
        expect(result.value.confidenceHistory[0]!.score).toBeLessThan(0.7);
      }
    });

    it('should use custom threshold when provided', async () => {
      // With very high threshold, even good responses should escalate
      mockGemini = createMockAdapter('gemini', highConfidenceResponse);
      adapters.set('gemini', mockGemini);
      router = new ConfidenceRouter(adapters);

      const result = await router.executeWithCascade(simpleTask, {
        confidenceThreshold: 0.99,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.escalated).toBe(true);
      }
    });

    it('should return error when fast model adapter not available', async () => {
      adapters.delete('gemini');
      router = new ConfidenceRouter(adapters);

      const result = await router.executeWithCascade(simpleTask);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should return error when expensive model adapter not available', async () => {
      mockGemini = createMockAdapter('gemini', lowConfidenceResponse);
      adapters.set('gemini', mockGemini);
      adapters.delete('claude');
      router = new ConfidenceRouter(adapters);

      const result = await router.executeWithCascade(simpleTask);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should use custom models when provided', async () => {
      const mockCodex = createMockAdapter('codex', highConfidenceResponse);
      adapters.set('codex', mockCodex);
      router = new ConfidenceRouter(adapters);

      const result = await router.executeWithCascade(simpleTask, {
        fastModel: 'codex',
        expensiveModel: 'claude',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.modelsUsed).toContain('codex');
        expect(mockCodex.execute).toHaveBeenCalled();
      }
    });

    it('should measure total duration', async () => {
      const result = await router.executeWithCascade(simpleTask);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.totalDurationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('caching', () => {
    it('should cache responses when enabled', async () => {
      await router.executeWithCascade(simpleTask, { cacheResponses: true });
      await router.executeWithCascade(simpleTask, { cacheResponses: true });

      // Second call should hit cache, not call adapter
      expect(mockGemini.execute).toHaveBeenCalledTimes(1);
    });

    it('should not cache when disabled', async () => {
      await router.executeWithCascade(simpleTask, { cacheResponses: false });
      await router.executeWithCascade(simpleTask, { cacheResponses: false });

      expect(mockGemini.execute).toHaveBeenCalledTimes(2);
    });

    it('should return cache stats', () => {
      const stats = router.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('maxAgeMs');
    });

    it('should clear cache', async () => {
      await router.executeWithCascade(simpleTask, { cacheResponses: true });
      expect(router.getCacheStats().size).toBe(1);

      router.clearCache();
      expect(router.getCacheStats().size).toBe(0);
    });
  });

  describe('task complexity estimation', () => {
    it('should estimate simple tasks correctly', () => {
      const confidence = router.estimateConfidence(simpleTask, highConfidenceResponse);
      // Simple tasks should have appropriate length expectations
      expect(confidence.factors.lengthFactor).toBeGreaterThan(0);
    });

    it('should estimate complex tasks correctly', () => {
      const longResponse: CliResponse = {
        text: `# Distributed System Architecture

## Overview
This document outlines a comprehensive distributed system architecture designed to handle millions of requests.

## Key Components
1. **Load Balancer**: Distributes incoming traffic across multiple servers
2. **API Gateway**: Handles authentication, rate limiting, and request routing
3. **Microservices**: Modular services for different business domains
4. **Message Queue**: Asynchronous communication between services
5. **Database Cluster**: Distributed database with replication

## Security Considerations
- TLS encryption for all communications
- JWT-based authentication
- Rate limiting at multiple levels
- Input validation and sanitization

## Performance Optimizations
- Caching at multiple levels (CDN, application, database)
- Connection pooling
- Async I/O throughout the stack
- Horizontal auto-scaling based on load

## Conclusion
This architecture provides a scalable, secure, and performant foundation for high-traffic applications.`,
        model: 'claude',
        usage: { inputTokens: 50, outputTokens: 200 },
        durationMs: 1000,
      };
      const confidence = router.estimateConfidence(complexTask, longResponse);
      expect(confidence.factors.lengthFactor).toBeGreaterThan(0.7);
    });
  });

  describe('createConfidenceRouter', () => {
    it('should create a ConfidenceRouter instance', () => {
      const router = createConfidenceRouter(adapters);
      expect(router).toBeInstanceOf(ConfidenceRouter);
    });
  });
});
