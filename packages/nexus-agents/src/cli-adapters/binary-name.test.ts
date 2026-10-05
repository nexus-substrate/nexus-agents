/**
 * Tests for the adapter's executable name being distinct from its routing
 * identity (#4346).
 *
 * `BaseCliAdapter` used the `CliName` as the binary name — `getVersion()` ran
 * ``execAsync(`${this.name} --version`)``. That is fine while the two coincide,
 * and silently wrong when they do not: after the gemini arm was repointed to
 * spawn `agy`, task execution went to `agy` while the health check still shelled
 * `gemini --version`. It reported the retired binary's `0.51.0` against agy's
 * `1.0.0` floor, so `isCliAvailable('gemini')` returned false for an adapter
 * that worked perfectly.
 *
 * @module cli-adapters/binary-name.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CliName, CliTransport, CliTask, ModelInfo } from './types.js';
import type { CliResponse, CliError, ResolvedExecutionOptions } from './types.js';
import type { Result } from '../core/index.js';
import { ok } from '../core/index.js';
import { BaseCliAdapter } from './base-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import { getCliAdapterDiagnostics } from './cli-adapter-diagnostics.js';

/** An adapter that does not override `binaryName`. */
class PlainAdapter extends BaseCliAdapter {
  readonly name: CliName = 'codex';
  readonly transport: CliTransport = 'subprocess';

  executeTask(
    _task: CliTask,
    _options: ResolvedExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    return Promise.resolve(ok({ text: 'ok' }));
  }

  getModelInfo(): ModelInfo {
    return {
      id: 'x',
      name: 'X',
      contextWindow: 1,
      maxOutput: 1,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    };
  }

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

describe('adapter binary name (#4346)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([undefined, 'alternate-cli'])(
    'derives Gemini remediation hints from the binary with override %s (#4389)',
    (override) => {
      const adapter = new GeminiCliAdapter();
      if (override !== undefined) {
        vi.spyOn(adapter, 'binaryName', 'get').mockReturnValue(override);
      }

      expect(getCliAdapterDiagnostics(adapter).installationHints).toEqual({
        install: `Install ${adapter.binaryName} and ensure it is on PATH`,
        upgrade: `Update ${adapter.binaryName} to the latest version`,
        auth: `Authenticate ${adapter.binaryName} using its CLI`,
      });
    }
  );

  it('preserves package installation hints for other adapters (#4389)', () => {
    expect(getCliAdapterDiagnostics(new PlainAdapter()).installationHints).toEqual({
      install: 'npm install -g @openai/codex',
      upgrade: 'npm update -g @openai/codex',
      auth: 'codex auth login',
    });
    expect(getCliAdapterDiagnostics(new ClaudeCliAdapter()).installationHints).toEqual({
      install: 'npm install -g @anthropic-ai/claude-code',
      upgrade: 'npm update -g @anthropic-ai/claude-code',
      auth: 'claude auth login',
    });
    expect(getCliAdapterDiagnostics(new OpenCodeCliAdapter()).installationHints).toEqual({
      install: 'npm install -g opencode-ai',
      upgrade: 'npm update -g opencode-ai',
      auth: 'opencode auth login',
    });
  });

  it('defaults to the CliName when the arm and the executable coincide', () => {
    expect(new PlainAdapter().binaryName).toBe('codex');
    expect(new ClaudeCliAdapter().binaryName).toBe('claude');
  });

  it('reports agy for the gemini arm', () => {
    // The arm keeps its routing identity (and its LinUCB history); only the
    // executable moved.
    const adapter = new GeminiCliAdapter();

    expect(adapter.name).toBe('gemini');
    expect(adapter.binaryName).toBe('agy');
  });

  it('spawns the binary name, not the arm name', () => {
    const adapter = new GeminiCliAdapter();
    const cmd = (
      adapter as unknown as { getCommand: (t: unknown) => { command: string } }
    ).getCommand({ content: 'hi' });

    expect(cmd.command).toBe('agy');
    expect(cmd.command).not.toBe('gemini');
  });

  it('derives the spawned command from binaryName, so the two cannot drift', () => {
    // Regression guard: the command was previously a separate literal, which is
    // exactly how the version probe and the execution path came to disagree.
    const adapter = new GeminiCliAdapter();
    const cmd = (
      adapter as unknown as { getCommand: (t: unknown) => { command: string } }
    ).getCommand({ content: 'hi' });

    expect(cmd.command).toBe(adapter.binaryName);
  });
});
