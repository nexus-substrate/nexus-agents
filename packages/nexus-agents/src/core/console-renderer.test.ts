/**
 * Tests for ConsoleRenderer (#1930).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startConsoleRenderer } from './console-renderer.js';
import { withStep } from './with-step.js';
import { stepBus } from './step-bus.js';
import type {} from './step-events.js';

describe('ConsoleRenderer', () => {
  let lines: string[];
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    lines = [];
    dispose = undefined;
  });

  afterEach(() => {
    dispose?.();
    // Drain any leftover listeners / events
    stepBus.removeAllListeners('step');
  });

  function capture(tty: boolean, noColor = false): void {
    const r = startConsoleRenderer({
      write: (line) => {
        lines.push(line);
      },
      tty,
      noColor,
    });
    dispose = r.dispose;
  }

  it('renders glyph lines in TTY mode', async () => {
    capture(true);
    await withStep({ name: 'research' }, (ctx) => {
      ctx.setSummary('42 papers');
      return Promise.resolve();
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/⋮ research/);
    expect(lines[1]).toMatch(/✓ research/);
    expect(lines[1]).toMatch(/42 papers/);
  });

  it('renders ASCII in non-TTY mode', async () => {
    capture(false);
    await withStep({ name: 'research' }, () => Promise.resolve());
    expect(lines[0]).toMatch(/\[start\] research/);
    expect(lines[1]).toMatch(/\[ ok  \] research/);
  });

  it('renders FAILED with error category', async () => {
    capture(false);
    await expect(
      withStep({ name: 'x' }, () => {
        throw new Error('timed out after 30s');
      })
    ).rejects.toThrow();
    expect(lines[1]).toMatch(/\[FAIL \]/);
    expect(lines[1]).toMatch(/timeout/);
  });

  it('indents nested steps by depth', async () => {
    capture(false);
    await withStep({ name: 'outer' }, async () => {
      await withStep({ name: 'inner' }, () => Promise.resolve());
    });
    // outer.start, inner.start, inner.ok, outer.ok
    expect(lines).toHaveLength(4);
    expect(lines[0]?.startsWith('[start] outer')).toBe(true);
    expect(lines[1]?.startsWith('  [start] inner')).toBe(true);
    expect(lines[2]?.startsWith('  [ ok  ] inner')).toBe(true);
    expect(lines[3]?.startsWith('[ ok  ] outer')).toBe(true);
  });

  it('honors NO_COLOR flag forcing ASCII', async () => {
    capture(true, true);
    await withStep({ name: 'x' }, () => Promise.resolve());
    expect(lines[0]).toMatch(/\[start\]/);
    expect(lines[0]).not.toMatch(/⋮/);
  });

  it('formats duration in seconds for >1s steps', () => {
    capture(false);
    // Synthesize completed event directly to avoid real delay
    stepBus.emit('step', {
      event: 'step.completed',
      stepId: 'abc',
      name: 'slow',
      durationMs: 2300,
      status: 'ok',
    });
    expect(lines[0]).toMatch(/2\.3s/);
  });
});
