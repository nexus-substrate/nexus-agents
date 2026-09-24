/**
 * Tests for CLI-to-Model Adapter Bridge
 *
 * @module cli-adapters/cli-to-model-adapter.test
 */

import { describe, it, expect, vi } from 'vitest';
import { CliToModelAdapter, createCliToModelAdapter } from './cli-to-model-adapter.js';
import { ModelCapability, ErrorCode, err } from '../core/index.js';
import { createCallerInputCliError } from './cli-error-helpers.js';
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

describe('CliToModelAdapter.complete — requested model (#6599)', () => {
  function sentTask(cli: ICliAdapter): { model?: string } {
    const execute = vi.mocked(cli.execute);
    return execute.mock.calls[0]?.[0] as { model?: string };
  }

  it('threads request.model into the CliTask', async () => {
    const cli = makeMockCliAdapter({ name: 'opencode' as const });
    const adapter = new CliToModelAdapter(cli);
    await adapter.complete({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'opencode-custom-sonnet',
    });
    expect(sentTask(cli).model).toBe('opencode-custom-sonnet');
  });

  it('sends no model key when the request names none', async () => {
    const cli = makeMockCliAdapter({ name: 'opencode' as const });
    await new CliToModelAdapter(cli).complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect('model' in sentTask(cli)).toBe(false);
  });

  it('reports the forwarded model as the one that ran when the CLI names none', async () => {
    const cli = makeMockCliAdapter({
      name: 'codex' as const,
      execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'ok' } }),
    });
    const res = await new CliToModelAdapter(cli).complete({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-6-luna',
    });
    // The canonical id of the forwarded model, not the adapter's modelId.
    if (res.ok) expect(res.value.model).toBe('codex-5.1-mini');
    expect(res.ok).toBe(true);
  });

  it('keeps the model the CLI itself reported over the forwarded one', async () => {
    const cli = makeMockCliAdapter({
      name: 'codex' as const,
      execute: vi.fn().mockResolvedValue({ ok: true, value: { text: 'ok', model: 'gpt-5.5' } }),
    });
    const res = await new CliToModelAdapter(cli).complete({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-6-luna',
    });
    if (res.ok) expect(res.value.model).toBe('gpt-5.5');
    expect(res.ok).toBe(true);
  });

  it('maps a caller-input CLI error to an INVALID_INPUT ModelError', async () => {
    const cli = makeMockCliAdapter({
      name: 'opencode' as const,
      execute: vi
        .fn()
        .mockResolvedValue(
          err(createCallerInputCliError('requested model is in rate-limit cooldown', 'opencode'))
        ),
    });
    const res = await new CliToModelAdapter(cli).complete({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'acme/x',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(ErrorCode.INVALID_INPUT);
  });

  it('does not hand one CLI a registry model that belongs to another CLI', async () => {
    // A failover can land a model-bound request on a different CLI; claude
    // cannot run an opencode gateway model, so it runs its own default.
    const cli = makeMockCliAdapter({ name: 'claude' as const });
    await new CliToModelAdapter(cli).complete({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'opencode-custom-sonnet',
    });
    expect('model' in sentTask(cli)).toBe(false);
  });
});

