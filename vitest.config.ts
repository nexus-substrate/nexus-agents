/**
 * Root Vitest Configuration for the repo-root scripts tests.
 *
 * The package suite (packages/nexus-agents/vitest.config.ts) only globs the
 * package src tree, so the script tests under scripts/ (the generators and
 * drift gates: generate-tool-reference, curate-pr-review, check-drift, etc.)
 * were never collected by CI and gave zero protection (issue #3952). This
 * root config collects them and is wired into the CI test path.
 *
 * Forks pool plus per-test isolation mirror the package config. The timeout is
 * raised above Vitest's 5s default because several script tests dynamically
 * import the package TypeScript schema sources (transform cost) or spawn
 * `npx tsx` subprocesses against the real repo.
 *
 * @module vitest.config
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    exclude: [
      'node_modules',
      '**/node_modules/**',
      'dist',
      // Stale per-agent git worktrees carry duplicate copies of the script
      // tests with broken module resolution; never collect them.
      '.claude/**',
      '**/.claude/**',
      'packages/**',
    ],

    // Forks pool for process isolation (mirrors the package config); each test
    // file runs in its own Node.js process. Several script tests shell out to
    // npx tsx, so keep concurrency bounded to avoid subprocess contention.
    pool: 'forks',
    isolate: true,
    maxWorkers: 4,

    // Script tests dynamically import TS schema sources or spawn subprocesses;
    // the 5s default is too tight for the cold transform and subprocess paths.
    testTimeout: 60000,
    hookTimeout: 30000,

    reporters: ['default'],
    environment: 'node',
    globals: true,

    sequence: {
      shuffle: false,
    },

    clearMocks: true,
    restoreMocks: true,
  },
});
