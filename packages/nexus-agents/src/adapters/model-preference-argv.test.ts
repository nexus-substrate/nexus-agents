/**
 * Seam test for #6599: a model preference resolved by the real registry,
 * carried through the real model bridge, must reach each CLI's real argv as
 * an id that CLI accepts. `getAdapterForModel` binds the canonical registry id
 * (`claude-opus`), which is NOT a name the claude binary accepts — every CLI
 * adapter's own translation has to take it.
 *
 * Only spawning is replaced: each probe overrides `execute` to record the
 * argv its real `getCommand` builds.
 *
 * @module adapters/model-preference-argv.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok, type Result } from '../core/index.js';
import { createUnifiedRegistry, type UnifiedAdapterRegistry } from './unified-registry.js';
import { CliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import { ClaudeCliAdapter } from '../cli-adapters/adapters/claude-adapter.js';
import { CodexCliAdapter } from '../cli-adapters/adapters/codex-adapter.js';
import { GeminiCliAdapter } from '../cli-adapters/adapters/gemini-adapter.js';
import type { CliTask, CliResponse, CliError } from '../cli-adapters/types.js';
import type { IResilientAdapter } from './resilient-adapter-types.js';

const quietLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
  setLevel: vi.fn(),
};

class ClaudeProbe extends ClaudeCliAdapter {
  argv: string[] = [];
  override execute(task: CliTask): Promise<Result<CliResponse, CliError>> {
    this.argv = this.getCommand(task).args;
    return Promise.resolve(ok({ text: 'ok' }));
  }
}

class CodexProbe extends CodexCliAdapter {
  argv: string[] = [];
  override execute(task: CliTask): Promise<Result<CliResponse, CliError>> {
    this.argv = this.getCommand(task).args;
    return Promise.resolve(ok({ text: 'ok' }));
  }
}

class AgyProbe extends GeminiCliAdapter {
  argv: string[] = [];
  override execute(task: CliTask): Promise<Result<CliResponse, CliError>> {
    this.argv = this.getCommand(task).args;
    return Promise.resolve(ok({ text: 'ok' }));
  }
}

type Probe = ClaudeProbe | CodexProbe | AgyProbe;

/** The value following `flag` in the argv the probe recorded. */
function flagValue(probe: Probe, flag: string): string | undefined {
  const at = probe.argv.indexOf(flag);
  return at === -1 ? undefined : probe.argv[at + 1];
}

describe('model preference → real registry → real CLI argv (#6599)', () => {
  let registry: UnifiedAdapterRegistry;

  beforeEach(() => {
    registry = createUnifiedRegistry({ logger: quietLogger });
  });

  afterEach(() => {
    registry.dispose();
    vi.restoreAllMocks();
  });

  /** Routes the preference and runs one completion through `probe`. */
  async function run(preference: string, probe: Probe): Promise<string | undefined> {
    const bridge = new CliToModelAdapter(probe);
    const slot = {
      complete: (req: Parameters<CliToModelAdapter['complete']>[0]) => bridge.complete(req),
    } as unknown as IResilientAdapter;
    vi.spyOn(registry, 'getAdapterForCli').mockReturnValue(slot);
    const res = await registry
      .getAdapterForModel(preference)
      .complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(res.ok).toBe(true);
    return res.ok ? res.value.model : undefined;
  }

  it.each([
    ['claude-opus', 'opus'],
    ['opus', 'opus'],
    ['claude-opus-4-6', 'opus'],
    ['claude-sonnet', 'sonnet'],
    ['claude-haiku', 'haiku'],
    ['claude-fable-5', 'fable'],
  ])('claude: preference %s runs --model %s', async (preference, accepted) => {
    const probe = new ClaudeProbe();
    await run(preference, probe);
    expect(flagValue(probe, '--model')).toBe(accepted);
  });

  it.each([
    ['codex-5.1-mini', 'gpt-6-luna'],
    ['codex-5.3', 'gpt-5.6-terra'],
  ])('codex: preference %s runs -m %s', async (preference, accepted) => {
    const probe = new CodexProbe();
    await run(preference, probe);
    expect(flagValue(probe, '-m')).toBe(accepted);
  });

  it.each([
    ['gemini-pro', 'gemini-3.1-pro-low'],
    ['gemini-flash', 'gemini-3.6-flash-low'],
  ])('agy: preference %s runs --model %s', async (preference, accepted) => {
    const probe = new AgyProbe();
    await run(preference, probe);
    expect(flagValue(probe, '--model')).toBe(accepted);
  });

  it('reports the forwarded model, not the CLI default, when the CLI names none', async () => {
    // The codex parser sets no CliResponse.model; the bridge used to report
    // its own default as the model that ran, and price it as that.
    const reported = await run('gpt-6-luna', new CodexProbe());
    expect(reported).toBe('codex-5.1-mini');
  });
});