describe('CliToModelAdapter.complete', () => {
  it('surfaces the CLI stderr on the completion when the transport captured one (#6094)', async () => {
    const cli = makeMockCliAdapter({
      execute: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          text: '{"decision":"approve"}',
          stderr: 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted\n',
        } satisfies CliResponse,
      }),
    });
    const adapter = new CliToModelAdapter(cli);
    const result = await adapter.complete({ messages: [{ role: 'user', content: 'vote' }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cliStderr).toBe(
        'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted\n'
      );
    }
  });

  it('carries the in-family model substitution up as fallbackFrom (#6120 → #6115)', async () => {
    const adapter = new CliToModelAdapter(
      makeMockCliAdapter({
        execute: vi.fn().mockResolvedValue({
          ok: true,
          value: { text: 'ok', model: 'opus', fallbackFrom: 'fable' } satisfies CliResponse,
        }),
      })
    );
    const result = await adapter.complete({ messages: [{ role: 'user', content: 'vote' }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.model).toBe('opus');
      expect(result.value.fallbackFrom).toBe('fable');
    }
  });

  it('an un-substituted answer carries no fallbackFrom key', async () => {
    const adapter = new CliToModelAdapter(
      makeMockCliAdapter({
        execute: vi.fn().mockResolvedValue({
          ok: true,
          value: { text: 'ok', model: 'fable' } satisfies CliResponse,
        }),
      })
    );
    const result = await adapter.complete({ messages: [{ role: 'user', content: 'vote' }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect('fallbackFrom' in result.value).toBe(false);
  });

  it('absent or empty stderr stays absent — never an empty-string signal', async () => {
    const adapter = new CliToModelAdapter(
      makeMockCliAdapter({
        execute: vi.fn().mockResolvedValue({
          ok: true,
          value: { text: 'ok', stderr: '' } satisfies CliResponse,
        }),
      })
    );
    const result = await adapter.complete({ messages: [{ role: 'user', content: 'vote' }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect('cliStderr' in result.value).toBe(false);
  });

  it('delegates to CLI adapter execute', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.ok).toBe(true);
    expect(cli.execute).toHaveBeenCalledOnce();
  });

  it('uses request.timeoutMs over the construction-time default (#3304)', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli, { defaultTimeoutMs: 120_000 });

    await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
      timeoutMs: 300_000,
    });

    const opts = (cli.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      timeoutMs?: number;
    };
    expect(opts.timeoutMs).toBe(300_000);
  });

  it('passes the requested workspace to CLI task options (#6358)', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    await adapter.complete({
      messages: [{ role: 'user', content: 'Review the head' }],
      workDir: '/tmp/vote-scratch',
    });

    expect(cli.execute).toHaveBeenCalledWith(
      { content: '[user]: Review the head', options: { workDir: '/tmp/vote-scratch' } },
      undefined
    );
  });

  it('leaves task options absent when no workspace is requested (#6358)', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);

    await adapter.complete({ messages: [{ role: 'user', content: 'Hello' }] });

    expect(cli.execute).toHaveBeenCalledWith({ content: '[user]: Hello' }, undefined);
  });

  it('forwards request.signal to the CLI adapter so an abort kills its subprocess (#6680)', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli);
    const controller = new AbortController();

    await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
      signal: controller.signal,
    });

    const opts = (cli.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      signal?: AbortSignal;
      timeoutMs?: number;
    };
    expect(opts.signal).toBe(controller.signal);
    expect(opts).not.toHaveProperty('timeoutMs');
  });

  it('falls back to the default timeout when request.timeoutMs is absent (#3304)', async () => {
    const cli = makeMockCliAdapter();
    const adapter = new CliToModelAdapter(cli, { defaultTimeoutMs: 120_000 });

    await adapter.complete({ messages: [{ role: 'user', content: 'Hello' }] });

    const opts = (cli.execute as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      timeoutMs?: number;
    };
    expect(opts.timeoutMs).toBe(120_000);
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
      expect(result.value.usage?.inputTokens).toBe(10);
      expect(result.value.usage?.outputTokens).toBe(20);
      expect(result.value.usage?.totalTokens).toBe(30);
      expect(result.value.stopReason).toBe('end_turn');
      expect(result.value.model).toBe('claude-sonnet-4-20250514');
    }
  });

  it('carries the parser cache fields across to the response contract (#4440)', async () => {
    // The parser output (cli-adapters TokenUsage) and the response contract
    // (core TokenUsage) are different types; this crossing used to narrow to
    // the three base counters. Pin the full carry so a rewrite cannot drop
    // the fields #4435 prices on.
    const cli = makeMockCliAdapter();
    (cli.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      value: {
        text: 'response',
        usage: {
          inputTokens: 2,
          outputTokens: 20,
          cachedInputTokens: 3980,
          cacheCreationInputTokens: 500,
        },
      } satisfies CliResponse,
    });
    const adapter = new CliToModelAdapter(cli);

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.usage).toEqual({
        inputTokens: 2,
        outputTokens: 20,
        totalTokens: 22,
        cachedInputTokens: 3980,
        cacheCreationInputTokens: 500,
      });
    }
  });

  it('omits usage when the CLI response has none (#4439)', async () => {
    // Previously asserted zeros. Absence must stay absent so the decision-cost
    // rollup can tell "zero tokens" from "we do not know".
    const cli = makeMockCliAdapter();
    (cli.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      value: { text: 'response' },
    });
    const adapter = new CliToModelAdapter(cli);

    const result = await adapter.complete({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.usage).toBeUndefined();
    }
  });

  it('returns ModelError on CLI failure', async () => {
    const cliError: CliError = {
      code: 'EXECUTION_ERROR',
      message: 'CLI process crashed',
      cli: 'claude',
      retryable: false,
    };
    const cli = makeMockCliAdapter();
    (cli.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: cliError,
    });
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
      code: 'EXECUTION_ERROR',
      message: 'CLI failed',
      cli: 'claude',
      retryable: false,
      cause,
    };
    const cli = makeMockCliAdapter();
    (cli.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: cliError,
    });
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
    (cli.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: { code: 'CLI_EXECUTION_ERROR', message: 'Boom', cli: 'claude', retryable: false },
    });
    const adapter = new CliToModelAdapter(cli);

    await expect(async () => {
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
