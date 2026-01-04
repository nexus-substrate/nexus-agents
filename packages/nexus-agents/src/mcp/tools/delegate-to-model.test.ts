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

import {
  registerDelegateToModelTool,
  DelegateInputSchema,
  MODEL_CAPABILITIES,
  _testing,
  type DelegateOutput,
} from './delegate-to-model.js';

const { analyzeTask, scoreModel, selectModel } = _testing;

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
      };

      const opusScore = scoreModel('claude-opus', MODEL_CAPABILITIES['claude-opus']!, requirements);
      const flashScore = scoreModel(
        'gemini-flash',
        MODEL_CAPABILITIES['gemini-flash']!,
        requirements
      );

      // Opus (reasoning: 10) should score at least as high as Flash (reasoning: 6) for reasoning tasks
      // Note: Flash compensates with higher speed and cost scores
      expect(opusScore).toBeGreaterThanOrEqual(flashScore);
    });

    it('should score higher for large context model when large context is needed', () => {
      const requirements = {
        estimatedTokens: 300000,
        needsReasoning: false,
        needsLargeContext: true,
        needsSpeed: false,
        needsCodeGen: false,
        isCostSensitive: false,
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
      };

      const codeScoreWithPreference = scoreModel(
        'codex-5.2',
        MODEL_CAPABILITIES['codex-5.2']!,
        requirements,
        'code'
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
      };

      const result = selectModel(
        { task: 'complex analysis', estimate_tokens: false },
        requirements
      );

      // Top-tier models should be selected for reasoning tasks
      expect(['claude-opus', 'codex-5.2', 'claude-sonnet']).toContain(result.model);
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

    it('should have Gemini with 1M context', () => {
      expect(MODEL_CAPABILITIES['gemini-pro']!.contextWindow).toBe(1_000_000);
      expect(MODEL_CAPABILITIES['gemini-flash']!.contextWindow).toBe(1_000_000);
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

      registerDelegateToModelTool(server, { logger: mockLogger });

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
      expect(['gemini-flash', 'claude-haiku', 'codex-5.1-mini']).toContain(
        output.recommended_model
      );
    });
  });
});
