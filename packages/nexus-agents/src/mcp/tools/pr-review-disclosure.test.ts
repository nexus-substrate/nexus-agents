/**
 * Seam test for the sanitization disclosure (#5385).
 *
 * The unit tests either side of this one pass while the wiring between them is
 * broken. `secure-handler.test.ts` proves the middleware puts `commentsRemoved`
 * on `HandlerContext`; `pr-review-tool.test.ts` proves `buildPrReviewProposal`
 * renders the note when told a count. Neither proves the HANDLER carries the
 * one to the other — mutating both call sites to pass `0` left all 158 of those
 * tests green.
 *
 * That gap is the whole defect: on the MCP path the middleware strips the
 * comments before dispatch, so the builder re-sanitizes clean text, counts 0,
 * and the note never fires — on the one path that persists a governance record.
 *
 * `collectRealVotes` is mocked here purely to capture the proposal text the
 * panel would have received. It lives in its own file so that mock does not
 * leak into the existing suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const captured: { proposal: string | undefined } = { proposal: undefined };

vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { proposal: string }) => {
    captured.proposal = opts.proposal;
    return Promise.resolve([]);
  },
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
import { createLogger } from '../../core/index.js';
import type { HandlerContext } from '../middleware/secure-handler.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<unknown>;

/** Registers against a mock server and returns the bare `(args, ctx)` handler. */
function captureHandler(): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool: (_name: string, _schema: unknown, cb: Handler) => {
      handler = cb;
    },
  };
  registerPrReviewTool(server as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

const ARGS = {
  prTitle: 'Regenerate governance blocks',
  prDescription: 'body with the comment already stripped by the middleware',
  prDiff: 'diff --git a/CLAUDE.md b/CLAUDE.md\n+prose\n',
  simulate: true,
};

function ctx(commentsRemoved: number): Ctx {
  return {
    logger: createLogger({ tool: 'pr-review-disclosure.test' }),
    sanitization: { wasModified: commentsRemoved > 0, commentsRemoved },
  };
}

describe('the middleware disclosure reaches the voter proposal (#5385)', () => {
  beforeEach(() => {
    captured.proposal = undefined;
  });

  it('annotates the proposal with the count the MIDDLEWARE reported', async () => {
    // The args are already clean — exactly as the handler receives them on the
    // MCP path — so the builder's own re-sanitization counts 0. The note can
    // only appear if the handler forwarded ctx.sanitization.commentsRemoved.
    await captureHandler()(ARGS, ctx(2));

    expect(captured.proposal).toBeDefined();
    expect(captured.proposal).toContain('2 HTML comment(s) were removed');
  });

  it('leaves the proposal unannotated when the middleware removed nothing', async () => {
    await captureHandler()(ARGS, ctx(0));

    expect(captured.proposal).toBeDefined();
    expect(captured.proposal).not.toContain('HTML comment(s) were removed');
  });
});
