/**
 * Vitest Configuration for E2E Tests
 *
 * Separate configuration for end-to-end tests with:
 * - Longer timeouts
 * - Process isolation
 * - E2E-specific test patterns
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/testing/e2e/**/*.e2e.test.ts'],
    exclude: ['node_modules', 'dist'],

    // E2E tests need longer timeouts
    testTimeout: 60000, // 60 seconds per test
    hookTimeout: 30000, // 30 seconds for setup/teardown

    // Process isolation for E2E tests
    pool: 'forks',

    // Fail fast after 5 failures
    bail: 5,

    // Verbose output for debugging
    reporters: ['verbose'],

    // Global setup/teardown
    globalSetup: './src/testing/e2e/setup.ts',

    // Environment
    environment: 'node',

    // Coverage (if running with coverage)
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
      reporter: ['text', 'json', 'html'],
    },
  },
});
