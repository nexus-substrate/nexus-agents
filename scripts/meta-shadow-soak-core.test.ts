/**
 * Tests for the PURE goal-selection/formatting core of the MetaOrchestrator
 * shadow-training soak (#4310). Fixture-based only — no `gh`, no live model
 * calls, no network. Mirrors mine-pr-review-candidates-core.test.ts's split
 * (fixtures in, deterministic assertions out).
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SOAK_GOAL_COUNT,
  extractFirstParagraph,
  formatGoal,
  selectSoakGoals,
  type BacklogIssue,
} from './meta-shadow-soak-core.js';

function issue(over: Partial<BacklogIssue> & { number: number }): BacklogIssue {
  return {
    title: `Issue ${String(over.number)}`,
    body: 'Some body text.',
    ...over,
  };
}

describe('extractFirstParagraph', () => {
  it('returns the empty string for an empty/whitespace-only body', () => {
    expect(extractFirstParagraph('')).toBe('');
    expect(extractFirstParagraph('   \n\n  ')).toBe('');
  });

  it('takes only the first paragraph, dropping later ones', () => {
    const body = 'First paragraph line one.\n\nSecond paragraph should be dropped.';
    expect(extractFirstParagraph(body)).toBe('First paragraph line one.');
  });

  it('collapses internal newlines/whitespace within the first paragraph', () => {
    const body = 'Line one\nline two   line three.\n\nDropped.';
    expect(extractFirstParagraph(body)).toBe('Line one line two line three.');
  });

  it('normalizes CRLF line endings', () => {
    const body = 'First.\r\n\r\nSecond dropped.';
    expect(extractFirstParagraph(body)).toBe('First.');
  });

  it('truncates an oversized paragraph with an ellipsis', () => {
    const long = 'x'.repeat(600);
    const result = extractFirstParagraph(long);
    expect(result.length).toBe(501); // 500 chars + ellipsis
    expect(result.endsWith('…')).toBe(true);
    expect(result.startsWith('x'.repeat(500))).toBe(true);
  });

  it('does not truncate a paragraph at exactly the cap', () => {
    const exact = 'x'.repeat(500);
    expect(extractFirstParagraph(exact)).toBe(exact);
  });
});

describe('formatGoal', () => {
  it('formats issue number + title + first paragraph', () => {
    const result = formatGoal(
      issue({ number: 42, title: 'Fix the widget', body: 'Widgets break under load.' })
    );
    expect(result).toBe('#42: Fix the widget\n\nWidgets break under load.');
  });

  it('omits the blank-line paragraph section when the body is empty', () => {
    const result = formatGoal(issue({ number: 7, title: 'No body here', body: '' }));
    expect(result).toBe('#7: No body here');
  });

  it('trims whitespace from the title', () => {
    const result = formatGoal(issue({ number: 1, title: '  Padded title  ', body: '' }));
    expect(result).toBe('#1: Padded title');
  });
});

describe('selectSoakGoals', () => {
  it('is deterministic: same input (any order) yields the same output', () => {
    const issues: BacklogIssue[] = [
      issue({ number: 10 }),
      issue({ number: 30 }),
      issue({ number: 20 }),
    ];
    const shuffled: BacklogIssue[] = [issues[1]!, issues[2]!, issues[0]!];

    const a = selectSoakGoals(issues, 10);
    const b = selectSoakGoals(shuffled, 10);

    expect(a.map((g) => g.issueNumber)).toEqual([30, 20, 10]);
    expect(b.map((g) => g.issueNumber)).toEqual([30, 20, 10]);
  });

  it('selects most-recent-first by issue number descending', () => {
    const issues = [issue({ number: 1 }), issue({ number: 100 }), issue({ number: 50 })];
    const result = selectSoakGoals(issues, 3);
    expect(result.map((g) => g.issueNumber)).toEqual([100, 50, 1]);
  });

  it('bounds the selection to the requested limit', () => {
    const issues = Array.from({ length: 20 }, (_, i) => issue({ number: i + 1 }));
    const result = selectSoakGoals(issues, 5);
    expect(result).toHaveLength(5);
    expect(result.map((g) => g.issueNumber)).toEqual([20, 19, 18, 17, 16]);
  });

  it('defaults the limit to DEFAULT_SOAK_GOAL_COUNT', () => {
    const issues = Array.from({ length: 20 }, (_, i) => issue({ number: i + 1 }));
    const result = selectSoakGoals(issues);
    expect(result).toHaveLength(DEFAULT_SOAK_GOAL_COUNT);
  });

  it('dedupes by issue number, keeping the first occurrence', () => {
    const issues = [
      issue({ number: 5, title: 'first copy' }),
      issue({ number: 5, title: 'second copy (should be dropped)' }),
      issue({ number: 6 }),
    ];
    const result = selectSoakGoals(issues, 10);
    expect(result).toHaveLength(2);
    expect(result.find((g) => g.issueNumber === 5)?.title).toBe('first copy');
  });

  it('returns an empty array for a non-positive limit', () => {
    const issues = [issue({ number: 1 }), issue({ number: 2 })];
    expect(selectSoakGoals(issues, 0)).toEqual([]);
    expect(selectSoakGoals(issues, -5)).toEqual([]);
  });

  it('returns an empty array for an empty issue list', () => {
    expect(selectSoakGoals([], 12)).toEqual([]);
  });

  it('each selected goal carries provenance (issueNumber, title) plus the formatted goal string', () => {
    const result = selectSoakGoals(
      [issue({ number: 9, title: 'Provenance check', body: 'Body text.' })],
      1
    );
    expect(result).toEqual([
      {
        issueNumber: 9,
        title: 'Provenance check',
        goal: '#9: Provenance check\n\nBody text.',
      },
    ]);
  });
});
