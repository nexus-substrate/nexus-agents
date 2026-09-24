/**
 * Seam test for #6754: a pr_review reviewer seat reaches its model in
 * read-only analysis mode. The tool, the panel and the vote request are real;
 * the registered gateway adapter is canned and records every request.
 *
 * `getAvailableClis` answers "none" so no CLI can spawn under the test.
 *
 * @module mcp/tools/pr-review-read-only-seam.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { CompletionRequest, IModelAdapter } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { HandlerContext } from '../middleware/secure-handler.js';

vi.mock('../../cli-adapters/factory.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli-adapters/factory.js')>()),
  getAvailableClis: () => Promise.resolve([]),
}));
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

import { registerPrReviewTool } from './pr-review-tool.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<{ content: Array<{ text: string }> }>;

const CTX: Ctx = {
  logger: createLogger({ tool: 'pr-review-read-only-seam.test' }),
  sanitization: {
    wasModified: false,
    commentsRemoved: 0,
    fieldsModified: 0,
    tagsRemoved: 0,
    rawFieldHashes: {},
    rawFieldBytes: {},
  },
};

/** A gateway adapter on a model the real registry knows, recording every request. */
function recordingGateway(): { adapter: IModelAdapter; requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  const adapter: IModelAdapter = {
    providerId: 'gateway',
    modelId: 'claude-fable-5',
    capabilities: [],
    complete: vi.fn().mockImplementation((request: CompletionRequest) => {
      requests.push(request);
      return Promise.resolve({
        ok: true,
        value: {
          content: JSON.stringify({
            decision: 'approve',
            reasoning: 'Reviewed the one-line diff; fine.',
            confidence: 0.8,
          }),
          usage: {},
          stopReason: 'end_turn',
          model: 'claude-fable-5',
        },
      });
    }),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(1),
    validateConfig: vi.fn().mockReturnValue({ ok: true }),
  };
  return { adapter, requests };
}

function captureHandler(gatewayAdapters: readonly IModelAdapter[]): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool: (_name: string, _schema: unknown, cb: Handler) => {
      handler = cb;
    },
  };
  registerPrReviewTool(server as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
    gatewayAdapters,
  });
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

const DIFF =
  'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -0,0 +1 @@\n+x\n';

describe('pr_review reviewer seats run in read-only analysis mode (#6754)', () => {
  it('every seat request carries accessMode read-only-analysis', async () => {
    const { adapter, requests } = recordingGateway();
    await captureHandler([adapter])({ prTitle: 'seam', prDiff: DIFF, simulate: false }, CTX);
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) expect(request.accessMode).toBe('read-only-analysis');
  });
});
