/**
 * Gateway discovery against a recorded three-family catalogue (#6605, #6600).
 *
 * A corporate OpenAI-spec gateway fronts OpenAI, Anthropic and Google models
 * under whatever ids its operator chose: slashes, dots, underscores, vendor
 * prefixes, duplicate rows, and non-chat models (embedding, TTS, image,
 * moderation, audio, rerank) that error when given a voter seat. The fixture
 * is that listing; these tests pin what discovery makes of it.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildOpenAICompatAdapters,
  createOpenAICompatAdapter,
  discoverModels,
  readOpenAICompatEnv,
  type OpenAICompatConfig,
} from './openai-compat-adapter.js';
import { canonicalModelKey } from '../config/model-equivalence.js';
import { resolveVoterModelOverrides } from '../cli/voter-model-overrides.js';
import type { ILogger } from '../core/index.js';

const { mockList, mockChatCreate } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockChatCreate: vi.fn(),
}));
vi.mock('openai', async () => {
  const actual = await vi.importActual<typeof import('openai')>('openai');
  class MockOpenAI {
    models = { list: mockList };
    chat = { completions: { create: mockChatCreate } };
  }
  return { default: MockOpenAI, APIError: actual.APIError };
});
vi.mock('./sdk/custom-api-validation.js', () => ({
  assertCustomApiHostResolvesPublic: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('../config/opencode-bridge.js', () => ({ readOpencodeGateway: vi.fn(() => null) }));

interface ListedModel {
  readonly id: string;
  readonly [field: string]: unknown;
}

const FIXTURE = JSON.parse(
  readFileSync(new URL('./__fixtures__/three-family-gateway-catalog.json', import.meta.url), 'utf8')
) as { readonly data: readonly ListedModel[] };

/** The chat models of the fixture, deduplicated, in listing order. */
const EXPECTED_CHAT_IDS = [
  'gpt-4o',
  'gpt-5.2',
  'openai/o3',
  'claude_4_5_opus',
  'claude_4_1_opus',
  'claude-sonnet-4.5',
  'anthropic/claude-haiku-4-5',
  'gemini-2.5-pro',
  'gemini-3-pro',
  'vertex_ai/gemini-2.5-flash',
  'gemini-2.5-flash-image',
];

const NON_CHAT_IDS = [
  'text-embedding-3-large',
  'tts-1-hd',
  'whisper-1',
  'dall-e-3',
  'omni-moderation-latest',
  'gpt-4o-mini-tts',
  'gemini-embedding-001',
  'imagen-4.0-generate-001',
  'bge-large-en-v1.5',
  'vertex_ai/rerank-large',
];

/** The fixture padded with synthetic chat-shaped ids to `size` rows. */
function paddedCatalog(size: number): readonly ListedModel[] {
  const pad = Array.from({ length: size - FIXTURE.data.length }, (_v, i) => ({
    id: `pad-vendor/chat-model-${String(i)}`,
    object: 'model',
    owned_by: 'pad-vendor',
  }));
  return [...FIXTURE.data, ...pad];
}

type MockLogger = ILogger & {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
};

