/**
 * Tests for CLI-to-Model Adapter Bridge
 *
 * @module cli-adapters/cli-to-model-adapter.test
 */

import { describe, it, expect, vi } from 'vitest';
import { CliToModelAdapter, createCliToModelAdapter } from './cli-to-model-adapter.js';
import { ModelCapability } from '../core/index.js';
import type { ICliAdapter, CliResponse, CliError } from './types.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockCliAdapter(overrides: Partial<ICliAdapter> = {}) {
  return {
    name: 'claude' as const,
    transport: 'stdio' as const,
    capabilities: {
      reasoning: 9,
      contextWindow: 200_000,
      codeGeneration: 9,
      speed: 7,
      cost: 5,
    },
    execute: vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        value: {
          text: 'Hello from CLI',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          model: 'claude-sonnet-4-20250514',
        } satisfies CliResponse,
      })
    ),
    getModelInfo: vi.fn().mockReturnValue({ id: 'claude-sonnet', name: 'Claude Sonnet' }),
    healthCheck: vi.fn().mockImplementation(() => Promise.resolve({ ok: true, value: undefined })),
    initialize: vi.fn().mockImplementation(() => Promise.resolve()),
    dispose: vi.fn().mockImplementation(() => Promise.resolve()),
    ...overrides,
  } as unknown as ICliAdapter;
}

// ============================================================================
// Constructor & Properties
// ============================================================================

describe('CliToModelAdapter', () => {
  it('sets providerId from CLI name', () => {
    const adapter = new CliToModelAdapter(makeMockCliAdapter());
    expect(adapter.providerId).toBe('cli-claude');
  });

  it('sets modelId from CLI getModelInfo', () => {
    const adapter = new CliToModelAdapter(makeMockCliAdapter());
    expect(adapter.modelId).toBe('claude-sonnet');
  });

  it('includes COMPLETION and TOOL_USE capabilities', () => {
    const adapter = new CliToModelAdapter(makeMockCliAdapter());
    expect(adapter.capabilities).toContain(ModelCapability.COMPLETION);
    expect(adapter.capabilities).toContain(ModelCapability.TOOL_USE);
  });

  it('includes EXTENDED_THINKING for claude CLI', () => {
    const adapter = new CliToModelAdapter(makeMockCliAdapter({ name: 'claude' as const }));
    expect(adapter.capabilities).toContain(ModelCapability.EXTENDED_THINKING);
  });

  it('does not include EXTENDED_THINKING for gemini CLI', () => {
    const cli = makeMockCliAdapter({ name: 'gemini' as const });
    const adapter = new CliToModelAdapter(cli);
    expect(adapter.capabilities).not.toContain(ModelCapability.EXTENDED_THINKING);
  });
});

// ============================================================================
// complete()
// ============================================================================

