/** Both consumers must use one canonical object after the data-only extraction. */
import { describe, expect, it } from 'vitest';
import { CLI_SUBPROCESS_TIMEOUTS as legacy } from './timeouts.js';
import { CLI_SUBPROCESS_TIMEOUTS as leaf } from './subprocess-timeouts.js';

describe('canonical subprocess timeout data', () => {
  it('preserves one shared value through the legacy re-export', () => {
    expect(legacy).toBe(leaf);
  });
});
