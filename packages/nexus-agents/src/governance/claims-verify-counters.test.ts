/**
 * The claim counters must count code, not text (#5580).
 *
 * `countEnumMembers` and `countManifestTools` regex the raw source, so a
 * commented-out enum member or a commented-out `name:` entry counted as live
 * evidence. Five active claims are backed by these counters and
 * `scripts/claims-check.ts` gates the docs workflow on them, so a tool deleted
 * by commenting it out kept its claim green.
 *
 * `stripComments` already exists in this module for exactly this reason
 * (#3879) — the two counters were the callers that never used it.
 */
import { describe, it, expect } from 'vitest';

import { countEnumMembers, countManifestTools } from './claims-verify.js';

describe('countManifestTools ignores commented-out entries (#5580)', () => {
  it('does not count a tool that is commented out', () => {
    expect(countManifestTools("// name: 'dead_tool'")).toBe(0);
  });

  it('does not count a tool inside a block comment', () => {
    expect(countManifestTools("/* removed:\n  name: 'dead_tool',\n */")).toBe(0);
  });

  it('still counts live entries beside a commented-out one', () => {
    const source = ["{ name: 'live_tool' },", "// { name: 'dead_tool' },", "{ name: 'other' },"].join(
      '\n'
    );
    expect(countManifestTools(source)).toBe(2);
  });
});

describe('countEnumMembers ignores commented-out members (#5580)', () => {
  it('does not count a commented-out enum member', () => {
    const source = ["export const Roles = z.enum([", "  'architect',", "  // 'retired_role',", "]);"].join(
      '\n'
    );
    expect(countEnumMembers(source, 'Roles')).toBe(1);
  });

  it('does not count a commented-out union arm', () => {
    const source = "type Mode = 'on' | 'off';\n// type Mode = 'on' | 'off' | 'legacy';";
    expect(countEnumMembers(source, 'Mode')).toBe(2);
  });
});
