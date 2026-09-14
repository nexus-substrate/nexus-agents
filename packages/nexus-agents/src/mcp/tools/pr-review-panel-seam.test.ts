/**
 * Seam test for the #6003 panel budget: the tool's OWN panel shape — the
 * gateway adapters it was registered with — must reach the budget, and the
 * seats it budgeted must be the seats it votes on.
 *
 * The unit tests either side pass while this wire is cut: replacing the
 * tool's `{ gatewayAdapters: adapters }` with `{ gatewayAdapters: undefined }`
 * left every other suite green (adversarial review of PR #6176, mutation f).
 *
 * `collectRealVotes` is mocked to return one live approve and to capture the
 * `roleAdapters` the tool handed it; `getAvailableClis` answers "none" so the
 * mutated path — the CLI round-robin — cannot spawn under the guard.
 *
 * @module mcp/tools/pr-review-panel-seam.test
 */

import { describe, it, expect, vi } from 'vitest';
import type { IModelAdapter } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { VoterRole } from '../../cli/vote-types.js';
import type { HandlerContext } from '../middleware/secure-handler.js';

const captured: { roleAdapters: ReadonlyMap<VoterRole, IModelAdapter> | undefined } = {
  roleAdapters: undefined,
};
/** Read through a call so an earlier `= undefined` reset does not narrow the type. */
function handedSeats(): ReadonlyMap<VoterRole, IModelAdapter> | undefined {
  return captured.roleAdapters;
}

vi.mock('../../cli/voter-agents.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli/voter-agents.js')>()),
  collectRealVotes: (opts: { roleAdapters?: ReadonlyMap<VoterRole, IModelAdapter> }) => {
    captured.roleAdapters = opts.roleAdapters;
    return Promise.resolve([
      {
        role: 'architect',
        vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
        source: 'llm',
        cli: 'gateway',
        processingTimeMs: 1,
      },
    ]);
  },
}));
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

import { registerPrReviewTool, type PrReviewResponse } from './pr-review-tool.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<{ content: Array<{ text: string }> }>;

/** The middleware's view when it stripped nothing (#5385). */
const CTX: Ctx = {
  logger: createLogger({ tool: 'pr-review-panel-seam.test' }),
  sanitization: {
    wasModified: false,
    commentsRemoved: 0,
    fieldsModified: 0,
    tagsRemoved: 0,
    rawFieldHashes: {},
  },
};

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

/** A gateway adapter on a model the REAL registry knows (1M-token window). */
const knownGatewayModel = { modelId: 'claude-fable-5' } as unknown as IModelAdapter;

// Over the 50,000-byte hash cap, far under a 1M-token panel: the row where the
// panel reads everything and only the binding is a prefix.
const OVER_CAP_DIFF =
  'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -0,0 +1,13000 @@\n' +
  '+pad\n'.repeat(13_000);

describe('the tool’s gateway adapters reach the panel budget (#6003)', () => {
  it('a registered gateway model with a known window yields a registry budget and a full panel read', async () => {
    const result = await captureHandler([knownGatewayModel])(
      { prTitle: 'seam', prDiff: OVER_CAP_DIFF, simulate: false },
      CTX
    );
    const text = result.content[0]!.text;
    if (!text.startsWith('{')) throw new Error(`handler returned an error envelope: ${text}`);
    const response = JSON.parse(text) as PrReviewResponse;
    expect(response.coverage?.budgetSource).toBe('registry');
    expect(response.coverage?.budgetDetail).toContain('claude-fable-5');
    expect(response.coverage?.panelRead).toBe('full');
    expect(response.coverage?.binding).toBe('prefix');
  });

  it('the seats the tool budgeted are the seats it hands to the vote', async () => {
    captured.roleAdapters = undefined;
    await captureHandler([knownGatewayModel])(
      { prTitle: 'seam', prDiff: OVER_CAP_DIFF, simulate: false },
      CTX
    );
    const seats = handedSeats();
    expect(seats).toBeDefined();
    expect(seats?.size).toBeGreaterThan(0);
    for (const seat of seats?.values() ?? []) expect(seat).toBe(knownGatewayModel);
  });
});
