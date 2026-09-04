/**
 * `CliName` is declared twice with no gate comparing them (#5142, item 6).
 *
 * `packages/nexus-memory/src/types.ts` hand-writes the union; this package
 * derives `CliNameLiteral` from the `CLI_NAMES` const. nexus-memory cannot
 * import from nexus-agents (the dependency points the other way), so the two
 * cannot share a source. They agree today. Nothing would notice a fifth CLI
 * added on one side — it would compile, and then every `meta.cli` written
 * through nexus-memory would reject the new name at the type boundary.
 *
 * THE GATE IS THE TYPECHECK, NOT THE RUNTIME TEST. Vitest strips types, so a
 * diverged union still passes `pnpm test`; it fails `pnpm typecheck`, which CI
 * runs as its own job. The `it()` below exists so the file is collected and
 * the intent is visible in a test report, not because it can fail on its own.
 *
 * @module config/cli-name-cross-package.test
 */
import { describe, expect, it } from 'vitest';
import type { CliName as MemoryCliName } from 'nexus-memory';

import { CLI_NAMES, type CliNameLiteral } from './model-capabilities-types.js';

/** `true` only when the two unions are mutually assignable, i.e. identical. */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

// A member added to either side turns this into `never`, and assigning `true`
// to `never` is a compile error — so `pnpm typecheck` names the file.
const unionsAgree: MutuallyAssignable<MemoryCliName, CliNameLiteral> = true;

describe('CliName across packages (#5142)', () => {
  it('nexus-memory and nexus-agents declare the same CLI names', () => {
    expect(unionsAgree).toBe(true);
    // The runtime half: the const this package derives from is the full set.
    // Kept so a reader sees the actual names, and so an empty const cannot
    // make the type assertion above trivially true.
    expect([...CLI_NAMES].sort()).toEqual(['claude', 'codex', 'gemini', 'opencode']);
  });
});
