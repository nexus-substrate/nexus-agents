/**
 * Vitest Configuration for OpenCode E2E Tests
 *
 * Runs only opencode adapter E2E tests that require real CLI.
 * Gated behind OPENCODE_E2E=true environment variable.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/cli-adapters/adapters/opencode-adapter.e2e.test.ts'],
    exclude: ['node_modules', 'dist'],

    // E2E tests with real CLI need longer timeouts
    testTimeout: 60000,
    hookTimeout: 30000,

    // Process isolation
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Fail fast
    bail: 3,

    // Verbose output for CI debugging
    reporters: ['verbose'],

    environment: 'node',
  },
});
