/**
 * Stdio server lifetime — do not outlive the client (#5231).
 *
 * A `--mode=server` process exists to answer one client over one pipe. When
 * that pipe closes the process has no possible caller, yet nothing was telling
 * it so: the SDK's `StdioServerTransport` registers only `stdin.on('data')`
 * and `stdin.on('error')` — never `'end'` or `'close'` — and reaches its own
 * `close()` only from the `_ondata` parse-error path. `startStdioServer`
 * registered nothing either.
 *
 * The result, measured on one machine: 140 resident servers holding 28.9 GB,
 * the oldest 3.9 days old, under 23 abandoned parents. Local `tsc` and
 * `eslint` were being OOM-killed and interactive sessions were crashing.
 *
 * This lives in its own module rather than inside `server.ts` so that
 * `server.ts` is a real cross-file consumer of it, and so the behaviour can be
 * driven by a fake stream in tests — verifying it through `startStdioServer`
 * would require a test to observe its own `process.exit`.
 *
 * @module mcp/stdio-lifetime
 */

/** Why the server is shutting down. */
export type StdioShutdownReason = 'stdin-end' | 'stdin-close';

/**
 * Calls `onShutdown` the first time the client goes away, and returns a
 * disposer that unregisters the listeners.
 *
 * Both `'end'` and `'close'` are watched: a pipe torn down abruptly emits
 * `'close'` with no preceding `'end'`, which is exactly the abandoned-parent
 * case. `'data'` and `'error'` are deliberately NOT shutdown signals — a
 * transient read error is not a departed client.
 */
export function wireStdioShutdown(
  stdin: NodeJS.EventEmitter,
  onShutdown: (reason: StdioShutdownReason) => void
): () => void {
  let fired = false;

  const fire = (reason: StdioShutdownReason) => (): void => {
    // At most once. The normal ordering is 'end' then 'close', and shutting
    // down twice would double-close the server and exit the process twice.
    if (fired) return;
    fired = true;
    onShutdown(reason);
  };

  const onEnd = fire('stdin-end');
  const onClose = fire('stdin-close');

  stdin.on('end', onEnd);
  stdin.on('close', onClose);

  return (): void => {
    stdin.off('end', onEnd);
    stdin.off('close', onClose);
  };
}
