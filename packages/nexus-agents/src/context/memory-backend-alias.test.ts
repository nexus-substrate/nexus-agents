/**
 * `IMemoryBackend` (deprecated) and `IContextMemoryBackend` are one type (#5142).
 *
 * The rename was accepted at the majority bar on the claim that it breaks
 * nothing. This pins the two halves of that claim: the old name is the same
 * structural type in BOTH directions, and it is still exported. Vitest
 * strips types, so the assignability half is enforced by `pnpm typecheck`;
 * the `it()` keeps the intent visible in a report.
 *
 * @module context/memory-backend-alias.test
 */
/* eslint-disable @typescript-eslint/no-deprecated -- this file's whole purpose is to import the deprecated name and prove it is the same type */
import { describe, expect, it } from 'vitest';

import type { IContextMemoryBackend, IMemoryBackend } from './memory-backend-types.js';
import type { IMemoryBackend as PublicAlias } from '../exports/benchmarks.js';

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const sameType: MutuallyAssignable<IMemoryBackend, IContextMemoryBackend> = true;
const stillPublic: MutuallyAssignable<PublicAlias, IContextMemoryBackend> = true;

describe('IMemoryBackend → IContextMemoryBackend (#5142)', () => {
  it('the deprecated name is the same type, and still on the public surface', () => {
    expect(sameType).toBe(true);
    expect(stillPublic).toBe(true);
  });
});
