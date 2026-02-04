/**
 * Vitest Configuration
 *
 * Uses process isolation via forks pool to prevent memory accumulation
 * during large test suite runs. (Issue #579)
 *
 * @module vitest.config
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
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
    poolOptions: {
      forks: {
        // Isolate each test file completely
        isolate: true,
        // Single fork mode helps with memory but slower
        singleFork: false,
        // Limit concurrent forks to manage memory
        maxForks: 4,
        minForks: 1,
      },
    },

    // Timeouts
    testTimeout: 30000, // 30 seconds per test
    hookTimeout: 15000, // 15 seconds for setup/teardown

    // Fail fast after repeated failures
    bail: 10,

    // Reporter ('basic' deprecated in Vitest v3, use 'default')
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
      reporter: ['text', 'json', 'html'],
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
