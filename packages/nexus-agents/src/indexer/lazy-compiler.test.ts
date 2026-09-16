import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const requireFromHere = createRequire(import.meta.url);

/** Cache keys for the two compiler packages this module must not pre-load. */
function residentCompilers(): string[] {
  return Object.keys(requireFromHere.cache).filter((key) =>
    /[\\/]node_modules[\\/](typescript|ts-morph|@ts-morph)[\\/]/.test(key)
  );
}

describe('indexer/lazy-compiler (#6405)', () => {
  it('loads ts-morph on first call, not on import — and never the standalone typescript', async () => {
    // Order matters: the import must come after the first census, so the
    // test measures the module's own behaviour rather than its neighbours'.
    expect(residentCompilers()).toEqual([]);
    const { getTsMorph, getTypescript } = await import('./lazy-compiler.js');
    expect(residentCompilers()).toEqual([]);

    const tsMorph = getTsMorph();
    // Positive control on the census: the load is visible where the gate
    // (`scripts/check-dist-idle-compilers.ts`) looks for it.
    const resident = residentCompilers();
    expect(resident.some((key) => /[\\/]ts-morph[\\/]/.test(key))).toBe(true);
    expect(resident.some((key) => /[\\/]node_modules[\\/]typescript[\\/]/.test(key))).toBe(false);

    expect(getTsMorph()).toBe(tsMorph);
    expect(getTypescript()).toBe(tsMorph.ts);
    expect(typeof getTypescript().createSourceFile).toBe('function');
  });
});
