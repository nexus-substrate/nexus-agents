/**
 * Asserts the suite is not writing to the developer's real data dir (#4722).
 *
 * @module testing/data-dir-isolation.test
 */

import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

describe('the test run is isolated from the real data dir (#4722)', () => {
  // Before this, `npx vitest run` wrote to `~/.nexus-agents/` — the real,
  // homedir-scoped, cross-repo store holding capability gaps, memory and
  // learning outcomes. Synthetic tool names and fabricated gaps from test runs
  // landed in the same data the routing and improvement loops read, silently,
  // outside the repo where `git status` never shows it.
  //
  // The isolation lives in `vitest.config.ts` rather than in each module, for
  // the same reason the CLI spawn guard is a setup file and not a convention:
  // code reaching a singleton through middleware cannot opt in. Which means
  // nothing but this test notices if that config line is dropped.

  it('sets NEXUS_DATA_DIR for every worker', () => {
    expect(process.env['NEXUS_DATA_DIR']).toBeDefined();
  });

  it('points it somewhere other than the real store', () => {
    // The assertion that matters. A `NEXUS_DATA_DIR` that happened to resolve
    // to `~/.nexus-agents` would satisfy the check above and isolate nothing.
    const dataDir = resolve(process.env['NEXUS_DATA_DIR'] ?? '');

    expect(dataDir).not.toBe(resolve(homedir(), '.nexus-agents'));
    expect(dataDir.startsWith(resolve(homedir(), '.nexus-agents'))).toBe(false);
  });
});
