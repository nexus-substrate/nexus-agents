/**
 * Per-vendor retry-horizon capture, end to end (#4606).
 *
 * `recordProviderQuotaExhaustion` accepts exactly one input — a retry horizon
 * in milliseconds — and #4605 wired the API arms to feed it. But the horizon
 * was parsed out of prose only, and `transformError` dropped the HTTP response
 * before anyone could read `Retry-After`. Measured before this change:
 *
 * | vendor    | horizon in the body        | reached the tracker? |
 * | --------- | -------------------------- | -------------------- |
 * | OpenAI    | "Please try again in 20s"  | yes; "632ms" no      |
 * | Anthropic | nothing at all             | NO                   |
 * | Gemini    | `"retryDelay":"33s"`       | NO                   |
 *
 * So two of the three arms could not report a quota horizon by construction.
 * Each vendor below gets both halves of the mutation check: a 429 that states
 * a durable horizon must reach `exhausted`, and a 429 that states nothing
 * anywhere must stay `unmeasured` — never `healthy`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openaiCreate: vi.fn(),
  geminiGenerate: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mocks.anthropicCreate, stream: vi.fn() };
  },
}));

// Keep the REAL `APIError`: the OpenAI adapter's #4047 re-messaging branch is
// `instanceof APIError`, and that branch is exactly where the headers used to
// be dropped on the floor.
vi.mock('openai', async () => {
  const actual = await vi.importActual<typeof import('openai')>('openai');
  return {
    default: class MockOpenAI {
      chat = { completions: { create: mocks.openaiCreate } };
    },
    APIError: actual.APIError,
  };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = { generateContent: mocks.geminiGenerate, generateContentStream: vi.fn() };
  },
}));

import { APIError } from 'openai';
import { ClaudeAdapter } from './claude-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { createModelToCliAdapter } from '../cli-adapters/model-to-cli-adapter.js';
import { assessCapacity } from '../cli-adapters/routing/stages/capacity-stage.js';
import { CapacityFilterStage } from '../cli-adapters/routing/stages/capacity-stage.js';
import {
  createRoutingContext,
  getRemainingCandidates,
} from '../cli-adapters/routing/router-stage.js';
import type { IModelAdapter } from '../core/index.js';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../core/index.js';
import type { CliName, RoutingArmId } from '../cli-adapters/types.js';

/** Longer than the tracker's 60s window, so it means quota and not throttle. */
const DURABLE_SECONDS = 3_600;
const NOW = 1_700_000_000_000;

/** Run one failing call through the bridge and report what the arm can say. */
async function armAfterOneFailure(
  modelAdapter: IModelAdapter,
  name: CliName
): Promise<{ retryAfterMs: number | undefined; grade: string; quotaExhausted: boolean }> {
  const bridge = createModelToCliAdapter(modelAdapter, { name });
  const result = await bridge.execute({ content: 'hi' });
  expect(result.ok).toBe(false);
  const capacity = await bridge.getCapacity();
  return {
    retryAfterMs: result.ok ? undefined : result.error.retryAfterMs,
    grade: assessCapacity(capacity),
    quotaExhausted: capacity.quotaExhausted,
  };
}

/**
 * The Anthropic SDK's thrown `APIError` shape: status, the JSON body, and the
 * response headers hung straight off the error.
 */
function anthropicRateLimit(headers?: Record<string, string>): Error {
  const body = { type: 'error', error: { type: 'rate_limit_error', message: 'rate limit' } };
  return Object.assign(new Error(`429 ${JSON.stringify(body)}`), {
    status: 429,
    error: body,
    ...(headers === undefined ? {} : { headers: new Headers(headers) }),
  });
}

/** The `@google/genai` `ApiError`: `{message, status}` and NO headers at all. */
function geminiRateLimit(body: unknown): Error {
  return Object.assign(new Error(JSON.stringify(body)), { name: 'ApiError', status: 429 });
}

beforeEach(() => {
  vi.clearAllMocks();
  setTimeProvider(new FixedTimeProvider(NOW));
});

afterEach(() => {
  resetTimeProvider();
});

