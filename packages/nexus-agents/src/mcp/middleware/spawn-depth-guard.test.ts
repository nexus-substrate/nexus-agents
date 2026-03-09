/**
 * Tests for spawn depth guard (#1500).
 *
 * @module mcp/middleware/spawn-depth-guard.test
 */

import { describe, it, expect } from 'vitest';
import { MAX_SPAWN_DEPTH, getCurrentDepth, withDepthGuard } from './spawn-depth-guard.js';

describe('spawn-depth-guard', () => {
  it('exports MAX_SPAWN_DEPTH as 3', () => {
    expect(MAX_SPAWN_DEPTH).toBe(3);
  });

  it('returns depth 0 outside any guard context', () => {
    expect(getCurrentDepth()).toBe(0);
  });

  it('increments depth inside withDepthGuard', async () => {
    let innerDepth = -1;
    await withDepthGuard('test', () => {
      innerDepth = getCurrentDepth();
      return Promise.resolve();
    });
    expect(innerDepth).toBe(1);
  });

  it('nests depth correctly across multiple levels', async () => {
    const depths: number[] = [];
    await withDepthGuard('level-1', () => {
      depths.push(getCurrentDepth());
      return withDepthGuard('level-2', () => {
        depths.push(getCurrentDepth());
        return withDepthGuard('level-3', () => {
          depths.push(getCurrentDepth());
          return Promise.resolve();
        });
      });
    });
    expect(depths).toEqual([1, 2, 3]);
  });

  it('rejects calls exceeding MAX_SPAWN_DEPTH', async () => {
    await expect(
      withDepthGuard('d1', () =>
        withDepthGuard('d2', () =>
          withDepthGuard('d3', () =>
            withDepthGuard('d4-too-deep', () => Promise.resolve('should not reach'))
          )
        )
      )
    ).rejects.toThrow('Spawn depth limit exceeded');
  });

  it('includes depth and max in error message', async () => {
    await expect(
      withDepthGuard('a', () =>
        withDepthGuard('b', () =>
          withDepthGuard('c', () => withDepthGuard('d', () => Promise.resolve()))
        )
      )
    ).rejects.toThrow(/depth=3, max=3/);
  });

  it('restores depth after guard completes', async () => {
    await withDepthGuard('test', () => {
      expect(getCurrentDepth()).toBe(1);
      return Promise.resolve();
    });
    expect(getCurrentDepth()).toBe(0);
  });

  it('restores depth after guard throws', async () => {
    try {
      await withDepthGuard('test', () => Promise.reject(new Error('intentional')));
    } catch {
      // expected
    }
    expect(getCurrentDepth()).toBe(0);
  });
});
