/** Actual installed SDK normalization, with only the external model response faked. */
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ai from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { SdkAdapter } from './sdk-adapter.js';
import { createLogger } from '../../core/index.js';
import type { CompletionRequest, CompletionResponse } from '../../core/index.js';
import { FAKE_OPENAI_KEY } from '../../testing/test-secrets.js';

vi.mock('ai', { spy: true });
const CONFIGURED = 'gpt-4o';
const REPORT = 'gpt-6.1-sol';
const REPORT_200 = 'gpt-boundary-'.padEnd(200, 'a');
const REPORT_201 = `${REPORT_200}a`;
const CANARY = 'TEST_RESPONSE_BODY_CANARY_7550';

function requestFor(
  format: 'text' | 'json_object' | 'json_schema',
  drop: boolean
): CompletionRequest {
  return {
    messages: [{ role: 'user', content: 'Offline report control' }],
    ...(drop ? { temperature: 0.2 } : {}),
    responseFormat:
      format === 'json_schema'
        ? {
            type: format,
            schema: {
              type: 'object',
              properties: { reply: { type: 'string' } },
              required: ['reply'],
              additionalProperties: false,
            },
          }
        : { type: format },
  };
}

function expectMappedResponse(
  value: CompletionResponse,
  metadata: { modelId?: string } | undefined,
  expected: string | undefined,
  drop: boolean
): void {
  expect(value.reportedModel).toBe(expected);
  expect(value.model).toBe(metadata?.modelId ?? CONFIGURED);
  expect(Object.keys(value).sort()).toEqual(
    [
      'content',
      'model',
      'stopReason',
      'usage',
      ...(expected === undefined ? [] : ['reportedModel']),
      ...(drop ? ['warnings'] : []),
    ].sort()
  );
  expect(inspect(value, { depth: 10 })).not.toContain(CANARY);
}
const cases = [
  {
    name: 'raw report despite defaulted normalized identity',
    response: { body: { model: REPORT, canary: CANARY } },
    expected: REPORT,
  },
  {
    name: 'exactly 200 raw identity characters survive byte-for-byte',
    response: { body: { model: REPORT_200, canary: CANARY } },
    expected: REPORT_200,
  },
  {
    name: '201 raw identity characters are omitted rather than clipped',
    response: { body: { model: REPORT_201, canary: CANARY } },
    expected: undefined,
  },
  { name: 'absent metadata', response: undefined, expected: undefined },
  {
    name: 'different normalized identity without body',
    response: { modelId: 'different-model' },
    expected: undefined,
  },
  {
    name: 'Google generateContent modelVersion only',
    response: { body: { modelVersion: 'gemini-version', canary: CANARY } },
    expected: undefined,
  },
  {
    name: 'nested model only',
    response: { body: { nested: { model: REPORT }, canary: CANARY } },
    expected: undefined,
  },
  { name: 'array body', response: { body: [{ model: REPORT }] }, expected: undefined },
  { name: 'null body', response: { body: null }, expected: undefined },
  {
    name: 'string body',
    response: { body: JSON.stringify({ model: REPORT }) },
    expected: undefined,
  },
  {
    name: 'invalid identity',
    response: { body: { model: 'bad model', canary: CANARY } },
    expected: undefined,
  },
  { name: 'empty identity', response: { body: { model: '' } }, expected: undefined },
  {
    name: 'dropped-parameter warnings retain no raw body',
    response: { body: { model: REPORT, canary: CANARY } },
    expected: REPORT,
    dropTemperature: true,
  },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('pins the ASCII fixtures to either side of the identity length boundary', () => {
  expect(REPORT_200).toHaveLength(200);
  expect(Buffer.byteLength(REPORT_200, 'utf8')).toBe(200);
  expect(REPORT_201).toHaveLength(201);
  expect(REPORT_201.slice(0, 200)).toBe(REPORT_200);
});

describe.each(['text', 'json_object', 'json_schema'] as const)(
  'SDK report evidence for %s',
  (format) => {
    it.each(cases)('$name', async (scenario) => {
      const { response, expected } = scenario;
      const drop = Boolean(scenario.dropTemperature);
      const actual = await vi.importActual<typeof ai>('ai');
      const text = format === 'text' ? 'ok' : '{"reply":"ok"}';
      const model = new MockLanguageModelV4({
        modelId: CONFIGURED,
        doGenerate: () =>
          Promise.resolve({
            content: [{ type: 'text', text }],
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
            warnings: [],
            ...(response === undefined ? {} : { response }),
          }),
      });
      const generate = vi.mocked(ai.generateText);
      generate.mockImplementationOnce((options) => actual.generateText({ ...options, model }));
      const logger = createLogger({ component: 'sdk-report-control' });
      const logs = (['debug', 'info', 'warn', 'error'] as const).map((level) =>
        vi.spyOn(logger, level)
      );
      const adapter = new SdkAdapter(
        { providerId: 'openai', modelId: drop ? 'gpt-5.2' : CONFIGURED, apiKey: FAKE_OPENAI_KEY },
        logger
      );
      const result = await adapter.complete(requestFor(format, drop));
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      expect(generate.mock.calls[0]?.[0]).toMatchObject({ include: { responseBody: true } });
      const include = generate.mock.calls[0]?.[0].include;
      expect(include?.requestBody).toBeUndefined();
      expect(include?.requestMessages).toBeUndefined();
      expectMappedResponse(result.value, response, expected, drop);
      expect(
        inspect(
          logs.map((log) => log.mock.calls),
          { depth: 15 }
        )
      ).not.toContain(CANARY);
      expect(model.doGenerateCalls).toHaveLength(1);
    });
  }
);

it('excludes a retained raw body when actual SDK structured parsing fails', async () => {
  const actual = await vi.importActual<typeof ai>('ai');
  const model = new MockLanguageModelV4({
    modelId: CONFIGURED,
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: 'text', text: 'not-json' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        response: { body: { model: REPORT, canary: CANARY } },
        warnings: [],
      }),
  });
  let upstreamError: unknown;
  vi.mocked(ai.generateText).mockImplementationOnce(async (options) => {
    try {
      return await actual.generateText({ ...options, model });
    } catch (error) {
      upstreamError = error;
      throw error;
    }
  });
  const logger = createLogger({ component: 'sdk-error-report-control' });
  const errorLog = vi.spyOn(logger, 'error');
  const result = await new SdkAdapter(
    { providerId: 'openai', modelId: CONFIGURED, apiKey: FAKE_OPENAI_KEY },
    logger
  ).complete({
    messages: [{ role: 'user', content: 'Offline parse failure' }],
    responseFormat: { type: 'json_object' },
  });
  expect(result.ok).toBe(false);
  expect(inspect(upstreamError, { depth: 15 })).toContain(CANARY);
  if (result.ok) throw new Error('Expected structured parse failure');
  expect(inspect(result.error, { depth: 15 })).not.toContain(CANARY);
  expect(inspect(errorLog.mock.calls, { depth: 15 })).not.toContain(CANARY);
});
