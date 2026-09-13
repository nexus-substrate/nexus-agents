/**
 * Direct-run guard for the CLI entry (#6102).
 *
 * `cli.ts` is both the executable entry and a module other files import
 * (`parseCliArgs`, `EXIT_CODES`, the tests). `main()` must run only in the
 * first case, so the entry checks `process.argv[1]` against the shapes a real
 * invocation can take. The decision is a pure function of that string so it can
 * be unit-tested; `cli.ts` supplies `process.argv[1]` and logs when it declines.
 *
 * @module cli-direct-run
 */

/**
 * Suffixes of `process.argv[1]` that mean "the CLI was invoked directly".
 *
 * - `cli.js` — the built entry: `node dist/cli.js`, or the package binary at
 *   `node_modules/nexus-agents/dist/cli.js`.
 * - `nexus-agents` — the installed bin, whether a global symlink
 *   (`/usr/bin/nexus-agents`) or a local `.bin/nexus-agents` shim.
 * - `cli.ts` / `src/cli` — the source entry under a TypeScript runner:
 *   `tsx src/cli.ts …` or `tsx src/cli …` from the package dir. Before #6102
 *   these were declined, so running the source was a silent exit-0 no-op.
 */
const DIRECT_RUN_SUFFIXES: readonly string[] = ['cli.js', 'cli.ts', 'src/cli', 'nexus-agents'];

/**
 * True when `argv1` names the CLI entry itself, so `main()` should run.
 *
 * False when the module was imported by something else — a test runner
 * (`/x/vitest.mjs`), another entry point — or when `argv1` is absent
 * (`node -e`). Declining is the guard's purpose, not an error: the caller
 * must neither print nor exit on a false result.
 *
 * @param argv1 - `process.argv[1]`, passed in so the decision is testable.
 */
export function isDirectRun(argv1: string | undefined): boolean {
  if (argv1 === undefined) return false;
  return DIRECT_RUN_SUFFIXES.some((suffix) => argv1.endsWith(suffix));
}
