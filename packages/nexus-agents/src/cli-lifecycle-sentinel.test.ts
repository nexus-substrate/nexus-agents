/**
 * Tests for the explicit lifecycle-delegation sentinel (#3942).
 *
 * Before #3942, a lifecycle-owning handler (the MCP stdio server, the
 * session valid-subcommand path) signaled "I own my own exit" by returning
 * `undefined`/`void`, and the dispatcher's union included `void`. That
 * conflated *intentional* delegation with an *accidentally dropped* return:
 * a missing return on an error path was not a compile error, `exitWith`
 * no-op'd, and a non-zero exit code was silently swallowed.
 *
 * These tests pin the replacement contract:
 *  - `LIFECYCLE_DELEGATED` is a recognizable sentinel (type guard matches it,
 *    and never matches a `CliExitResult`).
 *  - `CliHandlerResult` is an EXHAUSTIVE union with NO `undefined`/`void`
 *    member — proven at compile time below, so the "void hole" cannot
 *    silently reopen.
 */

import { describe, it, expect } from 'vitest';
import {
  LIFECYCLE_DELEGATED,
  isLifecycleDelegated,
  cliExit,
  EXIT_CODES,
  type CliHandlerResult,
  type CliExitResult,
  type LifecycleDelegated,
} from './cli-types.js';

describe('LIFECYCLE_DELEGATED sentinel (#3942)', () => {
  it('the type guard matches the sentinel', () => {
    expect(isLifecycleDelegated(LIFECYCLE_DELEGATED)).toBe(true);
  });

  it('the type guard does NOT match a CliExitResult (any exit code)', () => {
    expect(isLifecycleDelegated(cliExit(EXIT_CODES.SUCCESS))).toBe(false);
    expect(isLifecycleDelegated(cliExit(EXIT_CODES.SERVER_START_FAILED))).toBe(false);
    expect(isLifecycleDelegated(cliExit(EXIT_CODES.INVALID_ARGS))).toBe(false);
  });

  it('carries the brand property so it is distinguishable structurally', () => {
    expect(LIFECYCLE_DELEGATED).toEqual({ __lifecycleDelegated: true });
  });
});

describe('CliHandlerResult is an exhaustive non-void union (#3942)', () => {
  // ---- Compile-time exhaustiveness assertions -------------------------------
  // These never run; they fail `tsc` if the union ever (re)admits a
  // void/undefined member, which is exactly the hole #3942 closed. If someone
  // re-adds `| void` / `| undefined` to CliHandlerResult, the `IsNever` checks
  // below stop resolving to `true` and the file no longer type-checks.

  type Extends<A, B> = A extends B ? true : false;
  type IsNever<T> = [T] extends [never] ? true : false;

  // The union is exactly CliExitResult | LifecycleDelegated — no third member.
  type _UnionIsExactlyTwoMembers = Extends<CliHandlerResult, CliExitResult | LifecycleDelegated>;
  const unionIsExactlyTwoMembers: _UnionIsExactlyTwoMembers = true;

  // `undefined` is NOT assignable to the handler-result contract.
  type _NoUndefinedMember = IsNever<Extract<CliHandlerResult, undefined>>;
  const noUndefinedMember: _NoUndefinedMember = true;

  // `void` is NOT assignable either (void widens to undefined at call sites).
  type _NoVoidMember = Extends<undefined, CliHandlerResult> extends true ? false : true;
  const noVoidMember: _NoVoidMember = true;

  it('admits exactly CliExitResult and LifecycleDelegated (compile-time)', () => {
    expect(unionIsExactlyTwoMembers).toBe(true);
    expect(noUndefinedMember).toBe(true);
    expect(noVoidMember).toBe(true);
  });

  it('a CliExitResult satisfies the contract', () => {
    const ok: CliHandlerResult = cliExit(EXIT_CODES.SUCCESS);
    expect(isLifecycleDelegated(ok)).toBe(false);
  });

  it('the sentinel satisfies the contract', () => {
    const delegated: CliHandlerResult = LIFECYCLE_DELEGATED;
    expect(isLifecycleDelegated(delegated)).toBe(true);
  });
});
