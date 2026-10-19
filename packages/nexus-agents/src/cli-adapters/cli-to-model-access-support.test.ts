/** Actual-mode declarations are evidence, not permission or a completion. */
import { describe, expect, it, vi } from 'vitest';
import { CliToModelAdapter } from './cli-to-model-adapter.js';
import type { ExecutionAccessMode, IModelAdapter } from '../core/types/model.js';
import type { ICliAdapter } from './types.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
type ProposedQuery = IModelAdapter & {
  supportsAccessMode?: (
    mode: ExecutionAccessMode,
    signal?: AbortSignal
  ) => Promise<boolean | undefined>;
};
async function support(
  native: ICliAdapter,
  mode: ExecutionAccessMode
): Promise<boolean | undefined> {
  const bridge: ProposedQuery = new CliToModelAdapter(native);
  return bridge.supportsAccessMode?.(mode);
}
describe('CLI bridge actual access support (#7434)', () => {
  it.each([new ClaudeCliAdapter(), new CodexCliAdapter(), new GeminiCliAdapter()])(
    'reports enforcing native $name without executing it',
    async (native) => {
      const execute = vi.spyOn(native, 'execute');
      expect(await support(native, 'read-only-analysis')).toBe(true);
      expect(execute).not.toHaveBeenCalled();
    }
  );
  it('reports explicitly unsupported native without executing it', async () => {
    const native = new GeminiCliAdapter();
    Object.defineProperty(native, 'enforcesReadOnlyAnalysis', { value: false });
    const execute = vi.spyOn(native, 'execute');
    expect(await support(native, 'read-only-analysis')).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
  it('keeps absent enforcement declarations unknown rather than measured false', async () => {
    const native = new ClaudeCliAdapter();
    Object.defineProperty(native, 'enforcesReadOnlyAnalysis', { value: undefined });
    expect(await support(native, 'read-only-analysis')).toBeUndefined();
  });
  it('re-reads changed declarations and keeps completion enforcement authoritative', async () => {
    const native = new ClaudeCliAdapter();
    Object.defineProperty(native, 'enforcesReadOnlyAnalysis', { value: true, writable: true });
    const bridge: ProposedQuery = new CliToModelAdapter(native);
    expect(await bridge.supportsAccessMode?.('read-only-analysis')).toBe(true);
    Object.defineProperty(native, 'enforcesReadOnlyAnalysis', { value: false });
    expect(await bridge.supportsAccessMode?.('read-only-analysis')).toBe(false);
    const execute = vi.spyOn(native, 'execute');
    const result = await bridge.complete({
      messages: [{ role: 'user', content: 'TEST review' }],
      accessMode: 'read-only-analysis',
    });
    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
