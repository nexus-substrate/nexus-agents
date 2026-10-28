/** Actual direct-entry/import behavior with missing owned policy (#7678). */
import { afterEach, describe, expect, it } from 'vitest';
import { ScriptEntryFixture } from './fixtures/script-entry-fixture.js';
import { assertValidEntry } from './fixtures/script-entry-assertions.js';

const pathComponents = ['plain', 'with space', 'with#hash', 'with%percent', 'with-雪'];
let fixture: ScriptEntryFixture | undefined;

afterEach(() => fixture?.close());

describe('governor review CLI entry boundary', () => {
  it.each(pathComponents)(
    'rejects missing owned policy when invoked directly under %s',
    (component) => {
      fixture = new ScriptEntryFixture('check-governor-review.ts', component);
      const result = fixture.run('direct');
      assertValidEntry(result, fixture, 'direct');
      expect(result.process.status).toBe(1);
      expect(result.process.stderr).toContain('[governor-review] FAIL (integrity, fail-closed):');
      expect(result.process.stderr).toContain(
        "governor section start directive '# @governor-section-start'"
      );
      expect(result.process.stdout).toBe('');
    }
  );

  it.each(pathComponents)('imports without evaluating the gate under %s', (component) => {
    fixture = new ScriptEntryFixture('check-governor-review.ts', component);
    const result = fixture.run('import');
    assertValidEntry(result, fixture, 'import');
    expect(result.process.status).toBe(0);
    expect(result.process.stderr).toBe('');
    expect(result.process.stdout).toBe('TEST_IMPORT_COMPLETE\n');
  });
});
