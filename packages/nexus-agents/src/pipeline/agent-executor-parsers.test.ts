/**
 * PM-response parsing (#6331): a numeric id is a common model output and must
 * survive as its string form; a non-string title must fall back rather than
 * stringify as `[object Object]`.
 *
 * QA-verdict parsing (#6776): `pass` needs a positive signal. Empty or
 * off-format text used to fall through to `pass`, so a review that never ran
 * was recorded as one that approved the code.
 */
import { describe, it, expect } from 'vitest';
import { parseQaVerdict, parseTasksFromResponse } from './agent-executor-parsers.js';

describe('parseTasksFromResponse', () => {
  it('keeps a numeric id as its string form and falls back on a non-string title', () => {
    const tasks = parseTasksFromResponse('[{ "id": 1, "title": {} }]', 'fallback plan');

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.id).toBe('1');
    expect(tasks[0]?.title).toBe('Task 1');
    expect(tasks[0]?.description).toBe('');
    expect(JSON.stringify(tasks)).not.toContain('[object Object]');
  });
});

describe('parseQaVerdict (#6776)', () => {
  it('reads a PASS verdict in the format the QA expert prompt asks for (positive control)', () => {
    expect(parseQaVerdict('PASS: meets all criteria, ready to ship')?.verdict).toBe('pass');
  });

  it('reads a labelled, markdown-wrapped verdict', () => {
    expect(parseQaVerdict('## Review\n\n**Verdict:** PASS\n\nAll good.')?.verdict).toBe('pass');
    expect(parseQaVerdict('- NEEDS_WORK: add tests\n- src/a.ts:3 missing')?.verdict).toBe(
      'needs_work'
    );
    expect(parseQaVerdict('REJECT — wrong approach')?.verdict).toBe('reject');
  });

  it('returns undefined for empty text — absence is not a pass', () => {
    expect(parseQaVerdict('')).toBeUndefined();
    expect(parseQaVerdict('   \n ')).toBeUndefined();
  });

  it('returns undefined for an off-format reply with no verdict', () => {
    expect(parseQaVerdict('Looks fine to me, nice work overall.')).toBeUndefined();
    expect(parseQaVerdict('I cannot review this request.')).toBeUndefined();
  });

  it('does not read "reject" or "pass" inside prose as a verdict', () => {
    const reply = 'PASS: there is no reason to reject this; tests pass.';
    expect(parseQaVerdict(reply)?.verdict).toBe('pass');
    expect(parseQaVerdict('There is no reason to reject this change.')).toBeUndefined();
    expect(parseQaVerdict('Passing tests were added.')).toBeUndefined();
    expect(parseQaVerdict('Pass the flag through to the adapter.')).toBeUndefined();
    // "reject" ending a prose sentence is still prose, not a verdict line.
    expect(parseQaVerdict('I found nothing to reject.')).toBeUndefined();
    expect(parseQaVerdict('PASS: tests added.\nI found nothing to reject.')?.verdict).toBe('pass');
  });

  it('takes the strictest verdict when a reply states more than one', () => {
    const echoed = 'PASS: meets all criteria\nNEEDS_WORK: specific issues\nREJECT: fundamental';
    expect(parseQaVerdict(echoed)?.verdict).toBe('reject');
    expect(parseQaVerdict('PASS: mostly\nNEEDS_WORK: one issue')?.verdict).toBe('needs_work');
  });
});
