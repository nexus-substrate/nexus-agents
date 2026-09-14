/**
 * `nexus-agents vote --strategy` and `--ratifies-pr` at the argv seam (#6227).
 *
 * Driven through `parseCliArgs`, not a private parser: the flag has to be
 * declared in `PARSE_ARGS_CONFIG`, read in `buildVoteOptions`, and carried on
 * `ParsedCliArgs.options` — three hops that each dropped a vote flag before
 * (#4963, #4965). A table over the pure parser would pass with any of them
 * missing.
 *
 * @module cli/vote-ratifies-pr-flags.test
 */
import { describe, it, expect } from 'vitest';
import { parseCliArgs } from '../cli.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function vote(...flags: string[]): ReturnType<typeof parseCliArgs> {
  return parseCliArgs(['vote', '--proposal', 'p', ...flags]);
}

describe('vote --ratifies-pr <number>@<sha> (#6227)', () => {
  it('a valid binding reaches options.ratifiesPr in the tool schema shape', () => {
    const { options } = vote('--ratifies-pr', `6227@${SHA}`);
    expect(options.ratifiesPr).toEqual({ pr: 6227, headSha: SHA });
  });

  it('absent flag ⇒ no ratifiesPr key at all — the ordinary vote is unchanged', () => {
    const { options } = vote();
    expect('ratifiesPr' in options).toBe(false);
  });

  // Each invalid form is refused with a message that shows the expected form,
  // rather than silently dropped the way `--threshold` drops an unknown value:
  // a governor ratification that ran unbound because of a typo is exactly the
  // `no-record` the ledger gate cannot distinguish from a skipped panel.
  it.each([
    ['missing @', `6227${SHA}`],
    ['short sha', '6227@abc1234'],
    ['uppercase sha', `6227@${SHA.toUpperCase()}`],
    ['PR 0', `0@${SHA}`],
    ['non-integer PR', `6227.5@${SHA}`],
  ])('refuses %s, naming the expected form', (_label, raw) => {
    expect(() => vote('--ratifies-pr', raw)).toThrow(/<number>@<40-hex-lowercase-sha>/);
    expect(() => vote('--ratifies-pr', raw)).toThrow(raw);
  });

  it('refuses an exponent-form PR number — Number("1e3") is an integer, the text is not', () => {
    expect(() => vote('--ratifies-pr', `1e3@${SHA}`)).toThrow(/<number>@<40-hex-lowercase-sha>/);
  });
});

describe('vote --strategy (#6227)', () => {
  it.each([
    'simple_majority',
    'supermajority',
    'unanimous',
    'proof_of_learning',
    'higher_order',
    'opinion_wise',
  ] as const)('accepts %s — the tool enum, not a CLI copy of it', (strategy) => {
    expect(vote('--strategy', strategy).options.strategy).toBe(strategy);
  });

  it('refuses a value outside the enum, listing the members', () => {
    expect(() => vote('--strategy', 'supermajorty')).toThrow(/supermajority/);
    expect(() => vote('--strategy', 'supermajorty')).toThrow('supermajorty');
  });

  it('carries both --strategy and the legacy --threshold; precedence is the engine’s (resolveStrategy)', () => {
    const { options } = vote('--strategy', 'supermajority', '--threshold', 'majority');
    expect(options.strategy).toBe('supermajority');
    expect(options.threshold).toBe('majority');
  });
});
