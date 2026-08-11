/**
 * Tests for the catalogue-drift sweep (#4417).
 *
 * Two shipped bugs motivated this: #4410 (an entry pointing at a `:free` SKU
 * that no longer existed anywhere) and #4416 (an entry carrying the *paid*
 * variant's context window while dispatching the free one). Both were found by
 * hand; both are mechanically detectable.
 *
 * The hard part is not detection, it is not crying wolf. #4408 established that
 * inferring EOL from catalogue absence is unsound — `gpt-4o` is retired and
 * still listed. So this sweep answers only questions that are facts:
 * does this exact id exist, and do the numbers match. Everything judgement-like
 * is either an advisory or absent.
 *
 * @module scripts/check-catalogue-drift.test
 */

import { describe, it, expect } from 'vitest';
import {
  findCatalogueDrift,
  type CatalogueEntry,
  type InTreeModel,
} from './check-catalogue-drift.js';

const cat = (over: Partial<CatalogueEntry> & { id: string }): CatalogueEntry => ({
  contextWindow: 100_000,
  pricing: { inputPer1M: 1, outputPer1M: 2 },
  ...over,
});

const model = (over: Partial<InTreeModel> & { id: string }): InTreeModel => ({
  provider: 'openrouter',
  cliModelName: 'vendor/thing',
  contextWindow: 100_000,
  pricing: { inputPer1M: 1, outputPer1M: 2 },
  ...over,
});

describe('findCatalogueDrift — clean cases', () => {
  it('reports nothing when the entry matches the catalogue', () => {
    const findings = findCatalogueDrift(
      [model({ id: 'ok' })],
      [cat({ id: 'openrouter/vendor/thing' })]
    );

    expect(findings).toEqual([]);
  });

  it('ignores entries with no cliModelName (nothing is dispatched)', () => {
    const findings = findCatalogueDrift([model({ id: 'x', cliModelName: undefined })], []);

    expect(findings).toEqual([]);
  });

  it('does not double-prefix a cliModelName that already carries its provider', () => {
    // `opencode-default` dispatches `anthropic/claude-sonnet-4-6` under provider
    // `anthropic`. Naive concatenation looks up `anthropic/anthropic/...` and
    // reports a bogus MISSING — the first version of this sweep did exactly that.
    const findings = findCatalogueDrift(
      [model({ id: 'dbl', provider: 'anthropic', cliModelName: 'anthropic/claude-sonnet-4-6' })],
      [cat({ id: 'anthropic/claude-sonnet-4-6' })]
    );

    expect(findings).toEqual([]);
  });

  it('skips the local custom/ alias namespace', () => {
    // No `custom/`-prefixed id exists in the catalogue at all — it denotes an
    // operator-configured endpoint. Reporting these every run trains readers to
    // ignore the output.
    const findings = findCatalogueDrift(
      [model({ id: 'alias', provider: 'custom-openai', cliModelName: 'custom/claude-opus-4-6' })],
      []
    );

    expect(findings).toEqual([]);
  });
});