function makeLogger(): MockLogger {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
    getLevel: vi.fn(),
    setFormat: vi.fn(),
    setDestination: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

const config: OpenAICompatConfig = { baseUrl: 'https://gateway.example/v1', apiKey: 'sk-test' };

const ENV_KEYS = [
  'NEXUS_OPENAI_COMPAT_URL',
  'NEXUS_OPENAI_COMPAT_KEY',
  'NEXUS_OPENAI_COMPAT_MODELS',
  'NEXUS_OPENCODE_CONFIG',
  'NEXUS_VOTER_MODEL_ARCHITECT',
] as const;
beforeEach(() => {
  mockList.mockReset();
  mockChatCreate.mockReset();
  for (const k of ENV_KEYS) vi.stubEnv(k, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('discovery of a three-family gateway catalogue (#6605)', () => {
  it('keeps exactly the chat models, once each, in listing order', async () => {
    mockList.mockResolvedValue(FIXTURE);
    const result = await discoverModels(config, makeLogger());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((m) => m.id)).toEqual(EXPECTED_CHAT_IDS);
  });

  it('removes a duplicate id even when nothing else is filtered', async () => {
    mockList.mockResolvedValue({ data: [{ id: 'gpt-4o' }, { id: 'gpt-5.2' }, { id: 'gpt-4o' }] });
    const result = await discoverModels(config, makeLogger());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-5.2']);
  });

  it('drops every non-chat model the fixture lists', async () => {
    mockList.mockResolvedValue(FIXTURE);
    const result = await discoverModels(config, makeLogger());
    if (!result.ok) throw new Error('discovery failed');
    const kept = new Set(result.value.map((m) => m.id));
    expect(NON_CHAT_IDS.filter((id) => kept.has(id))).toEqual([]);
  });

  it('drops realtime, audio, transcription, TTS, image, live and video ids listed bare (#6604)', async () => {
    const nonChat = [
      'gpt-realtime',
      'gpt-4o-realtime-preview',
      'gpt-4o-audio-preview',
      'gpt-image-1',
      'gpt-4o-transcribe',
      'gpt-4o-mini-tts',
      'gemini-3-pro-image-preview',
      'gemini-2.0-flash-live-001',
      'sora-2',
      'veo-3.0-generate-001',
      'lyria-002',
    ];
    const chat = ['gpt-5.5', 'o4-mini', 'claude-sonnet-4-6', 'gemini-2.5-flash', 'gemini-3-pro'];
    mockList.mockResolvedValue({
      data: [...nonChat, ...chat].map((id) => ({ id, object: 'model', owned_by: 'x' })),
    });
    const result = await discoverModels(config, makeLogger());
    if (!result.ok) throw new Error('discovery failed');
    expect(result.value.map((m) => m.id)).toEqual(chat);
  });

  it('lets listing metadata overrule the id heuristic in both directions', async () => {
    mockList.mockResolvedValue({
      data: [
        // id reads like an image model, metadata says it outputs text
        { id: 'gemini-2.5-flash-image', architecture: { output_modalities: ['image', 'text'] } },
        // id reads like nothing in particular, metadata says embedding
        { id: 'bge-large-en-v1.5', type: 'embedding' },
        // metadata answers "chat" for an id the heuristic would drop
        { id: 'audio-summarizer', mode: 'chat' },
        { id: 'plain-chat-model' },
      ],
    });
    const result = await discoverModels(config, makeLogger());
    if (!result.ok) throw new Error('discovery failed');
    expect(result.value.map((m) => m.id)).toEqual([
      'gemini-2.5-flash-image',
      'audio-summarizer',
      'plain-chat-model',
    ]);
  });

  it('logs the excluded non-chat models with a count and a sample', async () => {
    mockList.mockResolvedValue(FIXTURE);
    const logger = makeLogger();
    await discoverModels(config, logger);
    const call = logger.info.mock.calls.find((c) => String(c[0]).includes('non-chat'));
    expect(call).toBeDefined();
    const context = call?.[1] as { excluded: number; sample: readonly string[] };
    expect(context.excluded).toBe(NON_CHAT_IDS.length);
    expect(context.sample.length).toBeGreaterThan(0);
    expect(context.sample.length).toBeLessThan(NON_CHAT_IDS.length);
    for (const id of context.sample) expect(NON_CHAT_IDS).toContain(id);
  });

  it('gives each discovered model its own identity key (#6616)', async () => {
    mockList.mockResolvedValue(FIXTURE);
    const result = await discoverModels(config, makeLogger());
    if (!result.ok) throw new Error('discovery failed');
    // #6616: gemini-2.5-flash-image folds its image modality quirk into the key,
    // so it no longer shares vertex_ai/gemini-2.5-flash's key.
    const keys = result.value.map((m) => canonicalModelKey(m.id) ?? `raw:${m.id}`);
    expect(new Set(keys).size).toBe(result.value.length);
  });
});

describe('NEXUS_OPENAI_COMPAT_MODELS allowlist, applied before the cap (#6600)', () => {
  it('reads a trimmed, de-emptied allowlist into the gateway config', () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'https://gateway.example/v1');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', 'sk-test');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_MODELS', ' gpt-4o , vertex_ai/*,, ');
    expect(readOpenAICompatEnv()?.modelAllowlist).toEqual(['gpt-4o', 'vertex_ai/*']);
  });

  it('narrows a 400-model catalogue to the allowlist instead of refusing it', async () => {
    mockList.mockResolvedValue({ data: paddedCatalog(400) });
    const result = await discoverModels(
      { ...config, modelAllowlist: ['gpt-4o', 'claude_4_5_opus', 'vertex_ai/*'] },
      makeLogger()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `vertex_ai/*` also matches vertex_ai/rerank-large, which is not a chat model.
    expect(result.value.map((m) => m.id)).toEqual([
      'gpt-4o',
      'claude_4_5_opus',
      'vertex_ai/gemini-2.5-flash',
    ]);
  });

  it('still refuses a 400-model catalogue with no allowlist, naming the variable', async () => {
    mockList.mockResolvedValue({ data: paddedCatalog(400) });
    const result = await discoverModels(config, makeLogger());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('256');
    expect(result.error.message).toContain('NEXUS_OPENAI_COMPAT_MODELS');
  });

  it('refuses when the allowlist itself matches more than the cap', async () => {
    mockList.mockResolvedValue({ data: paddedCatalog(400) });
    const result = await discoverModels({ ...config, modelAllowlist: ['pad-vendor/*'] });
    expect(result.ok).toBe(false);
  });

  it('warns about an allowlisted id the catalogue does not list, and one it excluded', async () => {
    mockList.mockResolvedValue(FIXTURE);
    const logger = makeLogger();
    const result = await discoverModels(
      { ...config, modelAllowlist: ['gemini-3-pro', 'claude-opus-9', 'whisper-1'] },
      logger
    );
    if (!result.ok) throw new Error('discovery failed');
    expect(result.value.map((m) => m.id)).toEqual(['gemini-3-pro']);
    const warned = JSON.stringify(logger.warn.mock.calls);
    expect(warned).toContain('claude-opus-9');
    expect(warned).toContain('whisper-1');
    expect(warned).not.toContain('gemini-3-pro');
  });

  it('builds one adapter per allowlisted model from the environment', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'https://gateway.example/v1');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', 'sk-test');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_MODELS', 'anthropic/*,gemini-2.5-pro');
    mockList.mockResolvedValue({ data: paddedCatalog(400) });
    const result = await buildOpenAICompatAdapters(makeLogger());
    if (result?.ok !== true) throw new Error('build failed');
    expect(result.value.map((a) => a.modelId)).toEqual([
      'anthropic/claude-haiku-4-5',
      'gemini-2.5-pro',
    ]);
  });
});

