/**
 * Seam test for #6110: the target project handed to `collectRealVotes` must
 * reach the SYSTEM prompt of every seat. Everything between the collector and
 * the adapter is real; only the adapter is canned, and it captures the request
 * it was given so the assertion reads the prompt the model would have seen.
 *
 * @module cli/voter-agents-project.test
 */

import { describe, expect, it, vi } from 'vitest';
import type { CompletionRequest, IModelAdapter, ILogger } from '../core/index.js';
import { collectRealVotes } from './voter-agents.js';
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

function systemPromptsOf(requests: readonly CompletionRequest[]): string[] {
  return requests.map((request) => {
    const system = request.messages.find((m) => m.role === 'system');
    if (system === undefined || typeof system.content !== 'string') {
      throw new Error('vote request carried no string system prompt');
    }
    return system.content;
  });
}

describe('collectRealVotes threads the target project into every system prompt (#6110)', () => {
  it("with project 'acme/widgets', no seat's system prompt mentions nexus-agents", async () => {
    const { adapter, requests } = capturingAdapter();
    const results = await collectRealVotes({
      roles: ALL_ROLES,
      proposal: 'Adopt widgets v2',
      logger: QUIET,
      adapter,
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
      project: 'acme/widgets',
    });
    // Every seat parsed as a live vote — an errored seat would be re-run by the
    // #5578 retry and double the request count, hiding a prompt defect.
    expect(results.map((r) => r.source)).toEqual(ALL_ROLES.map(() => 'llm'));
    const prompts = systemPromptsOf(requests);
    expect(prompts).toHaveLength(ALL_ROLES.length);
    for (const prompt of prompts) {
      expect(prompt).toContain('acme/widgets');
      expect(prompt).not.toContain('nexus-agents');
    }
  });

  it('without a project, every seat judges the nexus-agents project — the pair', async () => {
    // Without this, a prompt that named NO project would pass the row above.
    const { adapter, requests } = capturingAdapter();
    await collectRealVotes({
      roles: ['architect', 'scope_steward'],
      proposal: 'Adopt widgets v2',
      logger: QUIET,
      adapter,
      timeoutMs: 5_000,
      maxRetries: 0,
      interAgentDelayMs: 0,
    });
    for (const prompt of systemPromptsOf(requests)) {
      expect(prompt).toContain('for the nexus-agents project');
    }
  });
});
