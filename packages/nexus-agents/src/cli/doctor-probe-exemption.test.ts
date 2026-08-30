/**
 * The doctor probe exemption is a decision, not drift (#5191).
 *
 * `getGlobalRegistry()` is canonical for adapter acquisition, and its adapters
 * share a circuit-breaker registry (#4330) so one adapter's observed failure
 * informs the others. That is correct for execution and WRONG for a liveness
 * probe: an open breaker would make `doctor` report a CLI unavailable without
 * testing it, so it would be reading its own cached memory rather than measuring
 * the CLI.
 *
 * A panel ratified keeping doctor and doctor-live on raw adapters (option A,
 * 4/6). The architect's condition was that the exemption be pinned by a test, so
 * a later "route everything through the canonical path" cleanup cannot silently
 * turn a probe into a breaker-state readout.
 *
 * These are structural assertions about which acquisition path each file uses.
 * A behavioural test would need a live CLI; what actually needs protecting is
 * the choice, and the choice is visible in the source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function source(file: string): string {
  return readFileSync(join(HERE, file), 'utf8');
}

describe('doctor probe exemption (#5191)', () => {
  describe.each(['doctor.ts', 'doctor-live.ts'])('%s', (file) => {
    it('acquires adapters through createAllAdapters, not the shared registry', () => {
      const src = source(file);
      expect(src).toMatch(/adapters\s*(\?\?|=)[^;]*createAllAdapters\(/);
      // The failure this guards: a cleanup swaps in getGlobalRegistry() and the
      // probe silently starts answering from shared breaker state.
      //
      // Matched as an ASSIGNMENT, not a substring — the exemption comment below
      // names `getGlobalRegistry()` in prose to explain what is being declined,
      // and a bare `not.toContain` flagged that comment as if it were a call.
      expect(src).not.toMatch(/adapters\s*(\?\?|=)[^;]*getGlobalRegistry\(/);
    });

    it('states WHY the raw adapter is deliberate', () => {
      // An undocumented exemption is indistinguishable from drift, which is
      // what the lint rule (#5192) exists to catch. The comment is what makes
      // this a recorded decision.
      const src = source(file);
      expect(src).toMatch(/DELIBERATE raw-adapter probe/);
      expect(src).toContain('#5191');
    });
  });

  it('names the breaker as the specific reason, not just "probe"', () => {
    // Without the mechanism named, a reader cannot tell whether the exemption
    // still applies if the breaker design changes.
    const src = source('doctor.ts');
    expect(src).toMatch(/circuit-breaker|breaker/i);
    expect(src).toMatch(/without testing it|WITHOUT testing/i);
  });
});
