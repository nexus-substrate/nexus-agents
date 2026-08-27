import { describe, it, expect } from 'vitest';

import { parseAgyModels, compareAgyModels } from './check-agy-model-drift.js';
import { AGY_MODEL_SLUGS } from '../packages/nexus-agents/src/config/agy-model-map.js';

const CURRENT = [...AGY_MODEL_SLUGS];

describe('parseAgyModels', () => {
  it('reads tab-separated rows', () => {
    expect(parseAgyModels('a-high\tA (High)\nb-low\tB (Low)\n')).toEqual(['a-high', 'b-low']);
  });

  it('ignores the cold-fetch header without dropping a real row', () => {
    // agy prints `Fetching available models...` only on a cold fetch, so a
    // positional "skip line 1" drops a genuine model on the warm path. The tab
    // is the discriminator.
    const cold = parseAgyModels('Fetching available models...\nx-high\tX (High)\n');
    const warm = parseAgyModels('x-high\tX (High)\n');

    expect(cold).toEqual(['x-high']);
    expect(warm).toEqual(['x-high']);
  });

  it('returns nothing for output with no tabbed rows', () => {
    // Drives the `unmeasured` branch in the runner: a format change must not
    // read as "agy serves no models".
    expect(parseAgyModels('some unexpected banner\n')).toEqual([]);
  });
});

describe('compareAgyModels', () => {
  it('is ok when live matches the map', () => {
    expect(compareAgyModels(CURRENT).ok).toBe(true);
  });

  it('reports a new model family the map lacks', () => {
    // The real drift this exists for: agy shipped gemini-3.7-flash-* while the
    // map was still verified against v1.1.9.
    const verdict = compareAgyModels([...CURRENT, 'gemini-3.9-flash-high']);

    expect(verdict.ok).toBe(false);
    expect(verdict.missingFromMap).toEqual(['gemini-3.9-flash-high']);
  });

  it('reports a slug the map claims but agy dropped', () => {
    const verdict = compareAgyModels(CURRENT.slice(1));

    expect(verdict.ok).toBe(false);
    expect(verdict.staleInMap).toEqual([CURRENT[0]]);
  });

  it('excludes non-Gemini slugs rather than calling them drift', () => {
    // #4346 decided 7/0 that this arm means Gemini-family; Claude and GPT-OSS
    // route through their own arms. Reporting them as drift would fight that.
    const verdict = compareAgyModels([...CURRENT, 'claude-sonnet-4-6', 'gpt-oss-120b-medium']);

    expect(verdict.ok).toBe(true);
    expect(verdict.excluded).toEqual(['claude-sonnet-4-6', 'gpt-oss-120b-medium']);
  });

  it('does not report an empty live list as agreement', () => {
    // Every mapped slug is missing, which must be loud. The runner turns this
    // into `unmeasured` before it gets here; this pins that the comparison
    // itself cannot render absence as a match.
    expect(compareAgyModels([]).ok).toBe(false);
  });
});
