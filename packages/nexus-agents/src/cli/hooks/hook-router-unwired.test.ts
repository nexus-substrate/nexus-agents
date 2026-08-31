/**
 * `routeHook` must distinguish an unmapped event from an unwired one (#5120).
 *
 * Both returned a bare `exitSuccess()`:
 *
 *   - **unmapped** (`Notification`, `Setup`) — correct. We do not handle those
 *     events and never claimed to.
 *   - **mapped but no handler registered** — a wiring gap reporting success.
 *
 * `EVENT_TO_HANDLER` maps 7 events; `createAllHandlers` supplies 5. Our own
 * setup registers only those same 5 and an unknown subcommand exits loudly, so
 * there is no path through *our* configuration that hits this. But
 * `nexus-agents hooks` with no subcommand routes stdin by `hook_event_name`
 * through `createAllHandlers`, so a hand-configured `SubagentStop` hook lands
 * exactly here — and gets silence.
 *
 * The exit code stays 0 deliberately. A non-zero exit from a hook can block the
 * user's operation, and a gap in *our* wiring must not do that. The fix is that
 * the silence becomes visible on stderr, not that it becomes fatal.
 */

import { describe, it, expect } from 'vitest';

import { routeHook } from './hook-router.js';
import type { HookInput } from './hook-types.js';

const SUBAGENT_STOP = {
  hook_event_name: 'SubagentStop',
  session_id: 's',
  transcript_path: '/tmp/t',
  cwd: '/tmp',
} as unknown as HookInput;

const NOTIFICATION = {
  hook_event_name: 'Notification',
  session_id: 's',
  transcript_path: '/tmp/t',
  cwd: '/tmp',
} as unknown as HookInput;

describe('routeHook distinguishes unmapped from unwired (#5120)', () => {
  it('reports a mapped-but-unwired event on stderr instead of silently succeeding', async () => {
    const result = await routeHook(SUBAGENT_STOP, {});

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBeDefined();
    expect(result.stderr).toContain('SubagentStop');
  });

  it('stays silent for an event we never mapped', async () => {
    // The control that gives the assertion above its meaning. Without it,
    // emitting a warning for every event would pass the first test while
    // spamming stderr on every Notification hook.
    const result = await routeHook(NOTIFICATION, {});

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBeUndefined();
  });

  it('stays silent when the handler IS registered', async () => {
    // The second control: a wired handler must not warn.
    const result = await routeHook(SUBAGENT_STOP, {
      subagentStop: () => Promise.resolve({ exitCode: 0 }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBeUndefined();
  });
});