describe('findCatalogueDrift — the #4410 shape (dead id)', () => {
  it('flags an id absent from every provider as a defect', () => {
    const findings = findCatalogueDrift(
      [model({ id: 'dead', cliModelName: 'vendor/gone:free' })],
      [cat({ id: 'openrouter/vendor/alive' })]
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('missing-everywhere');
    expect(findings[0]?.severity).toBe('defect');
  });
});

describe('findCatalogueDrift — reseller-only (the gpt-4o trap)', () => {
  it('downgrades to advisory when another provider still serves the id', () => {
    // `gpt-5.2-codex` is gone from first-party openai but served by ten
    // resellers. Absence from one provider is not death — #4408 proved that
    // inference wrong at a 2/3 false-positive rate.
    const findings = findCatalogueDrift(
      [model({ id: 'moved', provider: 'openai', cliModelName: 'gpt-5.2-codex' })],
      [cat({ id: 'vivgrid/gpt-5.2-codex' }), cat({ id: 'azure/gpt-5.2-codex' })]
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('provider-absent');
    expect(findings[0]?.severity).toBe('advisory');
    expect(findings[0]?.detail).toContain('vivgrid');
  });

  it("never silently substitutes another provider's numbers", () => {
    // The first hand-run of this cross-check fell back to an arbitrary
    // provider's record and compared against it, producing a context
    // "mismatch" for a model whose own provider had no record at all.
    const findings = findCatalogueDrift(
      [
        model({
          id: 'moved',
          provider: 'openai',
          cliModelName: 'gpt-5.2-codex',
          contextWindow: 272_000,
        }),
      ],
      [cat({ id: 'vivgrid/gpt-5.2-codex', contextWindow: 400_000 })]
    );

    expect(findings.map((f) => f.kind)).toEqual(['provider-absent']);
  });
});

describe('findCatalogueDrift — the #4416 shape (metadata mismatch)', () => {
  it('flags an overstated context window as a defect', () => {
    const findings = findCatalogueDrift(
      [model({ id: 'over', contextWindow: 1_000_000 })],
      [cat({ id: 'openrouter/vendor/thing', contextWindow: 262_144 })]
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('context-overstated');
    expect(findings[0]?.severity).toBe('defect');
  });

  it('flags an understated context window only as an advisory', () => {
    // Directional asymmetry: overstating fails *after* the context is built;
    // understating merely leaves capacity unused. Ranking them alike is how a
    // useful report becomes noise.
    const findings = findCatalogueDrift(
      [model({ id: 'under', contextWindow: 100_000 })],
      [cat({ id: 'openrouter/vendor/thing', contextWindow: 400_000 })]
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('context-understated');
    expect(findings[0]?.severity).toBe('advisory');
  });

  it('flags a price mismatch as an advisory', () => {
    // Prices drift constantly and contracts differ from list; worth surfacing,
    // not worth calling a defect.
    const findings = findCatalogueDrift(
      [model({ id: 'price', pricing: { inputPer1M: 0, outputPer1M: 0 } })],
      [cat({ id: 'openrouter/vendor/thing', pricing: { inputPer1M: 0.3, outputPer1M: 1 } })]
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe('price-mismatch');
    expect(findings[0]?.severity).toBe('advisory');
  });

  it('flags a zero-cost claim against a priced catalogue entry as a defect', () => {
    // This is #4410's second half and it is not an ordinary price drift:
    // 0/0 is what makes the cost-aware stages *prefer* the entry, so claiming
    // free when the catalogue charges is a routing bug, not a stale number.
    const findings = findCatalogueDrift(
      [model({ id: 'freeclaim', pricing: { inputPer1M: 0, outputPer1M: 0 } })],
      [cat({ id: 'openrouter/vendor/thing', pricing: { inputPer1M: 0.3, outputPer1M: 1 } })],
      { treatFalseFreeAsDefect: true }
    );

    expect(findings[0]?.kind).toBe('false-free');
    expect(findings[0]?.severity).toBe('defect');
  });

  it('tolerates float noise in prices', () => {
    const findings = findCatalogueDrift(
      [model({ id: 'noise', pricing: { inputPer1M: 0.1, outputPer1M: 0.3 } })],
      [
        cat({
          id: 'openrouter/vendor/thing',
          pricing: { inputPer1M: 0.09999999999999999, outputPer1M: 0.3 },
        }),
      ]
    );

    expect(findings).toEqual([]);
  });

  it('does not compare against a catalogue entry with no numbers', () => {
    // Some providers list an id with null cost. Absent data is not a mismatch.
    const findings = findCatalogueDrift(
      [model({ id: 'nullcost' })],
      [{ id: 'openrouter/vendor/thing', contextWindow: undefined, pricing: undefined }]
    );

    expect(findings).toEqual([]);
  });
});

describe('findCatalogueDrift — reporting discipline', () => {
  it('reports every finding for an entry, not just the first', () => {
    const findings = findCatalogueDrift(
      [model({ id: 'both', contextWindow: 999_999, pricing: { inputPer1M: 5, outputPer1M: 9 } })],
      [
        cat({
          id: 'openrouter/vendor/thing',
          contextWindow: 1000,
          pricing: { inputPer1M: 1, outputPer1M: 2 },
        }),
      ]
    );

    expect(findings.map((f) => f.kind).sort()).toEqual(['context-overstated', 'price-mismatch']);
  });

  it('sorts defects before advisories', () => {
    const findings = findCatalogueDrift(
      [
        model({ id: 'adv', cliModelName: 'v/a', contextWindow: 10 }),
        model({ id: 'def', cliModelName: 'v/b', contextWindow: 10_000 }),
      ],
      [
        cat({ id: 'openrouter/v/a', contextWindow: 20 }),
        cat({ id: 'openrouter/v/b', contextWindow: 100 }),
      ]
    );

    expect(findings[0]?.severity).toBe('defect');
  });
});
