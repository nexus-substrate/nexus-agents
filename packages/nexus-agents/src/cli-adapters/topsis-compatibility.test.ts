/** Pre-extraction CLI outputs pin one canonical ranking computation (#7423). */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TopsisRouter, type SelectModelOptions } from './topsis-router.js';
import type { TopsisConfig, TopsisResult } from './topsis-types.js';
interface Fixture extends SelectModelOptions {
  name: string;
  criteria: TopsisConfig['criteria'];
  expected?: TopsisResult;
  error?: string;
}
const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/topsis-cli-results.json', import.meta.url), 'utf8')
) as Fixture[];
describe('CLI TOPSIS compatibility before actual-arm extraction', () => {
  it('has a nonempty fixed characterization set', () => {
    expect(fixtures).toHaveLength(7);
  });
  it.each(fixtures)('$name keeps the pre-extraction result', (fixture) => {
    const router = new TopsisRouter({ criteria: fixture.criteria });
    if (fixture.error !== undefined)
      expect(() => router.selectModel(fixture)).toThrow(fixture.error);
    else expect(router.selectModel(fixture)).toEqual(fixture.expected);
  });
});
