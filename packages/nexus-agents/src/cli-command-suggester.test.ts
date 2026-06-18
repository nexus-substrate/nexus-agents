import { describe, expect, it } from 'vitest';

import { COMMAND_CATALOG } from './cli-command-catalog.js';
import {
  catalogCommandNames,
  formatUnknownCommandMessage,
  suggestCommand,
} from './cli-command-suggester.js';

const NAMES = ['review', 'vote', 'doctor', 'verify', 'research', 'workflow', 'expert', 'config'];

describe('suggestCommand', () => {
  it('suggests the closest command for a near-miss (deletion)', () => {
    expect(suggestCommand('reviw', NAMES)).toEqual(['review']);
  });

  it('suggests the closest command for a near-miss (insertion)', () => {
    expect(suggestCommand('vot', NAMES)).toEqual(['vote']);
  });

  it('suggests the closest command for a near-miss (substitution)', () => {
    expect(suggestCommand('doctr', NAMES)).toEqual(['doctor']);
  });

  it('returns nothing for an exact match (no point suggesting what was typed)', () => {
    expect(suggestCommand('review', NAMES)).toEqual([]);
  });

  it('returns nothing for a far string', () => {
    expect(suggestCommand('zzzzzzzz', NAMES)).toEqual([]);
  });

  it('returns nothing for empty input', () => {
    expect(suggestCommand('', NAMES)).toEqual([]);
  });

  it('ranks closer matches first', () => {
    // 'verfy' is distance 1 from 'verify', distance 2 from 'vote' is larger.
    const result = suggestCommand('verfy', ['verify', 'vote', 'review']);
    expect(result[0]).toBe('verify');
  });

  it('caps suggestions at 3', () => {
    // All within distance 2 of 'aaa'-ish; ensure no more than 3 returned.
    const many = ['aaa', 'aab', 'aac', 'aad', 'aae', 'aaf'];
    expect(suggestCommand('aax', many).length).toBeLessThanOrEqual(3);
  });

  it('does not suggest for a 1-char typo against a long input when relative threshold is exceeded', () => {
    // distance from 'x' to 'review' is 6 — far beyond both caps.
    expect(suggestCommand('x', NAMES)).toEqual([]);
  });

  it('de-duplicates and ignores case', () => {
    expect(suggestCommand('REVIW', NAMES)).toEqual(['review']);
  });
});

describe('catalogCommandNames', () => {
  it('excludes the (default) placeholder', () => {
    expect(catalogCommandNames()).not.toContain('(default)');
  });

  it('includes real commands from the catalog', () => {
    const names = catalogCommandNames();
    expect(names).toContain('review');
    expect(names).toContain('vote');
    expect(names).toContain('doctor');
  });

  it('matches the catalog minus the placeholder', () => {
    const expected = COMMAND_CATALOG.map((e) => e.command).filter((c) => c !== '(default)');
    expect(catalogCommandNames()).toEqual(expected);
  });
});

describe('against the real catalog (dispatch-path integration)', () => {
  it.each([
    ['reviw', 'review'],
    ['vot', 'vote'],
    ['doctr', 'doctor'],
    ['verifi', 'verify'],
    ['reserch', 'research'],
  ])('suggests %s -> %s using the live catalog names', (typo, expected) => {
    expect(suggestCommand(typo, catalogCommandNames())).toContain(expected);
  });

  it('formats the full unknown-command message off the live catalog', () => {
    const msg = formatUnknownCommandMessage('reviw', catalogCommandNames());
    expect(msg).toBe(
      [
        "Unknown command 'reviw'.",
        'Did you mean: review?',
        'Run "nexus-agents --help" for usage information.',
      ].join('\n')
    );
  });
});

describe('formatUnknownCommandMessage', () => {
  it('includes a did-you-mean line when there is a close match', () => {
    const msg = formatUnknownCommandMessage('reviw', NAMES);
    expect(msg).toContain("Unknown command 'reviw'.");
    expect(msg).toContain('Did you mean: review?');
  });

  it('lists multiple suggestions separated by commas', () => {
    const msg = formatUnknownCommandMessage('aax', ['aaa', 'aab', 'aac']);
    expect(msg).toContain('Did you mean:');
    expect(msg).toMatch(/aa[abc], aa[abc]/);
  });

  it('omits the did-you-mean line when nothing is close', () => {
    const msg = formatUnknownCommandMessage('zzzzzzzz', NAMES);
    expect(msg).toContain("Unknown command 'zzzzzzzz'.");
    expect(msg).not.toContain('Did you mean');
  });
});
