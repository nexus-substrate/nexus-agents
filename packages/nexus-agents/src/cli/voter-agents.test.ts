/**
 * Tests for voter agents module.
 * (Source: Issue #226, Issue #280 - timeout/retry fixes)
 */

import { describe, it, expect, vi } from 'vitest';

// Mock delay to skip retry backoff waits (perf: saves ~2s from retry tests)
vi.mock('../utils/async-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/async-utils.js')>();
  return {
    ...actual,
    delay: vi.fn(() => Promise.resolve()),
  };
});

import {
  VOTER_SYSTEM_PROMPTS,
  VoteResponseSchema,
  buildVotePrompt,
  extractJsonFromResponse,
  parseVoteResponse,
  simulateVote,
  getRoleDescription,
  executeAgentVote,
  collectRealVotes,
  NoAdapterError,
} from './voter-agents.js';
import type { VoterRole } from './vote-types.js';
import type { IModelAdapter, CompletionResponse, ILogger } from '../core/index.js';
import type { Result } from '../core/index.js';
import { createLogger } from '../core/index.js';
import { UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';

describe('voter-agents', () => {
  describe('VOTER_SYSTEM_PROMPTS', () => {
    const roles: VoterRole[] = ['architect', 'security', 'devex', 'ai_ml', 'pm'];

    it.each(roles)('should have a system prompt for %s role', (role) => {
      expect(VOTER_SYSTEM_PROMPTS[role]).toBeDefined();
      expect(typeof VOTER_SYSTEM_PROMPTS[role]).toBe('string');
      expect(VOTER_SYSTEM_PROMPTS[role].length).toBeGreaterThan(100);
    });

    it('should include evaluation criteria for architect', () => {
      expect(VOTER_SYSTEM_PROMPTS.architect).toContain('Technical design');
      expect(VOTER_SYSTEM_PROMPTS.architect).toContain('Scalability');
      expect(VOTER_SYSTEM_PROMPTS.architect).toContain('Maintainability');
    });

    it('should include security concerns for security role', () => {
      expect(VOTER_SYSTEM_PROMPTS.security).toContain('OWASP');
      expect(VOTER_SYSTEM_PROMPTS.security).toContain('vulnerabilities');
      expect(VOTER_SYSTEM_PROMPTS.security).toContain('injection');
    });

    it('should include developer experience criteria for devex role', () => {
      expect(VOTER_SYSTEM_PROMPTS.devex).toContain('API usability');
      expect(VOTER_SYSTEM_PROMPTS.devex).toContain('Documentation');
      expect(VOTER_SYSTEM_PROMPTS.devex).toContain('Learning curve');
    });

    it('should include AI/ML criteria for ai_ml role', () => {
      expect(VOTER_SYSTEM_PROMPTS.ai_ml).toContain('Multi-agent');
      expect(VOTER_SYSTEM_PROMPTS.ai_ml).toContain('Model selection');
      expect(VOTER_SYSTEM_PROMPTS.ai_ml).toContain('Context management');
    });

    it('should include business criteria for pm role', () => {
      expect(VOTER_SYSTEM_PROMPTS.pm).toContain('Business value');
      expect(VOTER_SYSTEM_PROMPTS.pm).toContain('Resource requirements');
      expect(VOTER_SYSTEM_PROMPTS.pm).toContain('CLAUDE.md');
    });
  });

  describe('VoteResponseSchema', () => {
    it('should validate a valid vote response', () => {
      const validResponse = {
        decision: 'approve',
        reasoning: 'Good technical design and aligns with patterns.',
        confidence: 0.85,
      };

      const result = VoteResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should accept optional conditions', () => {
      const responseWithConditions = {
        decision: 'approve',
        reasoning: 'Approved with conditions',
        confidence: 0.75,
        conditions: ['Add tests before merge', 'Update documentation'],
      };

      const result = VoteResponseSchema.safeParse(responseWithConditions);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.conditions).toEqual(['Add tests before merge', 'Update documentation']);
      }
    });

    it('should reject invalid decision values', () => {
      const invalidResponse = {
        decision: 'maybe',
        reasoning: 'Not sure about this',
        confidence: 0.5,
      };

      const result = VoteResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject reasoning that is too short', () => {
      const shortReasoning = {
        decision: 'approve',
        reasoning: 'OK',
        confidence: 0.9,
      };

      const result = VoteResponseSchema.safeParse(shortReasoning);
      expect(result.success).toBe(false);
    });

    it('should reject confidence outside 0-1 range', () => {
      const invalidConfidence = {
        decision: 'approve',
        reasoning: 'Valid reasoning text here',
        confidence: 1.5,
      };

      const result = VoteResponseSchema.safeParse(invalidConfidence);
      expect(result.success).toBe(false);
    });
  });

  describe('buildVotePrompt', () => {
    it('should include the proposal text', () => {
      const proposal = 'Add a new routing feature';
      const prompt = buildVotePrompt(proposal);

      expect(prompt).toContain(proposal);
      expect(prompt).toContain('PROPOSAL:');
    });

    it('should include voting instructions', () => {
      const prompt = buildVotePrompt('Test proposal');

      expect(prompt).toContain('approve');
      expect(prompt).toContain('reject');
      expect(prompt).toContain('abstain');
      expect(prompt).toContain('confidence');
    });

    it('should include example JSON response', () => {
      const prompt = buildVotePrompt('Test proposal');

      expect(prompt).toContain('"decision"');
      expect(prompt).toContain('"reasoning"');
      expect(prompt).toContain('"confidence"');
    });
  });

  describe('extractJsonFromResponse', () => {
    it('should extract JSON from plain text', () => {
      const text = '{"decision": "approve", "reasoning": "Good", "confidence": 0.8}';
      const result = extractJsonFromResponse(text);

      expect(result).toBe(text);
    });

    it('should extract JSON from markdown code block', () => {
      const text = `Here is my response:
\`\`\`json
{"decision": "approve", "reasoning": "Good", "confidence": 0.8}
\`\`\`
That's my vote.`;

      const result = extractJsonFromResponse(text);
      expect(result).toBe('{"decision": "approve", "reasoning": "Good", "confidence": 0.8}');
    });

    it('should extract JSON from code block without language specifier', () => {
      const text = `\`\`\`
{"decision": "reject", "reasoning": "Concerns", "confidence": 0.6}
\`\`\``;

      const result = extractJsonFromResponse(text);
      expect(result).toBe('{"decision": "reject", "reasoning": "Concerns", "confidence": 0.6}');
    });

    it('should extract JSON object from mixed text', () => {
      const text =
        'I think {"decision": "abstain", "reasoning": "Need more info", "confidence": 0.5} is my vote';

      const result = extractJsonFromResponse(text);
      expect(result).toContain('"decision": "abstain"');
    });

    it('should return trimmed text when no JSON found', () => {
      const text = '   Some plain text without JSON   ';
      const result = extractJsonFromResponse(text);

      expect(result).toBe('Some plain text without JSON');
    });
  });

  describe('parseVoteResponse', () => {
    it('should parse valid JSON vote response', () => {
      const output =
        '{"decision": "approve", "reasoning": "Good design and implementation", "confidence": 0.85}';
      const vote = parseVoteResponse(output, 'architect');

      expect(vote.decision).toBe('approve');
      expect(vote.reasoning).toBe('Good design and implementation');
      expect(vote.confidence).toBe(0.85);
    });

    it('should parse response with conditions', () => {
      const output = `{
        "decision": "approve",
        "reasoning": "Looks good overall with some suggestions",
        "confidence": 0.75,
        "conditions": ["Add tests", "Update docs"]
      }`;
      const vote = parseVoteResponse(output, 'pm');

      expect(vote.decision).toBe('approve');
      expect(vote.conditions).toEqual(['Add tests', 'Update docs']);
    });

    it('should throw SyntheticVoteError for invalid JSON', () => {
      const output = 'I approve this proposal because it looks good';

      expect(() => parseVoteResponse(output, 'devex')).toThrow(/Vote response parsing failed/);
    });

    it('should throw SyntheticVoteError for malformed JSON', () => {
      const output = '{"decision": "approve", "reasoning": missing quotes}';

      expect(() => parseVoteResponse(output, 'architect')).toThrow(/Vote response parsing failed/);
    });
  });

  describe('simulateVote', () => {
    it('should return a valid vote structure', () => {
      const vote = simulateVote('architect', 'Test proposal');

      expect(['approve', 'reject', 'abstain']).toContain(vote.decision);
      expect(vote.reasoning).toMatch(/\[Simulated/); // Matches '[Simulated]' or '[Simulated - no LLM available]'
      // Confidence varies by decision: reject 0.6-0.9, approve 0.5-0.8, abstain 0.3-0.5 (Issue #453)
      expect(vote.confidence).toBeGreaterThanOrEqual(0.3);
      expect(vote.confidence).toBeLessThanOrEqual(0.9);
    });

    it('should include role-specific reasoning', () => {
      const architectVote = simulateVote('architect', 'Test');
      const securityVote = simulateVote('security', 'Test');

      expect(architectVote.reasoning).toContain('architecture');
      expect(securityVote.reasoning).toContain('security');
    });

    it('should include truncated proposal in reasoning', () => {
      const longProposal = 'A'.repeat(100);
      const vote = simulateVote('pm', longProposal);

      expect(vote.reasoning).toContain('A'.repeat(50));
      expect(vote.reasoning).toContain('...');
    });
  });

  describe('getRoleDescription', () => {
    it('should return description for architect', () => {
      const description = getRoleDescription('architect');
      expect(description).toContain('Software Architect');
      expect(description).toContain('technical design');
    });

    it('should return description for security', () => {
      const description = getRoleDescription('security');
      expect(description).toContain('Security Engineer');
    });

    it('should return description for all roles', () => {
      const roles: VoterRole[] = ['architect', 'security', 'devex', 'ai_ml', 'pm'];
      for (const role of roles) {
        const description = getRoleDescription(role);
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(0);
      }
    });
  });

  // ============================================================================
  // Issue #280: Timeout, retry, and simulation fallback tests
  // ============================================================================

  describe('executeAgentVote (Issue #280)', () => {
    const logger = createLogger({ component: 'test', level: 'silent' });

    /** Creates a mock adapter with configurable behavior. */
    function createMockAdapter(behavior: {
      response?: Result<CompletionResponse, Error>;
      delay?: number;
    }): IModelAdapter {
      return {
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [],
        complete: vi.fn().mockImplementation(async () => {
          if (behavior.delay !== undefined) {
            await new Promise((resolve) => setTimeout(resolve, behavior.delay));
          }
          return (
            behavior.response ?? {
              ok: true,
              value: { content: '{}', usage: {}, stopReason: 'end_turn', model: 'test' },
            }
          );
        }),
        stream: vi.fn(),
        countTokens: vi.fn().mockResolvedValue(100),
        validateConfig: vi.fn().mockReturnValue({ ok: true }),
      };
    }

    it('should return successful vote on first attempt', async () => {
      const adapter = createMockAdapter({
        response: {
          ok: true,
          value: {
            // Content is typed as ContentBlock[] but extractTextFromResponse handles strings
            content: JSON.stringify({
              decision: 'approve',
              reasoning: 'Good technical design that follows patterns.',
              confidence: 0.9,
            }) as unknown as CompletionResponse['content'],
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            stopReason: 'end_turn' as const,
            model: 'test',
          },
        },
      });

      const result = await executeAgentVote('architect', 'Test proposal', adapter, logger, {
        timeoutMs: 5000,
        maxRetries: 2,
      });

      expect(result.source).toBe('llm');
      expect(result.vote.decision).toBe('approve');
      expect(result.error).toBeUndefined();
    });

    it('should retry on failure and succeed', async () => {
      const adapter = createMockAdapter({});
      (adapter.complete as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: false, error: new Error('Temporary failure') })
        .mockResolvedValueOnce({
          ok: true,
          value: {
            content: JSON.stringify({
              decision: 'approve',
              reasoning: 'Good design after retry.',
              confidence: 0.8,
            }),
            usage: {},
            stopReason: 'end_turn',
            model: 'test',
          },
        });

      const result = await executeAgentVote('architect', 'Test proposal', adapter, logger, {
        timeoutMs: 5000,
        maxRetries: 2,
      });

      expect(result.source).toBe('llm');
      expect(result.vote.decision).toBe('approve');
      expect(adapter.complete).toHaveBeenCalledTimes(2);
    });

    it('should return abstain vote when all retries exhausted (no simulation)', async () => {
      const adapter = createMockAdapter({
        response: { ok: false, error: new Error('Persistent failure') },
      });

      const result = await executeAgentVote('architect', 'Test proposal', adapter, logger, {
        timeoutMs: 5000,
        maxRetries: 1,
        allowSimulation: false,
      });

      expect(result.vote.decision).toBe('abstain');
      expect(result.vote.confidence).toBe(0);
      expect(result.vote.reasoning).toContain('[Error]');
      expect(result.error).toBe('Persistent failure');
    });

    // #3350: a stale-OAuth voter failure must surface a `<cli> login`
    // remediation in the error text instead of a raw fail-closed string.
    it('appends a re-auth remediation when the failure is a stale-OAuth error', async () => {
      const adapter: IModelAdapter = {
        ...createMockAdapter({
          response: {
            ok: false,
            error: new Error(
              'Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.'
            ),
          },
        }),
        providerId: 'cli-codex',
      };

      const result = await executeAgentVote('architect', 'Test proposal', adapter, logger, {
        timeoutMs: 5000,
        maxRetries: 0,
        allowSimulation: false,
      });

      expect(result.vote.decision).toBe('abstain');
      expect(result.error).toContain('refresh token was already used');
      expect(result.error).toContain('codex login');
    });

    it('leaves a non-auth failure error unchanged (no remediation appended)', async () => {
      const adapter: IModelAdapter = {
        ...createMockAdapter({
          response: { ok: false, error: new Error('rate limit exceeded') },
        }),
        providerId: 'cli-codex',
      };

      const result = await executeAgentVote('architect', 'Test proposal', adapter, logger, {
        timeoutMs: 5000,
        maxRetries: 0,
        allowSimulation: false,
      });

      expect(result.vote.decision).toBe('abstain');
      expect(result.error).toBe('rate limit exceeded');
      expect(result.error).not.toContain('login');
    });

    it('should fall back to simulation only when explicitly allowed', async () => {
      const adapter = createMockAdapter({
        response: { ok: false, error: new Error('Failure') },
      });

      const result = await executeAgentVote('architect', 'Test proposal', adapter, logger, {
        timeoutMs: 5000,
        maxRetries: 0,
        allowSimulation: true,
      });

      expect(result.source).toBe('simulation');
      expect(result.vote.reasoning).toMatch(/\[Simulated/); // Matches '[Simulated]' or '[Simulated - no LLM available]'
    });

    it('should timeout and return error when adapter is slow', async () => {
      const adapter = createMockAdapter({
        delay: 10, // 10ms delay (perf: reduced from 200ms)
        response: {
          ok: true,
          value: {
            content: JSON.stringify({
              decision: 'approve',
              reasoning: 'This should timeout.',
              confidence: 0.9,
            }) as unknown as CompletionResponse['content'],
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            stopReason: 'end_turn' as const,
            model: 'test',
          },
        },
      });

      const result = await executeAgentVote('architect', 'Test proposal', adapter, logger, {
        timeoutMs: 2, // 2ms timeout (less than 10ms delay)
        maxRetries: 0,
        allowSimulation: false,
      });

      expect(result.vote.decision).toBe('abstain');
      expect(result.error).toContain('timeout');
    });
  });

  describe('collectRealVotes (Issue #280)', () => {
    const logger = createLogger({ component: 'test', level: 'silent' });

    it('should construct NoAdapterError with proper message format', () => {
      // Test the error construction directly since CLIs may be available
      // in the test environment, making the actual throw hard to test
      const error = new NoAdapterError(
        'No adapter available for voting: Test error. ' +
          'Install a CLI (claude/gemini/codex) or set ANTHROPIC_API_KEY.'
      );
      expect(error.name).toBe('NoAdapterError');
      expect(error.message).toContain('No adapter available');
      expect(error.message).toContain('Install a CLI');
    });

    it('should use simulation when explicitly requested', async () => {
      const results = await collectRealVotes({
        roles: ['architect', 'security'],
        proposal: 'Test proposal',
        logger,
        simulate: true,
      });

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.source).toBe('simulation');
      }
    });

    it('should pass timeout and retry options to executeAgentVote', async () => {
      const mockAdapter: IModelAdapter = {
        providerId: 'test',
        modelId: 'test-model',
        capabilities: [],
        complete: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            content: JSON.stringify({
              decision: 'approve',
              reasoning: 'Good design with proper patterns.',
              confidence: 0.85,
            }),
            usage: {},
            stopReason: 'end_turn',
            model: 'test',
          },
        }),
        stream: vi.fn(),
        countTokens: vi.fn().mockResolvedValue(100),
        validateConfig: vi.fn().mockReturnValue({ ok: true }),
      };

      const results = await collectRealVotes({
        roles: ['architect'],
        proposal: 'Test proposal',
        logger,
        adapter: mockAdapter,
        timeoutMs: 10000,
        maxRetries: 3,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.source).toBe('llm');
      expect(results[0]?.vote.decision).toBe('approve');
    });
  });

  // #4390: the diversity check compared raw modelId STRINGS, so one model
  // reached through two gateways — `anthropic/claude-sonnet-4-6` and
  // `custom/claude-sonnet-4-6` are the same weights — counted as two distinct
  // models and the warning never fired.
  describe('panel diversity uses canonical model identity (#4390)', () => {
    function adapterFor(modelId: string): IModelAdapter {
      return {
        providerId: 'gateway',
        modelId,
        capabilities: [],
        complete: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            content: JSON.stringify({
              decision: 'approve',
              reasoning: 'Reasonable enough for a test fixture.',
              confidence: 0.8,
            }),
            usage: {},
            stopReason: 'end_turn',
            model: modelId,
          },
        }),
        stream: vi.fn(),
        countTokens: vi.fn().mockResolvedValue(10),
        validateConfig: vi.fn().mockReturnValue({ ok: true }),
      };
    }

    async function warningsFor(modelIds: readonly string[]): Promise<string[]> {
      const warnings: string[] = [];
      const capturing = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: (msg: string) => warnings.push(msg),
      } as unknown as ILogger;

      await collectRealVotes({
        roles: ['architect', 'security'],
        proposal: 'Test proposal',
        logger: capturing,
        gatewayAdapters: modelIds.map(adapterFor),
      });
      return warnings;
    }

    it('warns when two gateways serve the same underlying model', async () => {
      const warnings = await warningsFor([
        'anthropic/claude-sonnet-4-6',
        'custom/claude-sonnet-4-6',
      ]);

      expect(warnings.some((w) => w.includes('collapsed to a single gateway model'))).toBe(true);
    });

    it('stays quiet for a genuinely diverse panel', async () => {
      const warnings = await warningsFor(['anthropic/claude-sonnet-4-6', 'openai/gpt-5.5']);

      expect(warnings.some((w) => w.includes('collapsed to a single gateway model'))).toBe(false);
    });

    it('does not merge two unidentifiable models into one', async () => {
      // The inverse error: collapsing distinct models because neither can be
      // identified would silence a warning that should NOT fire.
      const warnings = await warningsFor(['some-private-model', 'another-private-model']);

      expect(warnings.some((w) => w.includes('collapsed to a single gateway model'))).toBe(false);
    });
  });

  describe('panel independence is judged after detection (#4983)', () => {
    // The bug: lazy detection (#811) means every CLI adapter reports
    // `pending-detection` at assignment time, so an equality check saw "one
    // model" and warned on EVERY vote — while a genuinely collapsed panel
    // produced the identical line. Both directions are pinned here.
    function votingAdapter(modelId: string): IModelAdapter {
      return {
        modelId,
        complete: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            content: [
              {
                type: 'text' as const,
                text: '{"decision":"approve","confidence":0.9,"reasoning":"Test vote."}',
              },
            ],
          },
        }),
      } as unknown as IModelAdapter;
    }

    async function warnsAfterVoting(modelId: string): Promise<string[]> {
      const warnings: string[] = [];
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn((message: string) => warnings.push(message)),
        error: vi.fn(),
      } as unknown as ILogger;

      await collectRealVotes({
        roles: ['architect', 'security', 'devex'] as VoterRole[],
        proposal: 'Panel independence',
        adapter: votingAdapter(modelId),
        interAgentDelayMs: 0,
        logger,
      });
      return warnings;
    }

    it('warns when every role really did run on one model', async () => {
      const warnings = await warnsAfterVoting('gpt-5.5');

      expect(warnings.some((w) => w.includes('ran on ONE model'))).toBe(true);
    });

    it('does not claim correlation from an undetected placeholder', async () => {
      // `pending-detection` is what four DIFFERENT CLIs report before they have
      // looked. Reading that as one model is the false positive.
      const warnings = await warnsAfterVoting(UNRESOLVED_MODEL_ID);

      expect(warnings.some((w) => w.includes('ran on ONE model'))).toBe(false);
      expect(warnings.some((w) => w.includes('UNMEASURED'))).toBe(true);
    });
  });

  describe('staggered vote launches', () => {
    it('launches votes with inter-agent delay', async () => {
      const callTimestamps: number[] = [];
      const adapter = {
        complete: vi.fn().mockImplementation(() => {
          callTimestamps.push(Date.now());
          return Promise.resolve({
            ok: true,
            value: {
              content: [
                {
                  type: 'text' as const,
                  text: '{"decision":"approve","confidence":0.9,"reasoning":"Test vote."}',
                },
              ],
            },
          });
        }),
      } as unknown as IModelAdapter;

      await collectRealVotes({
        roles: ['architect', 'security', 'devex'] as VoterRole[],
        proposal: 'Test stagger',
        adapter,
        interAgentDelayMs: 100,
      });

      // All 3 votes should complete
      expect(adapter.complete).toHaveBeenCalledTimes(3);
    });

    it('supports interAgentDelayMs option in CollectRealVotesOptions', async () => {
      const adapter = {
        complete: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            content: [
              {
                type: 'text' as const,
                text: '{"decision":"approve","confidence":0.9,"reasoning":"OK"}',
              },
            ],
          },
        }),
      } as unknown as IModelAdapter;

      // Should not throw — interAgentDelayMs is a valid option
      const results = await collectRealVotes({
        roles: ['architect'] as VoterRole[],
        proposal: 'Test',
        adapter,
        interAgentDelayMs: 0,
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('NoAdapterError', () => {
    it('should have correct name', () => {
      const error = new NoAdapterError('Test message');
      expect(error.name).toBe('NoAdapterError');
      expect(error.message).toBe('Test message');
    });

    it('should be instanceof Error', () => {
      const error = new NoAdapterError('Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NoAdapterError);
    });
  });
});

describe('collectRealVotes — gateway routing (#4040)', () => {
  const logger = createLogger({ component: 'test', level: 'silent' });

  /** A gateway-style in-process adapter (distinct modelId) returning an approve vote. */
  function gatewayAdapter(modelId: string): IModelAdapter {
    return {
      providerId: 'openai-compat',
      modelId,
      capabilities: [],
      complete: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          content: JSON.stringify({
            decision: 'approve',
            reasoning: `ok from ${modelId}`,
            confidence: 0.9,
          }) as unknown as CompletionResponse['content'],
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          stopReason: 'end_turn' as const,
          model: modelId,
        },
      }),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(10),
      validateConfig: vi.fn().mockReturnValue({ ok: true }),
    };
  }

  const calls = (a: IModelAdapter): number =>
    (a.complete as ReturnType<typeof vi.fn>).mock.calls.length;

  it('round-robins roles across the per-model gateway adapters (in-process, no CLI)', async () => {
    const a = gatewayAdapter('gw-a');
    const b = gatewayAdapter('gw-b');
    const c = gatewayAdapter('gw-c');
    const roles: VoterRole[] = ['architect', 'security', 'scope_steward'];

    const results = await collectRealVotes({
      roles,
      proposal: 'ship it',
      gatewayAdapters: [a, b, c],
      logger,
      timeoutMs: 5000,
      maxRetries: 1,
      interAgentDelayMs: 0,
    });

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.source === 'llm')).toBe(true);
    // 3 roles across 3 gateway adapters → each invoked exactly once. That the
    // gateway adapters were called at all proves voters did NOT shell to a CLI.
    expect(calls(a)).toBe(1);
    expect(calls(b)).toBe(1);
    expect(calls(c)).toBe(1);
  });

  it('wraps round-robin when the gateway serves fewer models than roles', async () => {
    const a = gatewayAdapter('gw-a');
    const b = gatewayAdapter('gw-b');
    const roles: VoterRole[] = ['architect', 'security', 'scope_steward'];

    await collectRealVotes({
      roles,
      proposal: 'ship it',
      gatewayAdapters: [a, b],
      logger,
      timeoutMs: 5000,
      maxRetries: 1,
      interAgentDelayMs: 0,
    });

    // indices 0,2 → a; index 1 → b.
    expect(calls(a)).toBe(2);
    expect(calls(b)).toBe(1);
  });

  it('uses a single gateway model for all roles when only one is served', async () => {
    const only = gatewayAdapter('gw-only');
    const roles: VoterRole[] = ['architect', 'security', 'scope_steward'];

    await collectRealVotes({
      roles,
      proposal: 'ship it',
      gatewayAdapters: [only],
      logger,
      timeoutMs: 5000,
      maxRetries: 1,
      interAgentDelayMs: 0,
    });

    expect(calls(only)).toBe(3);
  });
});
