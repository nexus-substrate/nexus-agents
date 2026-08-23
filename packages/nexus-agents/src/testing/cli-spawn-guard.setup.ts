/**
 * Installs the CLI-spawn guard for every test file (#4639).
 *
 * Registered as a `setupFiles` entry, so `vi.mock` here applies to the whole
 * module graph of each test file. See `cli-spawn-guard.ts` for why the guard
 * intercepts at the module boundary rather than living in production code.
 *
 * ## Three mechanisms were tried against an isolated probe before this was written
 *
 * 1. **Mutating the `node:child_process` namespace** throws `Cannot redefine
 *    property: execFile`, and already-bound named imports keep pointing at the
 *    real function. It silently does nothing.
 * 2. **A `Proxy` with an `apply` trap** blocks a direct `execFile(...)` call but
 *    NOT `promisify(execFile)(...)`. `promisify` resolves through the
 *    `util.promisify.custom` symbol, which returns Node's internal
 *    implementation and never reaches the trap. This matters more than it
 *    sounds: 13 modules in this tree use `promisify(execFile)`, including
 *    `cli/cli-auth-probe.ts`, which accounted for 17 of the 23 spawns in #4629.
 *    A proxy-only guard would have shipped green and blocked almost nothing.
 *    Adding a `get` trap for the symbol does not work either — it is a
 *    read-only, non-configurable data property, so the trap is forbidden by the
 *    proxy invariants from returning anything else.
 * 3. **A plain wrapper function** with its own `util.promisify.custom` defined
 *    on it. This one works for both call shapes, and is what is below.
 *
 * @module testing/cli-spawn-guard.setup
 */

import { afterEach, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const { promisify } = await import('node:util');
  const {
    GUARDED_CLI_BINARIES,
    binaryNameFrom,
    guardedSpawnError,
    realCliSpawnsAllowed,
    recordSpawnViolation,
  } = await import('./cli-spawn-guard.js');

  const CUSTOM = promisify.custom as unknown as symbol;

  const blocked = (args: readonly unknown[]): string | undefined => {
    const binary = binaryNameFrom(args[0]);
    return GUARDED_CLI_BINARIES.has(binary) && !realCliSpawnsAllowed() ? binary : undefined;
  };

  function guard<T>(fnName: string, fn: T): T {
    const wrapper = function (this: unknown, ...args: unknown[]): unknown {
      const binary = blocked(args);
      if (binary !== undefined) {
        recordSpawnViolation(binary, fnName);
        throw guardedSpawnError(binary, fnName);
      }
      return (fn as (...a: unknown[]) => unknown).apply(this, args);
    };

    // The promisified form is a separate entry point, not a wrapper around the
    // callback one — guard it explicitly or `promisify(execFile)` walks past.
    const custom = (fn as Record<symbol, unknown>)[CUSTOM];
    if (typeof custom === 'function') {
      Object.defineProperty(wrapper, CUSTOM, {
        value: (...args: unknown[]): unknown => {
          const binary = blocked(args);
          if (binary !== undefined) {
            recordSpawnViolation(binary, fnName);
            return Promise.reject(guardedSpawnError(binary, fnName));
          }
          return (custom as (...a: unknown[]) => unknown)(...args);
        },
        configurable: true,
      });
    }

    return wrapper as unknown as T;
  }

  // Only the entry points this tree uses to reach a CLI. Everything else in the
  // module passes through unwrapped.
  return {
    ...actual,
    exec: guard('exec', actual.exec),
    execFile: guard('execFile', actual.execFile),
    execSync: guard('execSync', actual.execSync),
    spawn: guard('spawn', actual.spawn),
  };
});

/**
 * Re-raise blocked attempts where production code cannot swallow them.
 *
 * The throw inside the wrapper stops the spawn, but every CLI probe catches it
 * and reports "unavailable" — so without this hook the test passes silently on
 * a branch it never meant to take. Failing here makes the guard visible.
 */
afterEach(async () => {
  const { takeSpawnViolations } = await import('./cli-spawn-guard.js');
  const violations = takeSpawnViolations();
  if (violations.length === 0) return;
  throw new Error(
    `[cli-spawn-guard] This test attempted ${String(violations.length)} real CLI spawn(s):\n` +
      violations.map((v) => `  - ${v}`).join('\n') +
      `\nThe spawn was blocked, but the code under test caught the error and carried on as if\n` +
      `the CLI were merely unavailable — so the test would otherwise have passed on a branch it\n` +
      `never meant to exercise. Mock the module that reaches the binary (commonly\n` +
      `'cli-adapters/factory.js' or 'cli/cli-auth-probe.js'), replacing it WHOLESALE.`
  );
});
