/**
 * Type test for the voter-key exhaustiveness constraint (#6092).
 *
 * `defineVoterKeys` in vote-record.ts rejects an incomplete
 * `VOTER_SUMMARY_KEYS` tuple at compile time (#6077), but until this file that
 * was verified only by a one-off mutation. Nothing in CI would notice if a
 * TypeScript release changed inference on intersected conditionals and the
 * constraint quietly resolved to `unknown` for every tuple. These assertions
 * are checked by `pnpm typecheck` (`tsc --noEmit` over `src/**`), so a
 * weakened constraint fails the gate in the direction that matters — the
 * `.toBeNever()` probes — rather than only when someone re-runs the mutation.
 *
 * This is a plain `.test.ts`, not a `.test-d.ts`: the package's vitest config
 * does not enable `typecheck` mode, so a `.test-d.ts` would be checked by
 * nothing. `expectTypeOf` is a runtime no-op; the type argument is the test.
 *
 * `VOTER_SUMMARY_KEYS` is module-private, so the real-universe cases mirror
 * its ten literals rather than importing the tuple's type. The pinned
 * literal in vote-record.test.ts keeps the mirror honest: a key added to the
 * schema without being added here fails `defineVoterKeys` itself first.
 */

import { describe, expectTypeOf, it } from 'vitest';

import type { VoterSummary } from './vote-record.js';
import type { CompleteKeys } from './voter-keys-constraint.js';

type Universe = 'a' | 'b';

/** The record's nested fallback shape, derived the way the projector sees it. */
type VoterSummaryFallback = NonNullable<VoterSummary['fallback']>;

/** Mirror of the private `VOTER_SUMMARY_KEYS` literal in vote-record.ts. */
type VoterSummaryKeysMirror = readonly [
  'role',
  'decision',
  'confidence',
  'reasoning',
  'reasoningTruncated',
  'retried',
  'model',
  'unverifiable',
  'assignedCli',
  'fallback',
];

/** The mirror with `retried` dropped — the #6077 mutation, as a type. */
type MissingRetried = readonly [
  'role',
  'decision',
  'confidence',
  'reasoning',
  'reasoningTruncated',
  'model',
  'unverifiable',
  'assignedCli',
  'fallback',
];

describe('CompleteKeys (#6092)', () => {
  it('is unknown for a tuple that covers the whole universe', () => {
    expectTypeOf<CompleteKeys<Universe, ['a', 'b']>>().toEqualTypeOf<unknown>();
    expectTypeOf<CompleteKeys<Universe, readonly ['b', 'a']>>().toEqualTypeOf<unknown>();
  });

  it('is never for a tuple that omits a universe key', () => {
    expectTypeOf<CompleteKeys<Universe, ['a']>>().toBeNever();
    expectTypeOf<CompleteKeys<Universe, []>>().toBeNever();
  });

  it('accepts the real VOTER_SUMMARY_KEYS shape against keyof VoterSummary', () => {
    expectTypeOf<
      CompleteKeys<keyof VoterSummary, VoterSummaryKeysMirror>
    >().toEqualTypeOf<unknown>();
  });

  it('rejects the real tuple with retried dropped', () => {
    expectTypeOf<CompleteKeys<keyof VoterSummary, MissingRetried>>().toBeNever();
  });

  it('still binds the mirror to the schema: every mirror key is a VoterSummary key', () => {
    // Direction 1 of the vote-record.ts contract. If a schema field were
    // renamed, this line fails before the CompleteKeys probes go stale.
    expectTypeOf<VoterSummaryKeysMirror[number]>().toEqualTypeOf<keyof VoterSummary>();
  });

  it('the nested fallback projection is exhaustive: nothing is left after its three keys (#6179)', () => {
    // Mirror of `projectSeatFallback`'s destructure. `noUnprojectedKeys` in
    // vote-record.ts is the binding check (a schema key the destructure does
    // not name fails `tsc` at the projection); this probe pins that the
    // remainder type is exactly empty, so a TypeScript release that widened
    // rest-object inference would fail here rather than silently pass there.
    expectTypeOf<Omit<VoterSummaryFallback, 'fromCli' | 'fromModel' | 'reason'>>().toEqualTypeOf<
      Record<never, never>
    >();
    expectTypeOf<keyof VoterSummaryFallback>().toEqualTypeOf<'fromCli' | 'fromModel' | 'reason'>();
  });
});
