/** Actual adapter command and refusal seams; remote execution only is mocked. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiCliAdapter } from './gemini-adapter.js';
import { getCliModelName } from '../../config/model-config-helpers.js';
import { isCallerInputCliError } from '../cli-error-helpers.js';
import { ok } from '../../core/index.js';
import type { CommandConfig } from '../subprocess-adapter.js';
import type { CliTask } from '../types.js';

function command(adapter: GeminiCliAdapter, task: CliTask): CommandConfig {
  return (adapter as unknown as { getCommand(task: CliTask): CommandConfig }).getCommand(task);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AGY adapter native-model fidelity (#7423)', () => {
  it('builds the no-override doctor command with supported Flash and matching model info', () => {
    const adapter = new GeminiCliAdapter();
    const cmd = command(adapter, { content: 'Reply OK' });
    expect(cmd.args[cmd.args.indexOf('--model') + 1]).toBe('gemini-3.8-flash-high');
    expect(adapter.getModelInfo().id).toBe(getCliModelName('gemini-3.8-flash'));
  });

  it('reports the selected Flash metadata after a retired Flash alias migration', () => {
    const adapter = new GeminiCliAdapter({ model: 'gemini-3.7-flash' });
    const cmd = command(adapter, { content: 'Reply OK' });
    expect(cmd.args[cmd.args.indexOf('--model') + 1]).toBe('gemini-3.8-flash-high');
    expect(adapter.getModelInfo().id).toBe(getCliModelName('gemini-3.8-flash'));
  });

  it('builds command with gemini-4-argon and matching model info', () => {
    const adapter = new GeminiCliAdapter({ model: 'gemini-4-argon' });
    const cmd = command(adapter, { content: 'Reply OK' });
    expect(cmd.args[cmd.args.indexOf('--model') + 1]).toBe('gemini-4-argon-high');
    expect(adapter.getModelInfo().id).toBe('gemini-4-argon');
  });

  it('builds command with explicit gemini-4-argon-medium pin', () => {
    const adapter = new GeminiCliAdapter();
    const cmd = command(adapter, { content: 'Reply OK', model: 'gemini-4-argon-medium' });
    expect(cmd.args[cmd.args.indexOf('--model') + 1]).toBe('gemini-4-argon-medium');
  });

  it.each([
    'gemini-3-pro',
    'gemini-3.1-pro-high',
    'unsupported-model',
    'constructor',
    '__proto__',
    'toString',
  ])('returns an actionable non-retryable error before any execution for %s', async (model) => {
    const adapter = new GeminiCliAdapter();
    const remote = vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'must not run' }));
    const task: CliTask = { content: 'Reply OK', model };
    const result = await adapter.execute(task);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.retryable).toBe(false);
      expect(isCallerInputCliError(result.error)).toBe(true);
      expect(result.error.message).toMatch(/unsupported.*agy|agy.*unsupported/i);
    }
    expect(remote).not.toHaveBeenCalled();
    expect(task.model).toBe(model);
  });

  it('keeps provider-served model unmeasured when the remote response does not report it', async () => {
    const adapter = new GeminiCliAdapter();
    vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'OK' }));
    const result = await adapter.execute({ content: 'Reply OK', model: 'gemini-3.8-flash-high' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.model).toBeUndefined();
  });
});
