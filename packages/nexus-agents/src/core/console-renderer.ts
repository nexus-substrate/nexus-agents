/**
 * nexus-agents/core - Console Renderer for Step Events
 *
 * Subscribes to the step-bus and writes one line per event to **stderr**.
 * Stdout stays clean for JSON / MCP frames / tool output pipes.
 *
 * Output shape (TTY, with color/glyphs):
 *   ⋮ research               … 0.0s
 *   ✓ research               2.3s   42 papers, 3 clusters
 *     ⋮ vote:security (i=1)  … 0.0s
 *     ✗ vote:security (i=1)  4.7s   FAILED timeout on codex
 *
 * Non-TTY / NO_COLOR / CI: ASCII-only glyphs `[start] / [ok] / [FAIL]`.
 *
 * @module core/console-renderer
 * (Source: #1930 — human console notifications; ux-expert design.)
 */

import { stepBus } from './step-bus.js';
import type { StepEvent } from './step-events.js';

interface RendererOptions {
  /** Writer used for output. Default: process.stderr.write bound. */
  readonly write?: (line: string) => void;
  /** TTY mode forces glyphs+color; CI mode forces ASCII. Auto-detected if omitted. */
  readonly tty?: boolean;
  /** Honor NO_COLOR. Default reads `process.env.NO_COLOR`. */
  readonly noColor?: boolean;
}

interface ActiveRenderer {
  dispose(): void;
}

const DEPTH_INDENT = '  '; // two spaces per parent level

/** Map stepId → parentStepId so we can compute depth for indent. */
const parents = new Map<string, string | undefined>();

function depthFor(stepId: string, parentId: string | undefined): number {
  if (parentId === undefined) return 0;
  let depth = 0;
  let cur: string | undefined = parentId;
  const seen = new Set<string>();
  while (cur !== undefined && !seen.has(cur)) {
    seen.add(cur);
    depth += 1;
    cur = parents.get(cur);
  }
  return depth;
}

function fmtDuration(ms: number): string {
  if (ms < 1_000) return `${String(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const min = Math.floor(s / 60);
  const secs = Math.round(s - min * 60);
  return `${String(min)}m${String(secs).padStart(2, '0')}s`;
}

function padRight(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}

interface Formatter {
  start(depth: number, name: string): string;
  ok(depth: number, name: string, durationMs: number, summary: string | undefined): string;
  fail(
    depth: number,
    name: string,
    durationMs: number,
    category: string,
    summary: string | undefined
  ): string;
}

const glyphFmt: Formatter = {
  start(depth, name) {
    return `${DEPTH_INDENT.repeat(depth)}⋮ ${padRight(name, 28)}…\n`;
  },
  ok(depth, name, durationMs, summary) {
    const base = `${DEPTH_INDENT.repeat(depth)}✓ ${padRight(name, 28)}${fmtDuration(durationMs).padStart(6)}`;
    return summary !== undefined && summary !== '' ? `${base}  ${summary}\n` : `${base}\n`;
  },
  fail(depth, name, durationMs, category, summary) {
    const base = `${DEPTH_INDENT.repeat(depth)}✗ ${padRight(name, 28)}${fmtDuration(durationMs).padStart(6)}  FAILED ${category}`;
    return summary !== undefined && summary !== '' ? `${base}: ${summary}\n` : `${base}\n`;
  },
};

const asciiFmt: Formatter = {
  start(depth, name) {
    return `${DEPTH_INDENT.repeat(depth)}[start] ${name}\n`;
  },
  ok(depth, name, durationMs, summary) {
    const base = `${DEPTH_INDENT.repeat(depth)}[ ok  ] ${padRight(name, 28)} ${fmtDuration(durationMs)}`;
    return summary !== undefined && summary !== '' ? `${base}  ${summary}\n` : `${base}\n`;
  },
  fail(depth, name, durationMs, category, summary) {
    const base = `${DEPTH_INDENT.repeat(depth)}[FAIL ] ${padRight(name, 28)} ${fmtDuration(durationMs)} [${category}]`;
    return summary !== undefined && summary !== '' ? `${base}: ${summary}\n` : `${base}\n`;
  },
};

/**
 * Start the stderr console renderer. Returns a disposer.
 * Safe to call multiple times — later calls replace earlier subscription.
 */
export function startConsoleRenderer(opts: RendererOptions = {}): ActiveRenderer {
  const write =
    opts.write ??
    ((line: string): void => {
      process.stderr.write(line);
    });
  const isTty = opts.tty ?? process.stderr.isTTY;
  const noColor = opts.noColor ?? process.env['NO_COLOR'] !== undefined;
  const fmt: Formatter = isTty && !noColor ? glyphFmt : asciiFmt;

  const handler = (event: StepEvent): void => {
    const depth = depthFor(event.stepId, event.parentStepId);
    switch (event.event) {
      case 'step.started':
        parents.set(event.stepId, event.parentStepId);
        write(fmt.start(depth, event.name));
        return;
      case 'step.completed':
        write(fmt.ok(depth, event.name, event.durationMs, event.summary));
        parents.delete(event.stepId);
        return;
      case 'step.failed':
        write(fmt.fail(depth, event.name, event.durationMs, event.errorCategory, event.summary));
        parents.delete(event.stepId);
        return;
    }
  };

  stepBus.on('step', handler);
  return {
    dispose(): void {
      stepBus.off('step', handler);
    },
  };
}
