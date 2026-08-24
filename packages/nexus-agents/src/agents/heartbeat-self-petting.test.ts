/**
 * The watchdog must not pet itself (#4665).
 *
 * `heartbeat()` used to be called from the same `setInterval` that read the
 * session's health, so `timeSince` could never exceed the tick and the 60s/120s
 * thresholds were unreachable. Every behavioural test still passed, because a
 * timer-driven heartbeat looks exactly like a healthy session.
 *
 * That is why this is a source-level guard rather than a behavioural one:
 * restoring the timer pet leaves the whole suite green, so nothing behavioural
 * can pin it. The invariant is about WHO calls `heartbeat()`.
 *
 * @module agents/heartbeat-self-petting.test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';

const SRC = join(process.cwd(), 'src');

/** The one legitimate caller: the stepBus subscriber, which IS progress. */
const PROGRESS_SUBSCRIBER = join('agents', 'heartbeat-monitor.ts');

describe('heartbeat self-petting guard (#4665)', () => {
  const files = globSync('**/*.ts', { cwd: SRC }).filter(
    (f) => !f.endsWith('.test.ts') && !f.endsWith('.spec.ts')
  );

  it('finds source files to check', () => {
    // Guard the guard: an empty file list would make the assertion below vacuous.
    expect(files.length).toBeGreaterThan(100);
  });

  it('only the progress subscriber calls heartbeat()', () => {
    const callers = files.filter((f) => {
      if (f === PROGRESS_SUBSCRIBER) return false;
      return /\.heartbeat\(/.test(readFileSync(join(SRC, f), 'utf8'));
    });

    // A caller outside the subscriber is almost certainly a timer petting the
    // session it is about to judge. If a new legitimate progress source appears,
    // route it through `runInHeartbeatSession` instead of adding an exemption.
    expect(callers).toEqual([]);
  });

  it('the health timers read but never write', () => {
    // The three regions that own a heartbeat session. Each must call
    // markInstrumented (via runInHeartbeatSession) and never heartbeat().
    const monitored = [
      join('mcp', 'tools', 'orchestrate.ts'),
      join('mcp', 'tools', 'execute-expert.ts'),
      join('agents', 'base-agent-execute-flow.ts'),
    ];

    for (const rel of monitored) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      expect(text, `${rel} must scope its work for progress attribution`).toContain(
        'runInHeartbeatSession'
      );
      expect(text, `${rel} must not pet its own watchdog`).not.toMatch(/\.heartbeat\(/);
    }
  });
});
