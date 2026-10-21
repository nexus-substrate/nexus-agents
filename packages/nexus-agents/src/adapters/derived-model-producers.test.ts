/** Derived operational identities must never become serving-model reports (#7550). */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFile, spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeminiAdapter } from './gemini-adapter.js';
import { resolveModelId } from './gemini-types.js';
import {
  OpenCodeCliAdapter,
  resetOpenCodeModelCache,
} from '../cli-adapters/adapters/opencode-adapter.js';
import { CliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import { getDefaultCliCircuitBreakerRegistry } from '../cli-adapters/cli-circuit-breaker.js';
import { FAKE_GOOGLE_KEY } from '../testing/test-secrets.js';

const provider = vi.hoisted(() => ({ generateContent: vi.fn() }));

// Only the external SDK and OS process boundary are faked; producers and parser are real.
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: provider.generateContent };
  },
}));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: vi.fn(), execFile: vi.fn() };
});

const APPROVE = JSON.stringify({
  decision: 'approve',
  reasoning: 'The fixture contains enough evidence for this bounded test.',
  confidence: 0.9,
});
const USAGE = { inputTokens: 17, outputTokens: 11, totalTokens: 28 };
const REQUESTED_OPEN_CODE_MODEL = 'qwen/qwen3-coder';
const OPEN_CODE_CLI_MODEL = 'openrouter/qwen/qwen3-coder';
const OPEN_CODE_ATTRIBUTION = 'openrouter-qwen-coder';

/** Emit provider-shaped NDJSON after the actual subprocess adapter installs listeners. */
function completedOpenCodeProcess(): ReturnType<typeof spawn> {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  const ndjson = [
    { type: 'message.delta', content: APPROVE },
    {
      type: 'session.complete',
      reason: 'stop',
      usage: { input_tokens: USAGE.inputTokens, output_tokens: USAGE.outputTokens },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n');
  setTimeout(() => {
    child.stdout.emit('data', Buffer.from(ndjson));
    child.emit('close', 0);
  }, 0);
  return child as unknown as ReturnType<typeof spawn>;
}

describe('actual derived-model producers never manufacture reports (#7550)', () => {
  let openCode: OpenCodeCliAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    resetOpenCodeModelCache();
    getDefaultCliCircuitBreakerRegistry().resetAll();
    vi.mocked(execFile).mockImplementation(
      (_command: string, _args: unknown, _options: unknown, callback: unknown) => {
        const done = callback as (error: Error | null, stdout: string, stderr: string) => void;
        done(null, `${OPEN_CODE_CLI_MODEL}\n`, '');
        return undefined as unknown as ReturnType<typeof execFile>;
      }
    );
    vi.mocked(spawn).mockImplementation(() => completedOpenCodeProcess());
    openCode = new OpenCodeCliAdapter({ model: REQUESTED_OPEN_CODE_MODEL });
  });

  afterEach(async () => {
    await openCode.dispose();
    resetOpenCodeModelCache();
    getDefaultCliCircuitBreakerRegistry().resetAll();
  });

  it('OpenCode reportedAs/reportedModelId never populate the actual CLI response report', async () => {
    const cli = await openCode.execute({
      content: 'Review fixture',
      model: REQUESTED_OPEN_CODE_MODEL,
    });
    expect(cli.ok).toBe(true);
    if (!cli.ok) throw new Error(cli.error.message);
    expect(cli.value.model).toBe(OPEN_CODE_ATTRIBUTION);
    expect(cli.value).not.toHaveProperty('reportedModel');
    expect(cli.value.text).toBe(APPROVE);
    expect(cli.value.usage).toEqual(USAGE);
  });

  it('OpenCode reportedAs/reportedModelId stay operational through actual execute and bridge', async () => {
    const bridge = new CliToModelAdapter(openCode);
    // Unspecified access is legitimate; OpenCode cannot enforce voter read-only access.
    const completion = await bridge.complete({
      messages: [{ role: 'user', content: 'Review fixture' }],
      model: REQUESTED_OPEN_CODE_MODEL,
    });
    expect(completion.ok).toBe(true);
    if (!completion.ok) throw completion.error;
    expect(completion.value.model).toBe(OPEN_CODE_ATTRIBUTION);
    expect(completion.value).not.toHaveProperty('reportedModel');
    expect(completion.value.content).toEqual([{ type: 'text', text: APPROVE }]);
    expect(completion.value.usage).toEqual(USAGE);
    expect(spawn).toHaveBeenCalledTimes(1);
    for (const [command, args] of vi.mocked(spawn).mock.calls) {
      expect(command).toBe('opencode');
      expect(args).toEqual(expect.arrayContaining(['--model', OPEN_CODE_CLI_MODEL]));
    }
  });

  it('direct Gemini resolvedModelId fallback stays operational with unchanged provider usage', async () => {
    const configuredAlias = 'gemini-pro';
    const selectedModel = resolveModelId(configuredAlias);
    provider.generateContent.mockResolvedValue({
      text: APPROVE,
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: USAGE.inputTokens,
        candidatesTokenCount: USAGE.outputTokens,
        totalTokenCount: USAGE.totalTokens,
        cachedContentTokenCount: 3,
      },
    });
    const gemini = new GeminiAdapter({ modelId: configuredAlias, apiKey: FAKE_GOOGLE_KEY });
    const completion = await gemini.complete({
      messages: [{ role: 'user', content: 'Review fixture' }],
    });
    expect(completion.ok).toBe(true);
    if (!completion.ok) throw completion.error;
    expect(selectedModel).not.toBe(configuredAlias);
    expect(provider.generateContent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ model: selectedModel })
    );
    expect(completion.value.model).toBe(selectedModel);
    expect(completion.value).not.toHaveProperty('reportedModel');
    expect(completion.value.content).toEqual([{ type: 'text', text: APPROVE }]);
    expect(completion.value.stopReason).toBe('end_turn');
    expect(completion.value.usage).toEqual({ ...USAGE, cachedInputTokens: 3 });
  });
});
