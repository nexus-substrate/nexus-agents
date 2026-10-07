import { describe, expect, it } from 'vitest';
import { currentHeadingIndex } from './toc-spy.ts';

describe('currentHeadingIndex', () => {
  it('is -1 for no headings', () => {
    expect(currentHeadingIndex([], 300)).toBe(-1);
  });

  it('is -1 while every heading is still below the line (the page top)', () => {
    expect(currentHeadingIndex([400, 900], 300)).toBe(-1);
  });

  it('picks the last heading that has crossed the line, in document order', () => {
    expect(currentHeadingIndex([-800, -20, 250, 700], 300)).toBe(2);
    expect(currentHeadingIndex([-800, -20, 310, 700], 300)).toBe(1);
  });

  it('counts a heading exactly on the line as crossed', () => {
    expect(currentHeadingIndex([300], 300)).toBe(0);
  });
});
