/**
 * Seam test for #6754: every voter seat reaches its CLI in read-only analysis
 * mode. Everything from the collector to the CLI task is real — the vote
 * request, the CLI→model bridge — and only the CLI adapter at the bottom is
 * canned, recording the `CliTask` it was handed.
 *
 * @module cli/voter-seat-read-only.test
 */

import { describe, expect, it, vi } from 'vitest';
import type { CompletionRequest, IModelAdapter, ILogger } from '../core/index.js';
import { ok } from '../core/index.js';
import type { CliTask, ICliAdapter } from '../cli-adapters/types.js';
import { DEFAULT_CAPABILITIES } from '../cli-adapters/types.js';
import { CliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import { collectRealVotes, executeAgentVote } from './voter-agents.js';
import type { VoterRole } from './vote-types.js';

const ROLES: readonly VoterRole[] = ['architect', 'security', 'scope_steward'];

const QUIET: ILogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as ILogger;

const APPROVE = JSON.stringify({
  decision: 'approve',
  reasoning: 'Fine for a fixture.',
  confidence: 0.8,
});

/** A CLI adapter that answers every task with an approve and records it. */
function recordingCli(enforces: boolean | undefined): { cli: ICliAdapter; tasks: CliTask[] } {
  const tasks: CliTask[] = [];
  const cli: ICliAdapter = {
    name: 'claude',
    transport: 'subprocess',
    capabilities: DEFAULT_CAPABILITIES.claude,
    ...(enforces !== undefined ? { enforcesReadOnlyAnalysis: enforces } : {}),
    execute: (task: CliTask) => {
      tasks.push(task);
      return Promise.resolve(ok({ text: APPROVE, model: 'claude-fable-5' }));
    },
    healthCheck: vi.fn(),
    getCapacity: vi.fn(),
    getVersion: vi.fn(),
    getModelInfo: () => ({
      id: 'claude-fable-5',
      name: 'claude-fable-5',
      contextWindow: 1_000_000,
      maxOutput: 1,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    }),
    initialize: vi.fn(),
    dispose: vi.fn(),
  };
  return { cli, tasks };
}

describe('voter seats run in read-only analysis mode (#6754)', () => {
  it('collectRealVotes hands every seat’s CLI a read-only task', async () => {
    const { cli, tasks } = recordingCli(true);
    const results = await collectRealVotes({
      roles: ROLES,
      proposal: 'Ratify PR #1',
      logger: QUIET,
      adapter: new CliToModelAdapter(cli),
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
    });
    expect(results.map((r) => r.source)).toEqual(ROLES.map(() => 'llm'));
    expect(tasks).toHaveLength(ROLES.length);
    for (const task of tasks) expect(task.accessMode).toBe('read-only-analysis');
  });

  it('a CLI that cannot enforce the mode errors the seat instead of voting', async () => {
    const { cli, tasks } = recordingCli(undefined);
    const result = await executeAgentVote('architect', 'p', new CliToModelAdapter(cli), QUIET, {
      timeoutMs: 5_000,
      maxRetries: 0,
    });
    expect(result.source).toBe('error');
    expect(result.error).toMatch(/read-only analysis mode/);
    expect(tasks).toHaveLength(0);
  });

  it('a direct-API seat receives the mode on its request too', async () => {
    const requests: CompletionRequest[] = [];
    const adapter: IModelAdapter = {
      providerId: 'test',
      modelId: 'test-model',
      capabilities: [],
      complete: vi.fn().mockImplementation((request: CompletionRequest) => {
        requests.push(request);
        return Promise.resolve({
          ok: true,
          value: {
            content: APPROVE,
            usage: {},
            stopReason: 'end_turn',
            model: 'test-model',
          },
        });
      }),
      stream: vi.fn(),
      countTokens: vi.fn().mockResolvedValue(1),
      validateConfig: vi.fn().mockReturnValue({ ok: true }),
    };
    await executeAgentVote('security', 'p', adapter, QUIET, { timeoutMs: 5_000, maxRetries: 0 });
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) expect(request.accessMode).toBe('read-only-analysis');
  });
});
