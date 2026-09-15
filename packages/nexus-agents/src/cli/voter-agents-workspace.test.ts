/**
 * Seam test for #6254: every seat's USER prompt must name the working
 * directory the panel runs in and say that reading it is expected. Everything
 * between the collector and the adapter is real; only the adapter is canned,
 * and it captures the request so the assertion reads the prompt the model
 * would have seen.
 *
 * Measured on the CLI governor panels of 2026-09-14: a `gemini-3.1-pro-preview`
 * seat abstained "UNVERIFIABLE: ... no repository or accessible sandbox was
 * provided" while the claude seats on the same panel read the head. The
 * spawn gave agy no tree (`--add-dir`, fixed in the adapter) and the prompt
 * never said where the tree was — this test pins the second half.
 *
 * @module cli/voter-agents-workspace.test
 */

import { describe, expect, it, vi } from 'vitest';
import type { CompletionRequest, IModelAdapter, ILogger } from '../core/index.js';
import { collectRealVotes, executeAgentVote } from './voter-agents.js';
import type { VoterRole } from './vote-types.js';

const ALL_ROLES: readonly VoterRole[] = [
  'architect',
  'security',
  'devex',
  'ai_ml',
  'pm',
  'catfish',
  'scope_steward',
];

const QUIET: ILogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as ILogger;

/** An adapter that approves everything and records every request it receives. */
function capturingAdapter(): { adapter: IModelAdapter; requests: CompletionRequest[] } {
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
          content: JSON.stringify({
            decision: 'approve',
            reasoning: 'Sound enough for a test fixture.',
            confidence: 0.8,
          }),
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
  return { adapter, requests };
}

function userPromptsOf(requests: readonly CompletionRequest[]): string[] {
  return requests.map((request) => {
    const user = request.messages.find((m) => m.role === 'user');
    if (user === undefined || typeof user.content !== 'string') {
      throw new Error('vote request carried no string user prompt');
    }
    return user.content;
  });
}

describe('collectRealVotes tells every seat where the repository is (#6254)', () => {
  it("every seat's user prompt names the process working directory and says reading it is expected", async () => {
    const { adapter, requests } = capturingAdapter();
    const results = await collectRealVotes({
      roles: ALL_ROLES,
      proposal: 'Ratify PR #1 at head abc123',
      logger: QUIET,
      adapter,
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
    });
    // Every seat parsed as a live vote — an errored seat would be re-run by the
    // #5578 retry and double the request count, hiding a prompt defect.
    expect(results.map((r) => r.source)).toEqual(ALL_ROLES.map(() => 'llm'));
    const prompts = userPromptsOf(requests);
    expect(prompts).toHaveLength(ALL_ROLES.length);
    for (const prompt of prompts) {
      expect(prompt).toContain('REPOSITORY ACCESS:');
      expect(prompt).toContain(process.cwd());
      expect(prompt).toMatch(/reading it is expected/i);
    }
  });

  it('uses the supplied scratch workspace for every seat prompt and completion', async () => {
    const { adapter, requests } = capturingAdapter();
    const workspace = '/tmp/vote-scratch';
    const workspaceSha = 'a'.repeat(40);
    await collectRealVotes({
      roles: ALL_ROLES,
      proposal: 'p',
      logger: QUIET,
      adapter,
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
      workspace,
      workspaceSha,
    });
    expect(requests).toHaveLength(ALL_ROLES.length);
    for (const request of requests) expect(request.workDir).toBe(workspace);
    for (const prompt of userPromptsOf(requests)) {
      expect(prompt).toContain(`ratified head ${workspaceSha} at ${workspace}`);
      expect(prompt).toContain('read only.');
    }
  });

  it('the block sits in the USER prompt, not the pinned system prompt', async () => {
    // The seven system prompts are snapshotted byte-for-byte
    // (`voter-prompts-project.test.ts`); the working directory is per-run
    // context and belongs next to the proposal.
    const { adapter, requests } = capturingAdapter();
    await collectRealVotes({
      roles: ['architect'],
      proposal: 'p',
      logger: QUIET,
      adapter,
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
    });
    const system = requests[0]?.messages.find((m) => m.role === 'system');
    expect(system?.content).not.toContain('REPOSITORY ACCESS:');
    expect(system?.content).not.toContain(process.cwd());
  });
});

describe('executeAgentVote without a workspace claims no tree — the empty case', () => {
  it('a direct call that passes no workspace renders no REPOSITORY ACCESS block', async () => {
    const { adapter, requests } = capturingAdapter();
    await executeAgentVote('architect', 'p', adapter, QUIET, { timeoutMs: 5_000, maxRetries: 0 });
    const [prompt] = userPromptsOf(requests);
    expect(prompt).not.toContain('REPOSITORY ACCESS:');
    expect(requests[0]).not.toHaveProperty('workDir');
  });

  it('a direct call with a workspace renders it', async () => {
    const { adapter, requests } = capturingAdapter();
    await executeAgentVote('architect', 'p', adapter, QUIET, {
      timeoutMs: 5_000,
      maxRetries: 0,
      workspace: '/srv/checkouts/widgets',
    });
    const [prompt] = userPromptsOf(requests);
    expect(prompt).toContain('/srv/checkouts/widgets');
  });
});
