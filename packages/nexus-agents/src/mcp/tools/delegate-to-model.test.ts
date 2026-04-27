/**
 * nexus-agents/mcp - Delegate to Model Tool Tests
 *
 * Tests for the delegate_to_model MCP tool.
 * (Source: MCP Protocol 2025-11-25)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { RateLimiter } from '../middleware/index.js';
import type { ICompositeRouter } from '../../core/index.js';
import type { IFeedbackIntegration } from '../../learning/feedback-integration.js';
import {
  registerDelegateToModelTool,
  DelegateInputSchema,
  MODEL_CAPABILITIES,
  _testing,
  type DelegateOutput,
} from './delegate-to-model.js';

const { analyzeTask, scoreModel, selectModel } = _testing;

/**
 * Creates a permissive rate limiter for tests.
 */
function createTestRateLimiter(): RateLimiter {
  return new RateLimiter({
    capacity: 1000,
    refillRate: 1000,
    refillIntervalMs: 1000,
  });
}

describe('delegate_to_model Tool', () => {
  describe('DelegateInputSchema validation', () => {
    it('should accept valid input with task only', () => {
      const input = { task: 'Analyze this codebase' };
      const result = DelegateInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.task).toBe('Analyze this codebase');
        expect(result.data.estimate_tokens).toBe(false);
      }
    });

    it('should accept valid input with all fields', () => {
      const input = {
        task: 'Implement a new feature',
        preferred_capability: 'code',
        model_hint: 'claude-sonnet',
        estimate_tokens: true,
      };
      const result = DelegateInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preferred_capability).toBe('code');
        expect(result.data.model_hint).toBe('claude-sonnet');
        expect(result.data.estimate_tokens).toBe(true);
      }
    });

    it('should reject empty task', () => {
      const input = { task: '' };
      const result = DelegateInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject invalid preferred_capability', () => {
      const input = { task: 'test', preferred_capability: 'invalid' };
      const result = DelegateInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('analyzeTask', () => {
    it('should detect reasoning needs', () => {
      const requirements = analyzeTask('Analyze and compare different architecture patterns');

      expect(requirements.needsReasoning).toBe(true);
    });

    it('should detect large context needs', () => {
      const requirements = analyzeTask('Summarize the entire codebase');

      expect(requirements.needsLargeContext).toBe(true);
    });

    it('should detect speed needs', () => {
      const requirements = analyzeTask('Quick fix for this simple bug');

      expect(requirements.needsSpeed).toBe(true);
    });

    it('should detect code generation needs', () => {
      const requirements = analyzeTask('Implement a new function for user authentication');

      expect(requirements.needsCodeGen).toBe(true);
    });

    it('should detect cost sensitivity', () => {
      const requirements = analyzeTask('Cheap option for a budget project');

      expect(requirements.isCostSensitive).toBe(true);
    });

    it('should estimate tokens from task length', () => {
      const requirements = analyzeTask('Short task');

      expect(requirements.estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe('scoreModel', () => {
    it('should score higher for reasoning model when reasoning is needed', () => {
      const requirements = {
        estimatedTokens: 1000,
        needsReasoning: true,
        needsLargeContext: false,
        needsSpeed: false,
        needsCodeGen: false,
        isCostSensitive: false,
        needsImageGen: false,
        needsAudioOutput: false,
        needsMcp: false,
        needsExploration: false,
      };

      // Use plan billing mode (default deployment) so cost doesn't dilute reasoning signal
      const opusScore = scoreModel(
        'claude-opus',
        MODEL_CAPABILITIES['claude-opus']!,
        requirements,
        { billingMode: 'plan' }
      );
      const haikuScore = scoreModel(
        'claude-haiku',
        MODEL_CAPABILITIES['claude-haiku']!,
        requirements,
        { billingMode: 'plan' }
      );

      // Opus (reasoning: 10) should score higher than Haiku (reasoning: 7) for reasoning tasks
      expect(opusScore).toBeGreaterThanOrEqual(haikuScore);
    });

    it('should score higher for large context model when large context is needed', () => {
      const requirements = {
        estimatedTokens: 300000,
        needsReasoning: false,
        needsLargeContext: true,
        needsSpeed: false,
        needsCodeGen: false,
        isCostSensitive: false,
        needsImageGen: false,
        needsAudioOutput: false,
        needsMcp: false,
        needsExploration: false,
      };

      const geminiScore = scoreModel('gemini-pro', MODEL_CAPABILITIES['gemini-pro']!, requirements);
      const claudeScore = scoreModel(
        'claude-sonnet',
        MODEL_CAPABILITIES['claude-sonnet']!,
        requirements
      );

      expect(geminiScore).toBeGreaterThan(claudeScore);
    });

    it('should apply preferred capability bonus', () => {
      const requirements = {
        estimatedTokens: 1000,
        needsReasoning: false,
        needsLargeContext: false,
        needsSpeed: false,
        needsCodeGen: false,
        isCostSensitive: false,
        needsImageGen: false,
        needsAudioOutput: false,
        needsMcp: false,
        needsExploration: false,
      };

      const codeScoreWithPreference = scoreModel(
        'codex-5.2',
        MODEL_CAPABILITIES['codex-5.2']!,
        requirements,
        { preferredCapability: 'code' }
      );
      const codeScoreWithoutPreference = scoreModel(
        'codex-5.2',
        MODEL_CAPABILITIES['codex-5.2']!,
        requirements
      );

      expect(codeScoreWithPreference).toBeGreaterThan(codeScoreWithoutPreference);
    });
  });

  describe('selectModel', () => {
    it('should use model_hint when provided', () => {
      const requirements = {
        estimatedTokens: 1000,
        needsReasoning: false,
        needsLargeContext: false,
        needsSpeed: false,
        needsCodeGen: false,
        isCostSensitive: false,
        needsImageGen: false,
        needsAudioOutput: false,
        needsMcp: false,
        needsExploration: false,
      };

      const result = selectModel(
        { task: 'test', model_hint: 'gemini-flash', estimate_tokens: false },
        requirements
      );

      expect(result.model).toBe('gemini-flash');
      expect(result.reasoning).toContain('explicitly requested');
    });

    it('should select best model based on requirements', () => {
      const requirements = {
        estimatedTokens: 1000,
        needsReasoning: true,
        needsLargeContext: false,
        needsSpeed: false,
        needsCodeGen: false,
        isCostSensitive: false,
        needsImageGen: false,
        needsAudioOutput: false,
        needsMcp: false,
        needsExploration: false,
      };

      const result = selectModel(
        { task: 'complex analysis', estimate_tokens: false },
        requirements
      );

      // Top-tier models should be selected for reasoning tasks
      expect([
        'claude-opus',
        'codex-5.3',
        'codex-5.2',
        'claude-sonnet',
        'gemini-3-pro',
        'gemini-pro',
      ]).toContain(result.model);
      expect(result.alternatives.length).toBeGreaterThan(0);
    });

    it('should provide alternatives with tradeoffs', () => {
      const requirements = {
        estimatedTokens: 1000,
        needsReasoning: false,
        needsLargeContext: false,
        needsSpeed: false,
        needsCodeGen: true,
        isCostSensitive: false,
        needsImageGen: false,
        needsAudioOutput: false,
        needsMcp: false,
        needsExploration: false,
      };

      const result = selectModel(
        { task: 'implement function', estimate_tokens: false },
        requirements
      );

      expect(result.alternatives.length).toBeLessThanOrEqual(3);
      result.alternatives.forEach((alt) => {
        expect(alt.model).toBeDefined();
        expect(alt.score).toBeGreaterThan(0);
        expect(alt.tradeoff).toBeDefined();
      });
    });
  });

  describe('MODEL_CAPABILITIES', () => {
    it('should have all expected models', () => {
      expect(MODEL_CAPABILITIES['claude-opus']).toBeDefined();
      expect(MODEL_CAPABILITIES['claude-sonnet']).toBeDefined();
      expect(MODEL_CAPABILITIES['claude-haiku']).toBeDefined();
      expect(MODEL_CAPABILITIES['gemini-pro']).toBeDefined();
      expect(MODEL_CAPABILITIES['gemini-flash']).toBeDefined();
      expect(MODEL_CAPABILITIES['codex-5.2']).toBeDefined();
      expect(MODEL_CAPABILITIES['codex-5.1-mini']).toBeDefined();
    });

    it('should have valid capability scores', () => {
      Object.values(MODEL_CAPABILITIES).forEach((profile) => {
        expect(profile.reasoning).toBeGreaterThanOrEqual(0);
        expect(profile.reasoning).toBeLessThanOrEqual(10);
        expect(profile.codeGeneration).toBeGreaterThanOrEqual(0);
        expect(profile.codeGeneration).toBeLessThanOrEqual(10);
        expect(profile.speed).toBeGreaterThanOrEqual(0);
        expect(profile.speed).toBeLessThanOrEqual(10);
        expect(profile.cost).toBeGreaterThanOrEqual(0);
        expect(profile.cost).toBeLessThanOrEqual(10);
        expect(profile.contextWindow).toBeGreaterThan(0);
      });
    });

    it('should have Gemini with expected context windows', () => {
      expect(MODEL_CAPABILITIES['gemini-pro']!.contextWindow).toBe(1_048_576);
      expect(MODEL_CAPABILITIES['gemini-flash']!.contextWindow).toBe(1_048_576);
    });
  });

  describe('MCP Tool Integration', () => {
    let server: McpServer;
    let client: Client;

    beforeEach(async () => {
      server = new McpServer({ name: 'test', version: '1.0.0' });
      client = new Client({ name: 'test-client', version: '1.0.0' });

      const mockLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        setLevel: vi.fn(),
        child: vi.fn().mockReturnThis(),
      };

      registerDelegateToModelTool(server, {
        logger: mockLogger,
        rateLimiter: createTestRateLimiter(),
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
    });

    it('should be callable via MCP client', async () => {
      const result = await client.callTool({
        name: 'delegate_to_model',
        arguments: { task: 'Implement a new API endpoint' },
      });

      expect(result.isError).toBeUndefined();
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toHaveLength(1);
      expect(content[0]?.type).toBe('text');

      const output = JSON.parse(content[0]!.text) as DelegateOutput;
      expect(output.recommended_model).toBeDefined();
      expect(output.reasoning).toBeDefined();
      expect(output.estimated_tokens).toBeGreaterThan(0);
    });

    it('should return error for invalid input', async () => {
      const result = await client.callTool({
        name: 'delegate_to_model',
        arguments: { task: '' },
      });

      expect(result.isError).toBe(true);
    });

    it('should respect model_hint', async () => {
      const result = await client.callTool({
        name: 'delegate_to_model',
        arguments: {
          task: 'Any task',
          model_hint: 'gemini-pro',
        },
      });

      expect(result.isError).toBeUndefined();
      const content = result.content as Array<{ type: string; text: string }>;
      const output = JSON.parse(content[0]!.text) as DelegateOutput;
      expect(output.recommended_model).toBe('gemini-pro');
    });

    it('should respect preferred_capability', async () => {
      const result = await client.callTool({
        name: 'delegate_to_model',
        arguments: {
          task: 'Some task requiring speed',
          preferred_capability: 'speed',
        },
      });

      expect(result.isError).toBeUndefined();
      const content = result.content as Array<{ type: string; text: string }>;
      const output = JSON.parse(content[0]!.text) as DelegateOutput;
      // Should select a fast model (gemini-flash or claude-haiku)
      expect(['gemini-flash', 'gemini-3-flash', 'claude-haiku', 'codex-5.1-mini']).toContain(
        output.recommended_model
      );
    });
  });

  describe('CompositeRouter Integration', () => {
    let server: McpServer;
    let client: Client;

    /**
     * Creates a mock CompositeRouter for testing.
     */
    function createMockRouter(
      shouldSucceed: boolean = true,
      cliName: 'claude' | 'gemini' | 'codex' = 'claude'
    ): {
      route: ReturnType<typeof vi.fn>;
      executeTask: ReturnType<typeof vi.fn>;
      recordOutcome: ReturnType<typeof vi.fn>;
      recordPreference: ReturnType<typeof vi.fn>;
      recordDifficultyOutcome: ReturnType<typeof vi.fn>;
      getStats: ReturnType<typeof vi.fn>;
      hasMinimumPreferenceData: ReturnType<typeof vi.fn>;
      getZeroRouter: ReturnType<typeof vi.fn>;
      getLatencyTracker: ReturnType<typeof vi.fn>;
      getRoutingMemory: ReturnType<typeof vi.fn>;
      getMetricsCollector: ReturnType<typeof vi.fn>;
      getOrchestrationObserver: ReturnType<typeof vi.fn>;
      getCapacityDashboard: ReturnType<typeof vi.fn>;
    } {
      return {
        route: vi.fn().mockResolvedValue(
          shouldSucceed
            ? {
                ok: true,
                value: {
                  cliName,
                  confidence: 0.9,
                  reason: `Selected ${cliName} via CompositeRouter`,
                  stagesExecuted: ['task-analysis', 'topsis-ranking', 'linucb-selection'],
                  decisionTimeMs: 15,
                  alternatives: cliName === 'claude' ? ['gemini', 'codex'] : ['claude', 'codex'],
                  topsisScore: 0.85,
                  ucbScore: 1.5,
                  taskProfile: {
                    taskType: 'code_implementation',
                    contextRequired: 500,
                    reasoningComplexity: 6,
                    codeGeneration: true,
                    multimodal: false,
                    parallelizable: false,
                    budgetSensitive: false,
                  },
                },
              }
            : {
                ok: false,
                error: { message: 'Routing failed', stage: 'test' },
              }
        ),
        executeTask: vi.fn(),
        recordOutcome: vi.fn(),
        recordPreference: vi.fn(),
        recordDifficultyOutcome: vi.fn(),
        getStats: vi.fn().mockReturnValue({
          totalDecisions: 0,
          decisionsPerCli: { claude: 0, gemini: 0, codex: 0 },
          avgDecisionTimeMs: 0,
          budgetRejectionRate: 0,
        }),
        hasMinimumPreferenceData: vi.fn().mockReturnValue(false),
        getZeroRouter: vi.fn().mockReturnValue(undefined),
        getLatencyTracker: vi.fn().mockReturnValue(undefined),
        getRoutingMemory: vi.fn().mockReturnValue(undefined),
        getMetricsCollector: vi.fn().mockReturnValue(undefined),
        getOrchestrationObserver: vi.fn().mockReturnValue(undefined),
        getCapacityDashboard: vi.fn().mockResolvedValue(new Map()),
      };
    }

    /**
     * Creates a mock FeedbackIntegration for testing.
     */
    function createMockFeedback(): {
      recordRoutingDecision: ReturnType<typeof vi.fn>;
      recordOutcome: ReturnType<typeof vi.fn>;
      getStats: ReturnType<typeof vi.fn>;
      onOutcomeProcessed: ReturnType<typeof vi.fn>;
      registerCompositeRouter: ReturnType<typeof vi.fn>;
      reset: ReturnType<typeof vi.fn>;
      recordStepOutcome: ReturnType<typeof vi.fn>;
      evictStaleEntries: ReturnType<typeof vi.fn>;
      getEvictedEntryCount: ReturnType<typeof vi.fn>;
      getDecisionMapSize: ReturnType<typeof vi.fn>;
    } {
      return {
        recordRoutingDecision: vi.fn().mockReturnValue('test-routing-id'),
        recordOutcome: vi.fn(),
        getStats: vi.fn(),
        onOutcomeProcessed: vi.fn().mockReturnValue(() => {}),
        registerCompositeRouter: vi.fn(),
        reset: vi.fn(),
        recordStepOutcome: vi.fn(),
        evictStaleEntries: vi.fn().mockReturnValue(0),
        getEvictedEntryCount: vi.fn().mockReturnValue(0),
        getDecisionMapSize: vi.fn().mockReturnValue(0),
      };
    }

    beforeEach(() => {
      server = new McpServer({ name: 'test', version: '1.0.0' });
      client = new Client({ name: 'test-client', version: '1.0.0' });
    });

    it('should use CompositeRouter when provided', async () => {
      const mockRouter = createMockRouter(true, 'gemini');
      const mockLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        setLevel: vi.fn(),
        child: vi.fn().mockReturnThis(),
      };

      registerDelegateToModelTool(server, {
        logger: mockLogger,
        router: mockRouter as unknown as ICompositeRouter,
        rateLimiter: createTestRateLimiter(),
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: 'delegate_to_model',
        arguments: { task: 'Implement a new feature' },
      });

      expect(result.isError).toBeUndefined();
      expect(mockRouter.route).toHaveBeenCalled();

      const content = result.content as Array<{ type: string; text: string }>;
      const output = JSON.parse(content[0]!.text) as DelegateOutput;
      expect(output.recommended_model).toBe('gemini-3-pro');
      expect(output.reasoning).toContain('CompositeRouter');
    });

    it('should fall back to local selection when router fails', async () => {
      const mockRouter = createMockRouter(false);
      const mockLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        setLevel: vi.fn(),
        child: vi.fn().mockReturnThis(),
      };

      registerDelegateToModelTool(server, {
        logger: mockLogger,
        router: mockRouter as unknown as ICompositeRouter,
        rateLimiter: createTestRateLimiter(),
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: 'delegate_to_model',
        arguments: { task: 'Implement a new feature' },
      });

      expect(result.isError).toBeUndefined();
      expect(mockRouter.route).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();

      // Should still get a valid response from local routing
      const content = result.content as Array<{ type: string; text: string }>;
      const output = JSON.parse(content[0]!.text) as DelegateOutput;
      expect(output.recommended_model).toBeDefined();
    });

    it('should record routing decision with FeedbackIntegration', async () => {
      const mockRouter = createMockRouter(true);
      const mockFeedback = createMockFeedback();
      const mockLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        setLevel: vi.fn(),
        child: vi.fn().mockReturnThis(),
      };

      registerDelegateToModelTool(server, {
        logger: mockLogger,
        router: mockRouter as unknown as ICompositeRouter,
        feedbackIntegration: mockFeedback as unknown as IFeedbackIntegration,
        rateLimiter: createTestRateLimiter(),
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      await client.callTool({
        name: 'delegate_to_model',
        arguments: { task: 'Implement a new feature' },
      });

      expect(mockFeedback.recordRoutingDecision).toHaveBeenCalled();
    });

    it('should work without FeedbackIntegration', async () => {
      const mockRouter = createMockRouter(true);
      const mockLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        setLevel: vi.fn(),
        child: vi.fn().mockReturnThis(),
      };

      registerDelegateToModelTool(server, {
        logger: mockLogger,
        router: mockRouter as unknown as ICompositeRouter,
        rateLimiter: createTestRateLimiter(),
        // No feedbackIntegration
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const result = await client.callTool({
        name: 'delegate_to_model',
        arguments: { task: 'Implement a new feature' },
      });

      expect(result.isError).toBeUndefined();
      expect(mockRouter.route).toHaveBeenCalled();
    });
  });
});
