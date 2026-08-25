/**
 * Vitest Configuration
 *
 * Uses process isolation via forks pool to prevent memory accumulation
 * during large test suite runs. (Issue #579)
 *
 * @module vitest.config
 */

import { tmpdir } from 'node:os';
import { defineConfig } from 'vitest/config';

import { ensureTestDataDir, ensureTestScratchRoot } from './src/testing/test-scratch-root.js';

/**
 * Scratch root for the test run (#4412).
 *
 * `os.tmpdir()` honors `$TMPDIR` on POSIX, so setting it here redirects every
 * test that reaches for a temp file — including the ~100 that call `tmpdir()`
 * directly — without editing them. That matters because the shared `/tmp` is
 * a 32G tmpfs anything on the box can fill, and when it filled, this suite
 * failed to *collect* ~1,100 files while reporting zero assertion failures.
 * A disk fault that presents as a code fault costs hours; a repo-local dir on
 * real disk removes the *contention* — nothing else on the box can fill it.
 *
 * It does not remove the growth. The tmpfs cleared on reboot and this does not,
 * so the same leak accumulates permanently here instead of self-clearing; this
 * root reached 9.7 GB across 1,987 entries before anything measured it. The
 * `globalSetup` reaper below is the other half of that trade (#4413).
 * Gitignored via `.nexus-agents/`.
 */
const TEST_TMP = ensureTestScratchRoot();

/**
 * Runtime data root for the test run (#4722).
 *
 * `NEXUS_DATA_DIR` overrides the per-repo/cross-repo split, so setting it here
 * keeps the suite out of `~/.nexus-agents/` — the real cross-repo governance
 * and learning store. Isolation belongs in the config rather than in each
 * module, for the same reason the CLI spawn guard is a setup file rather than
 * a convention: code reaching a singleton through middleware cannot opt in.
 */
const TEST_DATA_DIR = ensureTestDataDir();

export default defineConfig({
  test: {
    // Reap scratch older than a day before the run — see testing/global-setup.ts.
    globalSetup: ['./src/testing/global-setup.ts'],

    // Fail any test that spawns a real agent-CLI binary (#4639). Blocks only
    // the named CLIs; git/node/npm pass through. See testing/cli-spawn-guard.ts.
    setupFiles: ['./src/testing/cli-spawn-guard.setup.ts'],

    // Keep scratch out of the shared tmpfs — see TEST_TMP above.
    // Tests asserting repo-*detection* need a dir with no `.git` ancestor,
    // which TEST_TMP cannot provide. Hand them the real system temp dir; see
    // src/testing/non-repo-temp-dir.ts.
    env: {
      TMPDIR: TEST_TMP,
      NEXUS_TMPDIR: TEST_TMP,
      NEXUS_DATA_DIR: TEST_DATA_DIR,
      VITEST_SYSTEM_TMPDIR: tmpdir(),
    },

    // Test file patterns
    include: ['src/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'src/testing/e2e/**/*.e2e.test.ts', // E2E tests have separate config
    ],

    // Use forks pool for process isolation (prevents memory leaks)
    // Each test file runs in its own Node.js process
    pool: 'forks',
    // Isolate each test file completely
    isolate: true,
    // Limit concurrent workers to manage memory
    maxWorkers: 4,

    // Timeouts
    testTimeout: 30000, // 30 seconds per test
    hookTimeout: 15000, // 15 seconds for setup/teardown

    // Fail fast after repeated failures
    bail: 10,

    // Reporter
    reporters: ['default'],

    // Environment
    environment: 'node',

    // Globals (describe, it, expect available without import)
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/testing/**', 'src/**/*.d.ts'],
      // #4668: `json-summary` writes `coverage-summary.json`. Without it that
      // file is never produced, yet THREE consumers read it — the SICA
      // test-generation workflow, the system-review workflow, and
      // `cli/system-review.ts`. All three silently saw no coverage: the
      // existsSync guards were permanently false, and the workflow's
      // `jq '.total.lines.pct // 0'` fallback turned absence into 0%.
      // (`json` writes coverage-final.json, which is a different shape.)
      reporter: ['text', 'json', 'json-summary', 'html'],
      // Thresholds
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },

    // Sequence tests deterministically
    sequence: {
      shuffle: false,
    },

    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,
  },
});
