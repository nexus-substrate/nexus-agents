/**
 * Vitest config for the docs site, its own pnpm root since #6986.
 *
 * Without this file vitest walks up to the repo-root vitest.config.ts, which
 * collects only scripts/ and eslint-rules/ tests and finds nothing here.
 *
 * @module website/vitest.config
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
