import { describe, it, expect, vi } from 'vitest';
import { ok, createLogger } from '../../core/index.js';
import { CodexCliAdapter } from './codex-adapter.js';
import { CodexMcpAdapter } from './codex-mcp-adapter.js';
import { isHostUnavailableCliError } from '../cli-error-helpers.js';
import { createCodexSandboxPreflight } from '../codex-sandbox-preflight.js';
import type { CodexSandboxPreflightResult } from '../codex-sandbox-preflight.js';

const PANIC = 'filesystem-restricted execution requires bubblewrap to isolate app-server sockets';

describe.each([
  ['subprocess', CodexCliAdapter],
  ['MCP', CodexMcpAdapter],
] as const)('%s sandbox preflight', (_transport, Adapter) => {
  it('awaits a pending sandbox verdict before initialization and refuses a broken host', async () => {
    let finishProbe!: (result: CodexSandboxPreflightResult) => void;
    const sandboxProbe = vi.fn(
      () =>
        new Promise<CodexSandboxPreflightResult>((resolve) => {
          finishProbe = resolve;
        })
    );
    const adapter = new Adapter({ sandboxProbe });
    const initialize = vi.spyOn(adapter, 'initialize').mockResolvedValue();
    const execute = vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'unreviewed' }));
    const execution = adapter.execute({ content: 'review', accessMode: 'read-only-analysis' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(initialize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    finishProbe({ status: 'broken', reason: PANIC });
    const result = await execution;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isHostUnavailableCliError(result.error)).toBe(true);
    expect(initialize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('fails as an attributed non-retryable error before initialization or model execution', async () => {
    const sandboxProbe = createCodexSandboxPreflight(() =>
      Promise.resolve({
        exitCode: 101,
        stderr: PANIC,
      })
    );
    const adapter = new Adapter({ sandboxProbe });
    const initialize = vi.spyOn(adapter, 'initialize').mockResolvedValue();
    const execute = vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'unreviewed' }));
    const result = await adapter.execute({ content: 'review', accessMode: 'read-only-analysis' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(isHostUnavailableCliError(result.error)).toBe(true);
      expect(result.error).toMatchObject({
        cli: 'codex',
        code: 'EXECUTION_ERROR',
        retryable: false,
      });
      expect(result.error.message).toContain('Codex read-only sandbox unavailable');
      expect(result.error.message).toContain(PANIC);
    }
    expect(initialize).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('records unknown once and proceeds with the existing read-only execution', async () => {
    const logger = createLogger({ component: 'test' });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const exec = vi.fn(() => Promise.resolve({ exitCode: null, stderr: 'spawn codex ENOENT' }));
    const adapter = new Adapter({ logger, sandboxProbe: createCodexSandboxPreflight(exec) });
    vi.spyOn(adapter, 'initialize').mockResolvedValue();
    const execute = vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'reviewed' }));
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(
        (await adapter.execute({ content: 'review', accessMode: 'read-only-analysis' })).ok
      ).toBe(true);
    }
    expect(execute).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown'),
      expect.objectContaining({
        cli: 'codex',
        reason: expect.stringContaining('spawn codex ENOENT'),
      })
    );
  });

  it('shares concurrent unknown checks and logs their provenance only once', async () => {
    const logger = createLogger({ component: 'test' });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const sandboxProbe = vi.fn(async (): Promise<CodexSandboxPreflightResult> => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return { status: 'unknown', reason: 'spawn codex ENOENT' };
    });
    const adapter = new Adapter({ logger, sandboxProbe });
    vi.spyOn(adapter, 'initialize').mockResolvedValue();
    const execute = vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'reviewed' }));
    const task = { content: 'review', accessMode: 'read-only-analysis' } as const;
    const results = await Promise.all([adapter.execute(task), adapter.execute(task)]);
    expect(results.map((result) => result.ok)).toEqual([true, true]);
    expect(sandboxProbe).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('treats a probe that throws as unknown and still executes (#6846)', async () => {
    const adapter = new Adapter({
      sandboxProbe: () => {
        throw new Error('probe exploded');
      },
    });
    vi.spyOn(adapter, 'initialize').mockResolvedValue();
    vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'reviewed' }));
    const request = { content: 'review', accessMode: 'read-only-analysis' as const };
    // Twice: a cached rejection would make the second call throw too.
    expect((await adapter.execute(request)).ok).toBe(true);
    expect((await adapter.execute(request)).ok).toBe(true);
  });

  it('still accepts a synchronous probe, the 8.115.0 option shape (#6846)', async () => {
    const adapter = new Adapter({
      sandboxProbe: () => ({ status: 'broken', reason: `codex sandbox exit 101: ${PANIC}` }),
    });
    const result = await adapter.execute({ content: 'review', accessMode: 'read-only-analysis' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('Codex read-only sandbox unavailable');
  });

  it('allows a measured healthy sandbox to execute', async () => {
    const adapter = new Adapter({ sandboxProbe: () => Promise.resolve({ status: 'ok' }) });
    vi.spyOn(adapter, 'initialize').mockResolvedValue();
    vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'reviewed' }));
    expect(
      (await adapter.execute({ content: 'review', accessMode: 'read-only-analysis' })).ok
    ).toBe(true);
  });
});
