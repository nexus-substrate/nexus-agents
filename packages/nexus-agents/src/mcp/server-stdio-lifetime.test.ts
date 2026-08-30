/**
 * The stdio server must not outlive its client (#5231).
 *
 * 140 `nexus-agents --mode=server` processes were found resident on one
 * machine holding 28.9 GB, the oldest 3.9 days old, under 23 abandoned
 * `codex mcp-server` parents. They had no client and no way to notice.
 *
 * Neither layer closes the loop. The SDK's `StdioServerTransport` registers
 * only `stdin.on('data')` and `stdin.on('error')` — it never listens for
 * `'end'` or `'close'`, and its own `close()` is reached only from the
 * `_ondata` parse-error path. `startStdioServer` registered nothing either.
 * So when a client closes the pipe, every layer stays silent and the process
 * runs forever.
 *
 * `wireStdioShutdown` is the missing half. It is a separate exported function
 * precisely so it can be tested against a fake stream: asserting the real
 * behaviour would require the test runner to observe its own `process.exit`.
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import { wireStdioShutdown } from './server.js';

/** Minimal stand-in for `process.stdin` — an EventEmitter is all we listen to. */
function fakeStdin(): EventEmitter & { pause?: () => void } {
  return new EventEmitter();
}

describe('wireStdioShutdown (#5231)', () => {
  it('shuts down when the client closes the pipe (stdin end)', () => {
    const stdin = fakeStdin();
    const onShutdown = vi.fn();
    wireStdioShutdown(stdin, onShutdown);

    expect(onShutdown).not.toHaveBeenCalled();
    stdin.emit('end');

    expect(onShutdown).toHaveBeenCalledTimes(1);
    expect(onShutdown).toHaveBeenCalledWith('stdin-end');
  });

  it('shuts down on stdin close, which end does not always precede', () => {
    // A pipe torn down abruptly emits 'close' without a preceding 'end'.
    // Listening only for 'end' would leave exactly the abandoned-parent case
    // this issue is about.
    const stdin = fakeStdin();
    const onShutdown = vi.fn();
    wireStdioShutdown(stdin, onShutdown);

    stdin.emit('close');

    expect(onShutdown).toHaveBeenCalledWith('stdin-close');
  });

  it('shuts down at most once when both end and close fire', () => {
    // The normal ordering is 'end' then 'close'. Shutting down twice would
    // double-close the server and, in production, call process.exit twice.
    const stdin = fakeStdin();
    const onShutdown = vi.fn();
    wireStdioShutdown(stdin, onShutdown);

    stdin.emit('end');
    stdin.emit('close');
    stdin.emit('end');

    expect(onShutdown).toHaveBeenCalledTimes(1);
  });

  it('does not shut down merely because data arrived or a read errored', () => {
    // The control. If any stdin activity triggered shutdown, the server would
    // die on its first request and every test above would still pass.
    //
    // The no-op 'error' listener mirrors production: the SDK transport
    // registers `_stdin.on('error', ...)` itself. Without a listener Node
    // throws on emit, which would fail this test for a reason that has
    // nothing to do with the behaviour under test.
    const stdin = fakeStdin();
    stdin.on('error', () => {});
    const onShutdown = vi.fn();
    wireStdioShutdown(stdin, onShutdown);

    stdin.emit('data', Buffer.from('{"jsonrpc":"2.0"}\n'));
    stdin.emit('error', new Error('transient'));

    expect(onShutdown).not.toHaveBeenCalled();
  });

  it('stops listening once disposed, so a closed server cannot be resurrected', () => {
    const stdin = fakeStdin();
    const onShutdown = vi.fn();
    const dispose = wireStdioShutdown(stdin, onShutdown);

    dispose();
    stdin.emit('end');

    expect(onShutdown).not.toHaveBeenCalled();
    expect(stdin.listenerCount('end')).toBe(0);
    expect(stdin.listenerCount('close')).toBe(0);
  });
});