describe('Anthropic arm — horizon lives ONLY in the header (#4606)', () => {
  const config = { modelId: 'claude-sonnet-4', apiKey: 'test-api-key-12345' };

  it('reaches exhausted from a Retry-After header its 429 body never mentions', async () => {
    mocks.anthropicCreate.mockRejectedValue(
      anthropicRateLimit({ 'retry-after': String(DURABLE_SECONDS) })
    );

    const arm = await armAfterOneFailure(new ClaudeAdapter(config), 'claude');

    expect(arm.retryAfterMs).toBe(DURABLE_SECONDS * 1000);
    expect(arm.quotaExhausted).toBe(true);
    expect(arm.grade).toBe('exhausted');
  });

  it('stays unmeasured — never healthy — with neither header nor prose', async () => {
    mocks.anthropicCreate.mockRejectedValue(anthropicRateLimit());

    const arm = await armAfterOneFailure(new ClaudeAdapter(config), 'claude');

    expect(arm.retryAfterMs).toBeUndefined();
    expect(arm.quotaExhausted).toBe(false);
    expect(arm.grade).toBe('unmeasured');
  });

  it('accepts the HTTP-date form of Retry-After', async () => {
    mocks.anthropicCreate.mockRejectedValue(
      anthropicRateLimit({ 'retry-after': new Date(NOW + DURABLE_SECONDS * 1000).toUTCString() })
    );

    const arm = await armAfterOneFailure(new ClaudeAdapter(config), 'claude');

    expect(arm.retryAfterMs).toBe(DURABLE_SECONDS * 1000);
    expect(arm.grade).toBe('exhausted');
  });

  it('treats an unreadable Retry-After as absent, not as a zero horizon', async () => {
    mocks.anthropicCreate.mockRejectedValue(anthropicRateLimit({ 'retry-after': 'soon' }));

    const arm = await armAfterOneFailure(new ClaudeAdapter(config), 'claude');

    expect(arm.retryAfterMs).toBeUndefined();
    expect(arm.grade).toBe('unmeasured');
  });

  it('never lets the rest of the header bag out of the boundary', async () => {
    mocks.anthropicCreate.mockRejectedValue(
      anthropicRateLimit({
        authorization: 'Bearer sk-ant-test-not-a-real-key',
        'x-api-key': 'sk-ant-test-also-not-real',
        'retry-after': String(DURABLE_SECONDS),
      })
    );

    const bridge = createModelToCliAdapter(new ClaudeAdapter(config), { name: 'claude' });
    const result = await bridge.execute({ content: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Everything the bridge exposes — message, cause chain, the whole error —
      // must be free of the credentials that rode in the same bag.
      const exposed = JSON.stringify({
        error: result.error,
        message: result.error.message,
        cause: result.error.cause?.message,
      });
      expect(exposed).not.toContain('sk-ant-test');
      expect(exposed).not.toContain('Bearer');
      expect(exposed).not.toContain('authorization');
      expect(result.error.retryAfterMs).toBe(DURABLE_SECONDS * 1000);
    }
  });
});

describe('OpenAI arm — header beats prose, and sub-second prose now parses (#4606)', () => {
  const config = { modelId: 'gpt-4o', apiKey: 'test-api-key-12345' };

  function openaiRateLimit(message: string, headers?: Record<string, string>): APIError {
    return new APIError(
      429,
      { error: { message, type: 'rate_limit_exceeded' } },
      message,
      headers === undefined ? undefined : new Headers(headers)
    );
  }

  it('prefers the Retry-After header over the shorter horizon stated in prose', async () => {
    // The prose says 20s (a throttle); the header says an hour (quota). The
    // authoritative field must win, or the arm under-reports its outage.
    mocks.openaiCreate.mockRejectedValue(
      openaiRateLimit('Rate limit reached. Please try again in 20s', {
        'retry-after': String(DURABLE_SECONDS),
      })
    );

    const arm = await armAfterOneFailure(new OpenAIAdapter(config), 'codex');

    expect(arm.retryAfterMs).toBe(DURABLE_SECONDS * 1000);
    expect(arm.grade).toBe('exhausted');
  });

  it('keeps the prose path working when the gateway sends no header', async () => {
    mocks.openaiCreate.mockRejectedValue(
      openaiRateLimit(`Rate limit reached. Please try again in ${String(DURABLE_SECONDS)}s`)
    );

    const arm = await armAfterOneFailure(new OpenAIAdapter(config), 'codex');

    expect(arm.retryAfterMs).toBe(DURABLE_SECONDS * 1000);
    expect(arm.grade).toBe('exhausted');
  });

  it('parses the sub-second phrasing the second-granularity rule used to miss', async () => {
    mocks.openaiCreate.mockRejectedValue(
      openaiRateLimit('Rate limit reached. Please try again in 632ms')
    );

    const bridge = createModelToCliAdapter(new OpenAIAdapter(config), { name: 'codex' });
    const result = await bridge.execute({ content: 'hi' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.retryAfterMs).toBe(632);
  });

  it('does NOT escalate a sub-window horizon to quota exhaustion', async () => {
    mocks.openaiCreate.mockRejectedValue(
      openaiRateLimit('Rate limit reached', { 'retry-after': '5' })
    );

    const arm = await armAfterOneFailure(new OpenAIAdapter(config), 'codex');

    expect(arm.retryAfterMs).toBe(5_000);
    expect(arm.quotaExhausted).toBe(false);
  });

  it('stays unmeasured — never healthy — with neither header nor prose', async () => {
    mocks.openaiCreate.mockRejectedValue(openaiRateLimit('Rate limit reached for gpt-4o'));

    const arm = await armAfterOneFailure(new OpenAIAdapter(config), 'codex');

    expect(arm.retryAfterMs).toBeUndefined();
    expect(arm.grade).toBe('unmeasured');
  });
});

describe('Gemini arm — no headers on the SDK error, horizon only in RetryInfo (#4606)', () => {
  const config = { modelId: 'gemini-2.5-flash', apiKey: 'test-api-key-12345' };

  it('reaches exhausted from the RetryInfo the SDK stringifies into the message', async () => {
    mocks.geminiGenerate.mockRejectedValue(
      geminiRateLimit({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'You exceeded your current quota',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.RetryInfo',
              retryDelay: `${String(DURABLE_SECONDS)}s`,
            },
          ],
        },
      })
    );

    const arm = await armAfterOneFailure(new GeminiAdapter(config), 'gemini');

    expect(arm.retryAfterMs).toBe(DURABLE_SECONDS * 1000);
    expect(arm.grade).toBe('exhausted');
  });

  it('does NOT escalate the common 33s RetryInfo to quota exhaustion', async () => {
    mocks.geminiGenerate.mockRejectedValue(
      geminiRateLimit({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          details: [{ '@type': 'google.rpc.RetryInfo', retryDelay: '33s' }],
        },
      })
    );

    const arm = await armAfterOneFailure(new GeminiAdapter(config), 'gemini');

    expect(arm.retryAfterMs).toBe(33_000);
    expect(arm.quotaExhausted).toBe(false);
  });

  it('stays unmeasured — never healthy — when the body carries no RetryInfo', async () => {
    mocks.geminiGenerate.mockRejectedValue(
      geminiRateLimit({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } })
    );

    const arm = await armAfterOneFailure(new GeminiAdapter(config), 'gemini');

    expect(arm.retryAfterMs).toBeUndefined();
    expect(arm.grade).toBe('unmeasured');
  });
});

describe('routing defaults are untouched by a reportable horizon (#4606)', () => {
  it('still routes an exhausted arm, because enforceHardLimits stays false', async () => {
    mocks.anthropicCreate.mockRejectedValue(
      anthropicRateLimit({ 'retry-after': String(DURABLE_SECONDS) })
    );
    const bridge = createModelToCliAdapter(
      new ClaudeAdapter({ modelId: 'claude-sonnet-4', apiKey: 'test-api-key-12345' }),
      { name: 'claude' }
    );
    await bridge.execute({ content: 'hi' });
    expect((await bridge.getCapacity()).quotaExhausted).toBe(true);

    const armId: RoutingArmId = 'claude';
    const stage = new CapacityFilterStage(new Map([[armId, bridge]]));
    const routed = await stage.route(createRoutingContext('x', ['claude']));

    expect(routed.ok).toBe(true);
    if (routed.ok) expect(getRemainingCandidates(routed.value.context)).toEqual([armId]);
  });
});