describe('CliToModelAdapter.complete', () => {
  it('delegates to CLI adapter execute', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.ok).toBe(true);
    expect(cli.execute).toHaveBeenCalledOnce();
  });

  it('converts string messages to CLI task content', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    await adapter.complete({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
    });

    const task = (cli.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      content: string;
    };
    expect(task.content).toContain('[user]: Hello');
    expect(task.content).toContain('[assistant]: Hi there');
  });

  it('converts content block messages to text', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    await adapter.complete({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
          ],
        },
      ],
    });

    const task = (cli.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      content: string;
    };
    expect(task.content).toContain('Part 1');
    expect(task.content).toContain('Part 2');
  });

  it('passes systemPrompt to CLI task', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: 'Be helpful',
    });

    const task = (cli.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      systemPrompt?: string;
    };
    expect(task.systemPrompt).toBe('Be helpful');
  });

  it('passes maxTokens to CLI task', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
      maxTokens: 500,
    });

    const task = (cli.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      maxTokens?: number;
    };
    expect(task.maxTokens).toBe(500);
  });

  it('converts CLI response to CompletionResponse', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content[0]).toEqual({ type: 'text', text: 'Hello from CLI' });
      expect(result.value.usage.inputTokens).toBe(10);
      expect(result.value.usage.outputTokens).toBe(20);
      expect(result.value.usage.totalTokens).toBe(30);
      expect(result.value.stopReason).toBe('end_turn');
      expect(result.value.model).toBe('claude-sonnet-4-20250514');
    }
  });

  it('defaults usage to zeros when CLI response has no usage', async () => {
    const cli = makeMockCliAdapter();
    (cli.execute as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: true, value: { text: 'response' } })
    );
    const adapter = new CliToModelAdapter(cli);

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.usage.inputTokens).toBe(0);
      expect(result.value.usage.outputTokens).toBe(0);
      expect(result.value.usage.totalTokens).toBe(0);
    }
  });

  it('returns ModelError on CLI failure', async () => {
    const cliError: CliError = {
      code: 'CLI_EXECUTION_ERROR',
      message: 'CLI process crashed',
      cli: 'claude',
      retryable: false,
    };
    const cli = makeMockCliAdapter();
    (cli.execute as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: false, error: cliError })
    );
    const adapter = new CliToModelAdapter(cli);

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('CLI process crashed');
    }
  });

  it('preserves cause from CLI error', async () => {
    const cause = new Error('underlying issue');
    const cliError: CliError = {
      code: 'CLI_EXECUTION_ERROR',
      message: 'CLI failed',
      cli: 'claude',
      retryable: false,
      cause,
    };
    const cli = makeMockCliAdapter();
    (cli.execute as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ ok: false, error: cliError })
    );
    const adapter = new CliToModelAdapter(cli);

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe(cause);
    }
  });
});

// ============================================================================
// stream()
// ============================================================================

describe('CliToModelAdapter.stream', () => {
  it('yields stream chunks from non-streaming response', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    const chunks: unknown[] = [];
    for await (const chunk of adapter.stream({
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(6);
    expect((chunks[0] as { type: string }).type).toBe('message_start');
    expect((chunks[1] as { type: string }).type).toBe('content_block_start');
    expect((chunks[2] as { type: string }).type).toBe('content_block_delta');
    expect((chunks[3] as { type: string }).type).toBe('content_block_stop');
    expect((chunks[4] as { type: string }).type).toBe('message_delta');
    expect((chunks[5] as { type: string }).type).toBe('message_stop');
  });

  it('throws on CLI execution error', async () => {
    const cli = makeMockCliAdapter();
    (cli.execute as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'CLI_EXECUTION_ERROR', message: 'Boom', cli: 'claude', retryable: false },
      })
    );
    const adapter = new CliToModelAdapter(cli);

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of adapter.stream({
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        // consume
      }
    }).rejects.toThrow('Boom');
  });
});

// ============================================================================
// Utility Methods
// ============================================================================

describe('CliToModelAdapter utility methods', () => {
  it('countTokens returns approximate token count', async () => {
    const adapter = new CliToModelAdapter(makeMockCliAdapter());
    const count = await adapter.countTokens('Hello world test');
    // ~16 chars / 4 = 4 tokens
    expect(count).toBe(4);
  });

  it('validateConfig returns ok', () => {
    const adapter = new CliToModelAdapter(makeMockCliAdapter());
    const result = adapter.validateConfig();
    expect(result.ok).toBe(true);
  });

  it('initialize delegates to CLI adapter', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);
    await adapter.initialize();
    expect(cli.initialize).toHaveBeenCalledOnce();
  });

  it('dispose delegates to CLI adapter', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);
    await adapter.dispose();
    expect(cli.dispose).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// Factory
// ============================================================================

describe('createCliToModelAdapter', () => {
  it('returns a CliToModelAdapter instance', () => {
    const adapter = createCliToModelAdapter(makeMockCliAdapter());
    expect(adapter).toBeInstanceOf(CliToModelAdapter);
  });
});
