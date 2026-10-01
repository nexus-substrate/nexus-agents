/** Regression coverage for non-retryable voter failures (#6846, item 1). */
import { describe, expect, it, vi } from 'vitest';
import type { ICliAdapter, CliError } from '../cli-adapters/types.js';
import { DEFAULT_CAPABILITIES } from '../cli-adapters/types.js';
import {
  createCliError,
  createHostUnavailableCliError,
} from '../cli-adapters/cli-error-helpers.js';
import { CliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import type { ILogger } from '../core/index.js';
import { err, ok } from '../core/index.js';
import { collectRealVotes, executeAgentVote } from './voter-agents.js';
import { executeWithRetries } from './voter-execution.js';

vi.mock('../utils/async-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/async-utils.js')>();
  return { ...actual, delay: vi.fn(() => Promise.resolve()) };
});

const LOGGER: ILogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
  setLevel: vi.fn(),
};
const REFUSAL = 'Codex sandbox cannot enforce read-only analysis on this host';
const APPROVE = JSON.stringify({
  decision: 'approve',
  reasoning: 'Reviewed the artifact.',
  confidence: 0.9,
});

function failingCli(error: CliError): ICliAdapter {
  return {
    name: 'codex',
    transport: 'subprocess',
    capabilities: DEFAULT_CAPABILITIES.codex,
    enforcesReadOnlyAnalysis: true,
    execute: vi.fn().mockResolvedValue(err(error)),
    healthCheck: vi.fn(),
    getCapacity: vi.fn(),
    getVersion: vi.fn(),
    getModelInfo: () => ({
      id: 'test-codex',
      name: 'test-codex',
      contextWindow: 100_000,
      maxOutput: 4_000,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    }),
    initialize: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('non-retryable voter errors (#6846, item 1)', () => {
  it.each([
    ['host-unavailable', () => createHostUnavailableCliError(REFUSAL, 'codex'), false],
    ['plain EXECUTION_ERROR', () => createCliError('EXECUTION_ERROR', REFUSAL, 'codex'), undefined],
    ['TIMEOUT', () => createCliError('TIMEOUT', REFUSAL, 'codex'), undefined],
  ] as const)('the CLI bridge maps %s retryability', async (_label, makeError, retryable) => {
    const adapter = new CliToModelAdapter(failingCli(makeError()));
    const result = await adapter.complete({ messages: [{ role: 'user', content: 'Review.' }] });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a bridged error');
    expect(result.error.message).toBe(REFUSAL);
    expect(result.error.retryable).toBe(retryable);
    if (retryable === undefined) expect(result.error.retryable).toBeUndefined();
    // ModelError declares and assigns this class field even when the option is omitted.
    expect('retryable' in result.error).toBe(true);
  });

  it('calls the adapter exactly once and records the original host-unavailable reason', async () => {
    const cli = failingCli(createHostUnavailableCliError(REFUSAL, 'codex'));
    const result = await executeAgentVote(
      'architect',
      'Review.',
      new CliToModelAdapter(cli),
      LOGGER,
      {
        timeoutMs: 5_000,
        maxRetries: 2,
      }
    );
    expect(cli.execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      role: 'architect',
      source: 'error',
      error: REFUSAL,
      vote: {
        decision: 'abstain',
        reasoning: `[Error] Vote execution failed: ${REFUSAL}`,
        confidence: 0,
      },
      processingTimeMs: expect.any(Number),
      cli: 'codex',
    });
  });

  it('does not relaunch a host-unavailable seat in the errored-role pass', async () => {
    const cli = failingCli(createHostUnavailableCliError(REFUSAL, 'codex'));
    const results = await collectRealVotes({
      roles: ['architect'],
      proposal: 'Review.',
      adapter: new CliToModelAdapter(cli),
      logger: LOGGER,
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
      erroredRoleBackoffMs: 0,
    });
    expect(cli.execute).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: 'error', error: REFUSAL });
    expect(results[0]?.retried).toBeUndefined();
  });

  it('plain EXECUTION_ERROR still exhausts the retry budget', async () => {
    const cli = failingCli(createCliError('EXECUTION_ERROR', 'Temporary gateway failure', 'codex'));
    const result = await executeWithRetries({
      role: 'security',
      proposal: 'Review.',
      adapter: new CliToModelAdapter(cli),
      logger: LOGGER,
      timeoutMs: 5_000,
      maxRetries: 2,
    });
    expect(cli.execute).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ ok: false, error: 'Temporary gateway failure' });
    if (result.ok) throw new Error('Expected exhausted retries');
    expect(result.retryable).toBeUndefined();
  });

  it('recovers a transient seat while leaving a non-retryable seat errored', async () => {
    const refused = failingCli(createHostUnavailableCliError(REFUSAL, 'codex'));
    const transient = failingCli(
      createCliError('EXECUTION_ERROR', 'Temporary gateway failure', 'codex')
    );
    vi.mocked(transient.execute)
      .mockResolvedValueOnce(
        err(createCliError('EXECUTION_ERROR', 'Temporary gateway failure', 'codex'))
      )
      .mockResolvedValue(ok({ text: APPROVE, model: 'test-codex' }));
    const results = await collectRealVotes({
      roles: ['architect', 'security'],
      proposal: 'Review.',
      gatewayAdapters: [new CliToModelAdapter(transient)],
      roleAdapters: new Map([
        ['architect', new CliToModelAdapter(refused)],
        ['security', new CliToModelAdapter(transient)],
      ]),
      logger: LOGGER,
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
      erroredRoleBackoffMs: 0,
    });
    expect(refused.execute).toHaveBeenCalledTimes(1);
    expect(transient.execute).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ source: 'error', error: REFUSAL });
    expect(results[1]).toMatchObject({ source: 'llm', retried: true });
  });

  it('plain EXECUTION_ERROR retries structured output without responseFormat', async () => {
    const cli = failingCli(
      createCliError('EXECUTION_ERROR', 'No endpoints found that support tool use.', 'codex')
    );
    vi.mocked(cli.execute)
      .mockResolvedValueOnce(
        err(createCliError('EXECUTION_ERROR', 'No endpoints found that support tool use.', 'codex'))
      )
      .mockResolvedValue(ok({ text: APPROVE }));
    const adapter = new CliToModelAdapter(cli);
    const complete = vi.spyOn(adapter, 'complete');
    const result = await executeAgentVote('architect', 'Review.', adapter, LOGGER, {
      timeoutMs: 5_000,
      maxRetries: 0,
    });
    expect(cli.execute).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]?.[0].responseFormat).toBeDefined();
    expect(complete.mock.calls[1]?.[0].responseFormat).toBeUndefined();
    expect(result.source).toBe('llm');
  });

  it('plain EXECUTION_ERROR is rerun in the errored-role pass after exhausting retries', async () => {
    const cli = failingCli(createCliError('EXECUTION_ERROR', 'Temporary gateway failure', 'codex'));
    const results = await collectRealVotes({
      roles: ['architect'],
      proposal: 'Review.',
      adapter: new CliToModelAdapter(cli),
      logger: LOGGER,
      timeoutMs: 5_000,
      maxRetries: 2,
      interAgentDelayMs: 0,
      erroredRoleBackoffMs: 0,
    });
    expect(cli.execute).toHaveBeenCalledTimes(6);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: 'error', error: 'Temporary gateway failure' });
  });

  it('still retries an unverifiable fallback after a non-retryable primary error', async () => {
    const primary = failingCli(createHostUnavailableCliError(REFUSAL, 'codex'));
    const fallback = {
      ...failingCli(createCliError('EXECUTION_ERROR', REFUSAL, 'codex')),
      name: 'claude' as const,
    };
    vi.mocked(fallback.execute)
      .mockResolvedValueOnce(
        ok({
          text: JSON.stringify({
            decision: 'abstain',
            reasoning: 'UNVERIFIABLE: could not read the artifact.',
            confidence: 0,
          }),
        })
      )
      .mockResolvedValue(ok({ text: APPROVE }));
    const results = await collectRealVotes({
      roles: ['architect'],
      proposal: 'Review.',
      gatewayAdapters: [new CliToModelAdapter(fallback)],
      roleAdapters: new Map([['architect', new CliToModelAdapter(primary)]]),
      logger: LOGGER,
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
      erroredRoleBackoffMs: 0,
    });
    expect(fallback.execute).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ source: 'llm', retried: true });
  });

  it.each([false, true])('uses the fallback failure retryability: %s', async (retryable) => {
    const primary = failingCli(
      retryable
        ? createHostUnavailableCliError(REFUSAL, 'codex')
        : createCliError('EXECUTION_ERROR', REFUSAL, 'codex')
    );
    const fallback = {
      ...failingCli(
        retryable
          ? createCliError('EXECUTION_ERROR', REFUSAL, 'claude')
          : createHostUnavailableCliError(REFUSAL, 'claude')
      ),
      name: 'claude' as const,
    };
    const results = await collectRealVotes({
      roles: ['architect'],
      proposal: 'Review.',
      gatewayAdapters: [new CliToModelAdapter(fallback)],
      roleAdapters: new Map([['architect', new CliToModelAdapter(primary)]]),
      logger: LOGGER,
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
      erroredRoleBackoffMs: 0,
    });
    expect(fallback.execute).toHaveBeenCalledTimes(retryable ? 2 : 1);
    expect(results[0]).toMatchObject({ source: 'error', error: REFUSAL });
  });
});
