/**
 * Tests for generateObject — typed structured output with retry-with-feedback.
 * (Source: Issue #1897)
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { generateObject } from './generate-object.js';
import type { ICliAdapter } from './types.js';
import type { CliResponse, CliError } from './types-core.js';
import type { Result } from '../core/index.js';

/** Create a mock adapter that returns the given responses in sequence. */
function mockAdapter(...responses: Array<Result<CliResponse, CliError>>): ICliAdapter {
  const execute = vi.fn();
  for (const r of responses) {
    execute.mockResolvedValueOnce(r);
  }
  return {
    name: 'claude',
    transport: 'subprocess',
    capabilities: { reasoning: 9, contextWindow: 200000, codeGeneration: 9, speed: 7, cost: 6 },
    execute,
    healthCheck: vi.fn(),
    getCapacity: vi.fn(),
    getVersion: vi.fn(),
    getModelInfo: vi.fn(),
    initialize: vi.fn(),
    dispose: vi.fn(),
  } as unknown as ICliAdapter;
}

function okResponse(text: string): Result<CliResponse, CliError> {
  return {
    ok: true,
    value: { text, usage: { inputTokens: 100, outputTokens: 50 } },
  };
}

function errResponse(message: string): Result<CliResponse, CliError> {
  return {
    ok: false,
    error: { code: 'EXECUTION_ERROR' as const, message, retryable: false, cli: 'claude' },
  };
}

const FindingsSchema = z.object({
  findings: z.array(
    z.object({
      severity: z.enum(['high', 'medium', 'low']),
      description: z.string(),
    })
  ),
});

describe('generateObject', () => {
  it('extracts and validates JSON on first attempt', async () => {
    const json = JSON.stringify({
      findings: [{ severity: 'high', description: 'SQL injection' }],
    });
    const adapter = mockAdapter(okResponse(`Here is the result:\n${json}`));

    const result = await generateObject({
      adapter,
      prompt: 'Analyze code',
      schema: FindingsSchema,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data.findings).toHaveLength(1);
      expect(result.value.data.findings[0]?.severity).toBe('high');
      expect(result.value.attempts).toBe(1);
    }
  });

  it('retries with feedback on validation failure', async () => {
    const badJson = JSON.stringify({ findings: [{ severity: 'critical', description: 'XSS' }] });
    const goodJson = JSON.stringify({
      findings: [{ severity: 'high', description: 'XSS' }],
    });
    const adapter = mockAdapter(
      okResponse(badJson), // First: 'critical' not in enum
      okResponse(goodJson) // Retry: fixed
    );

    const result = await generateObject({
      adapter,
      prompt: 'Analyze code',
      schema: FindingsSchema,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attempts).toBe(2);
      expect(result.value.data.findings[0]?.severity).toBe('high');
    }

    // Verify retry prompt includes validation error
    const calls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls;
    const retryCall = calls[1] as unknown[];
    const retryContent = (retryCall[0] as { content: string }).content;
    expect(retryContent).toContain('failed JSON validation');
    expect(retryContent).toContain('severity');
  });

  it('returns error when adapter fails', async () => {
    const adapter = mockAdapter(errResponse('Model overloaded'));

    const result = await generateObject({
      adapter,
      prompt: 'Analyze code',
      schema: FindingsSchema,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('adapter_error');
      expect(result.error.message).toBe('Model overloaded');
    }
  });

  it('returns error when no JSON found in response', async () => {
    const adapter = mockAdapter(okResponse('Sorry, I cannot analyze this code.'));

    const result = await generateObject({
      adapter,
      prompt: 'Analyze code',
      schema: FindingsSchema,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('no_json');
    }
  });

  it('returns validation_error after retry exhaustion', async () => {
    const badJson = JSON.stringify({ findings: [{ severity: 'critical', description: 'XSS' }] });
    const adapter = mockAdapter(
      okResponse(badJson), // First: invalid
      okResponse(badJson) // Retry: still invalid
    );

    const result = await generateObject({
      adapter,
      prompt: 'Analyze code',
      schema: FindingsSchema,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation_error');
      expect(result.error.zodErrors).toBeDefined();
    }
  });

  it('handles JSON parse errors', async () => {
    const adapter = mockAdapter(okResponse('{ broken json }'), okResponse('{ "findings": [] }'));

    const result = await generateObject({
      adapter,
      prompt: 'Analyze code',
      schema: FindingsSchema,
    });

    // Should retry on parse error and succeed
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attempts).toBe(2);
    }
  });

  it('supports array extraction with isArray flag', async () => {
    const ArraySchema = z.array(z.object({ name: z.string() }));
    const json = JSON.stringify([{ name: 'alpha' }, { name: 'beta' }]);
    const adapter = mockAdapter(okResponse(`Results: ${json}`));

    const result = await generateObject({
      adapter,
      prompt: 'List items',
      schema: ArraySchema,
      isArray: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.data).toHaveLength(2);
      expect(result.value.data[0]?.name).toBe('alpha');
    }
  });

  it('appends schema instruction to prompt', async () => {
    const adapter = mockAdapter(okResponse('{ "findings": [] }'));

    await generateObject({
      adapter,
      prompt: 'Analyze code',
      schema: FindingsSchema,
    });

    const calls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls;
    const firstCall = calls[0] as unknown[];
    const content = (firstCall[0] as { content: string }).content;
    expect(content).toContain('Respond ONLY with valid JSON');
  });

  it('passes timeoutMs to adapter task', async () => {
    const adapter = mockAdapter(okResponse('{ "findings": [] }'));

    await generateObject({
      adapter,
      prompt: 'Analyze code',
      schema: FindingsSchema,
      timeoutMs: 30000,
    });

    const calls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls;
    const firstCall = calls[0] as unknown[];
    const task = firstCall[0] as { timeoutMs?: number };
    expect(task.timeoutMs).toBe(30000);
  });
});
