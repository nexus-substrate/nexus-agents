/**
 * Tests for the CLI's parseArgs configuration.
 *
 * @module cli-types.test
 */

import { describe, it, expect } from 'vitest';
import { parseArgs } from 'node:util';
import { PARSE_ARGS_CONFIG } from './cli-types.js';

describe('PARSE_ARGS_CONFIG short flags', () => {
  it('assigns each short flag to exactly one option', () => {
    // `parseArgs` takes ONE options object for every command, so a short flag
    // is global even when the two long options belong to different commands.
    // When two entries claim the same letter, one silently wins and the other
    // is never settable — `vote -t supermajority` bound to `task` and ran a
    // simple-majority vote while the help advertised `-t, --threshold`.
    const byShort = new Map<string, string[]>();
    for (const [name, spec] of Object.entries(PARSE_ARGS_CONFIG.options)) {
      const short = (spec as { short?: string }).short;
      if (short === undefined) continue;
      byShort.set(short, [...(byShort.get(short) ?? []), name]);
    }

    const collisions = [...byShort.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([short, names]) => `-${short} → ${names.join(', ')}`);

    expect(collisions).toEqual([]);
  });

  it('finds the collisions it is looking for', () => {
    // Guard the guard: the assertion above passes vacuously if the scan is
    // broken, and an empty `byShort` would look identical to a clean config.
    const shorts = Object.values(PARSE_ARGS_CONFIG.options).filter(
      (spec) => (spec as { short?: string }).short !== undefined
    );

    expect(shorts.length).toBeGreaterThan(5);
  });

  it('binds --threshold, not --task, when the vote command is given a threshold', () => {
    // The end-to-end shape of the bug, at the parser rather than the config.
    const { values } = parseArgs({
      args: ['vote', '--threshold', 'supermajority', '-p', 'x'],
      options: PARSE_ARGS_CONFIG.options,
      allowPositionals: true,
      strict: false,
    });

    expect(values.threshold).toBe('supermajority');
    expect(values.task).toBeUndefined();
  });
});

describe('--option is repeatable (#4941)', () => {
  it('collects every occurrence into an array', () => {
    // A multi-option vote needs at least two alternatives, so a flag that kept
    // only the last one would be useless. `multiple: true` is what makes the
    // repetition work; without it parseArgs keeps a single string.
    const { values } = parseArgs({
      args: ['vote', '-p', 'pick one', '--option', 'A', '--option', 'B', '--option', 'C'],
      options: PARSE_ARGS_CONFIG.options,
      allowPositionals: true,
      strict: false,
    });

    expect(values.option).toEqual(['A', 'B', 'C']);
  });

  it('leaves it undefined for an ordinary yes/no vote', () => {
    // The pair: an empty array would reach the engine as "multi-option with no
    // options", which the schema rejects with min(2).
    const { values } = parseArgs({
      args: ['vote', '-p', 'ship it'],
      options: PARSE_ARGS_CONFIG.options,
      allowPositionals: true,
      strict: false,
    });

    expect(values.option).toBeUndefined();
  });
});