describe('listed ids are sent verbatim (#6605 item 5)', () => {
  it('does not rewrite a listed alias to a dated snapshot', () => {
    const adapter = createOpenAICompatAdapter('gpt-4o', config);
    expect(adapter.modelId).not.toBe('gpt-4o-2024-11-20');
    expect(adapter.modelId).toBe('gpt-4o');
  });

  it('puts the listed id, not the alias target, on the wire', async () => {
    mockChatCreate.mockRejectedValueOnce(new Error('stop after capture'));
    const adapter = createOpenAICompatAdapter('gpt-4o-mini', config);
    await adapter.complete({ messages: [{ role: 'user', content: 'hi' }] });
    const sent = mockChatCreate.mock.calls[0]?.[0] as { model: string } | undefined;
    expect(sent?.model).toBe('gpt-4o-mini');
  });

  it('lets NEXUS_VOTER_MODEL_<ROLE> pin a listed alias id', async () => {
    vi.stubEnv('NEXUS_OPENAI_COMPAT_URL', 'https://gateway.example/v1');
    vi.stubEnv('NEXUS_OPENAI_COMPAT_KEY', 'sk-test');
    vi.stubEnv('NEXUS_VOTER_MODEL_ARCHITECT', 'gpt-4o');
    mockList.mockResolvedValue(FIXTURE);
    const built = await buildOpenAICompatAdapters(makeLogger());
    if (built?.ok !== true) throw new Error('build failed');
    const overrides = resolveVoterModelOverrides(['architect'], built.value, makeLogger());
    expect(overrides.get('architect')?.modelId).toBe('gpt-4o');
  });
});
