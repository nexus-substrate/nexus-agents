/**
 * nexus-agents/cli - Suppress the `node:sqlite` ExperimentalWarning (#5388)
 *
 * `node:sqlite` is experimental on Node 22 and emits, on first use:
 *
 * ```
 * (node:1234) ExperimentalWarning: SQLite is an experimental feature and might
 * change at any time
 * ```
 *
 * Memory backends open a database during ordinary CLI startup, so without this
 * every `nexus-agents` invocation prints a warning about an implementation
 * detail the user did not choose and cannot act on.
 *
 * ## Why this shape
 *
 * Three things this deliberately does NOT do:
 *
 * - **Not `--disable-warning=ExperimentalWarning` in the shebang.** That works
 *   (verified), but needs `env -S`, and it would suppress EVERY experimental
 *   warning — including one for a feature we did not knowingly adopt. Silencing
 *   a category to hide one member is how a real warning goes unseen.
 * - **Not `process.removeAllListeners('warning')`.** Same over-reach, plus it
 *   discards listeners an embedder installed.
 * - **Not applied at import of the library.** This module is imported by the
 *   CLI entry point only. A consumer embedding nexus-agents as a library keeps
 *   their own warning behaviour — muting warnings inside someone else's process
 *   is not ours to do.
 *
 * The filter matches on the exact warning name AND its message, so an unrelated
 * `ExperimentalWarning` still reaches the user.
 *
 * @module cli/suppress-sqlite-warning
 */

/** Substring identifying the SQLite experimental warning specifically. */
const SQLITE_WARNING_FRAGMENT = 'SQLite is an experimental feature';

/**
 * Install a one-time filter that drops only the `node:sqlite`
 * ExperimentalWarning. Idempotent: calling it twice does not stack wrappers.
 */
export function suppressSqliteExperimentalWarning(): void {
  const proc = process as NodeJS.Process & { __nexusSqliteWarningFiltered?: boolean };
  if (proc.__nexusSqliteWarningFiltered === true) return;
  proc.__nexusSqliteWarningFiltered = true;

  const original = process.emitWarning.bind(process);

  // Overload-compatible passthrough: Node calls `emitWarning` with several
  // shapes, so forward the arguments untouched rather than reconstructing them.
  function filtered(this: unknown, ...args: unknown[]): void {
    const [warning, second] = args;
    const message = typeof warning === 'string' ? warning : (warning as Error | undefined)?.message;
    const name =
      typeof second === 'string'
        ? second
        : ((second as { type?: string } | undefined)?.type ?? (warning as Error | undefined)?.name);

    // Match on BOTH the name and the message: an unrelated ExperimentalWarning
    // must still reach the user.
    if (name === 'ExperimentalWarning' && message?.includes(SQLITE_WARNING_FRAGMENT) === true) {
      return;
    }
    original(...(args as Parameters<typeof process.emitWarning>));
  }

  process.emitWarning = filtered;
}
