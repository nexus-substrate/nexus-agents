/**
 * #6123: `pr_review` threads the caller's target project into every seat's
 * SYSTEM prompt and discloses which source named it, exactly as
 * `consensus_vote` does since #6110.
 *
 * The handler, the resolver and `collectRealVotes` are real; the module mock
 * only pins a capturing adapter onto the collector so the assertion reads the
 * prompt the model would have seen. The default row points `process.cwd()` at
 * a directory outside any repository so it never depends on this checkout's
 * own remote, and pins the prompts to the seven-prompt snapshot from #6110.
 *
 * @module mcp/tools/pr-review-project.test
 */
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { CompletionRequest, ILogger, IModelAdapter } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { VoterRole } from '../../cli/vote-types.js';
import { mkdtempOutsideRepo } from '../../testing/non-repo-temp-dir.js';
import { PR_REVIEW_RECORDS_PATH_ENV } from '../../audit/pr-review-record-store.js';
import type { HandlerContext } from '../middleware/secure-handler.js';

const captured: { requests: CompletionRequest[] } = { requests: [] };

/** An adapter that approves everything and records every request it receives. */
function capturingAdapter(): IModelAdapter {
  return {
    providerId: 'test',
    modelId: 'test-model',
    capabilities: [],
    complete: vi.fn().mockImplementation((request: CompletionRequest) => {
      captured.requests.push(request);
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
}

// The REAL collector, handed a uniform capturing adapter so every seat's
// prompt is built by the production path and read back here.
vi.mock('../../cli/voter-agents.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../cli/voter-agents.js')>();
  return {
    ...actual,
    collectRealVotes: (opts: Parameters<typeof actual.collectRealVotes>[0]) =>
      actual.collectRealVotes({
        ...opts,
        adapter: capturingAdapter(),
        timeoutMs: 5_000,
        maxRetries: 0,
        interAgentDelayMs: 0,
      }),
  };
});
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

import {
  PR_REVIEW_ROLES,
  PrReviewInputSchema,
  registerPrReviewTool,
  type PrReviewResponse,
} from './pr-review-tool.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<{ content: Array<{ text: string }> }>;

/** The middleware's view when it stripped nothing (#5385). */
const CLEAN_SANITIZATION: Ctx['sanitization'] = {
  wasModified: false,
  commentsRemoved: 0,
  fieldsModified: 0,
  tagsRemoved: 0,
  rawFieldHashes: {},
};

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

const FIXTURE_PATH = join(import.meta.dirname, '../../cli/__fixtures__/voter-prompts.default.json');

function defaultSnapshot(): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
  if (typeof parsed !== 'object' || parsed === null) throw new Error('fixture is not an object');
  return parsed as Record<string, string>;
}

/** The system prompt of every captured request, in request order. */
function systemPrompts(): string[] {
  return captured.requests.map((request) => {
    const system = request.messages.find((m) => m.role === 'system');
    if (system === undefined || typeof system.content !== 'string') {
      throw new Error('vote request carried no string system prompt');
    }
    return system.content;
  });
}

/** The role whose default prompt matches this system prompt, or undefined. */
function roleOf(prompt: string, snapshot: Record<string, string>): VoterRole | undefined {
  return (Object.keys(snapshot) as VoterRole[]).find((role) => snapshot[role] === prompt);
}

const ARGS = {
  prTitle: 'Adopt widgets v2',
  prDiff: 'diff --git a/x.ts b/x.ts\n@@ -1 +1 @@\n-a\n+b\n',
  simulate: false,
};

describe('pr_review threads the target project into the voter prompts (#6123)', () => {
  let cwd: string;
  let prevRecordsPath: string | undefined;
  let logger: ReturnType<typeof createLogger>;
  let infoSpy: MockInstance<ILogger['info']>;

  beforeEach(() => {
    cwd = mkdtempOutsideRepo('nexus-6123-pr-');
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    prevRecordsPath = process.env[PR_REVIEW_RECORDS_PATH_ENV];
    process.env[PR_REVIEW_RECORDS_PATH_ENV] = join(cwd, 'pr-review-records.jsonl');
    captured.requests = [];
    logger = createLogger({ tool: 'pr-review-project.test' });
    infoSpy = vi.spyOn(logger, 'info');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevRecordsPath === undefined)
      Reflect.deleteProperty(process.env, PR_REVIEW_RECORDS_PATH_ENV);
    else process.env[PR_REVIEW_RECORDS_PATH_ENV] = prevRecordsPath;
    rmSync(cwd, { recursive: true, force: true });
  });

  async function run(args: Record<string, unknown>): Promise<PrReviewResponse> {
    const result = await captureHandler()(args, { logger, sanitization: CLEAN_SANITIZATION });
    return JSON.parse(result.content[0]!.text) as PrReviewResponse;
  }

  it('the input schema accepts the same project shape as consensus_vote', () => {
    expect(PrReviewInputSchema.safeParse({ ...ARGS, project: 'acme/widgets' }).success).toBe(true);
    expect(PrReviewInputSchema.safeParse({ ...ARGS, project: '@acme/widgets' }).success).toBe(true);
    expect(PrReviewInputSchema.safeParse({ ...ARGS, project: 'evil; rm -rf /' }).success).toBe(
      false
    );
  });

  it("project 'acme/widgets': no seat's system prompt mentions nexus-agents", async () => {
    const response = await run({ ...ARGS, project: 'acme/widgets' });
    // Every seat parsed as a live vote — an errored seat would be re-run by the
    // #5578 retry and double the request count, hiding a prompt defect.
    expect(response.reviews.map((r) => r.source)).toEqual(PR_REVIEW_ROLES.map(() => 'llm'));
    const prompts = systemPrompts();
    expect(prompts).toHaveLength(PR_REVIEW_ROLES.length);
    for (const prompt of prompts) {
      expect(prompt).toContain('acme/widgets');
      expect(prompt).not.toContain('nexus-agents');
    }
    expect(response.project).toEqual({ name: 'acme/widgets', source: 'input' });
  });

  it('no project: the five prompts equal the pinned default snapshot, source default', async () => {
    const response = await run(ARGS);
    const snapshot = defaultSnapshot();
    const prompts = systemPrompts();
    expect(prompts).toHaveLength(PR_REVIEW_ROLES.length);
    const roles = prompts.map((prompt) => roleOf(prompt, snapshot));
    expect(roles).not.toContain(undefined);
    expect(new Set(roles)).toEqual(new Set(PR_REVIEW_ROLES));
    expect(response.project).toEqual({ name: 'nexus-agents', source: 'default' });
  });

  it('logs the resolution once per run', async () => {
    await run({ ...ARGS, project: 'acme/widgets' });
    const lines = infoSpy.mock.calls.filter((call) => call[0] === 'Voter project resolved');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.[1]).toEqual({ project: 'acme/widgets', source: 'input' });
  });
});
