import { describe, it, expect, vi } from 'vitest';
import { ok, createLogger } from '../../core/index.js';
import { CodexCliAdapter } from './codex-adapter.js';
import { CodexMcpAdapter } from './codex-mcp-adapter.js';
import { createCodexSandboxPreflight } from '../codex-sandbox-preflight.js';

const PANIC = 'filesystem-restricted execution requires bubblewrap to isolate app-server sockets';

describe.each([
  ['subprocess', CodexCliAdapter],
  ['MCP', CodexMcpAdapter],
] as const)('%s sandbox preflight', (_transport, Adapter) => {
  it('fails as an attributed non-retryable error before initialization or model execution', async () => {
    const sandboxProbe = createCodexSandboxPreflight(() => ({ exitCode: 101, stderr: PANIC }));
    const adapter = new Adapter({ sandboxProbe });
    const initialize = vi.spyOn(adapter, 'initialize').mockResolvedValue();
    const execute = vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'unreviewed' }));
    const result = await adapter.execute({ content: 'review', accessMode: 'read-only-analysis' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
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
    const exec = vi.fn(() => ({ exitCode: null, stderr: 'spawn codex ENOENT' }));
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

  it('allows a measured healthy sandbox to execute', async () => {
    const adapter = new Adapter({ sandboxProbe: () => ({ status: 'ok' }) });
    vi.spyOn(adapter, 'initialize').mockResolvedValue();
    vi.spyOn(adapter, 'executeTask').mockResolvedValue(ok({ text: 'reviewed' }));
    expect(
      (await adapter.execute({ content: 'review', accessMode: 'read-only-analysis' })).ok
    ).toBe(true);
  });
});
