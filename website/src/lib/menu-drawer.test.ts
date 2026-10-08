import { describe, expect, it } from 'vitest';
import { wrapFocusTarget } from './menu-drawer.ts';

describe('wrapFocusTarget', () => {
  const [a, b, c] = ['a', 'b', 'c'];
  const items = [a, b, c];

  it('wraps Tab from the last item to the first', () => {
    expect(wrapFocusTarget(items, c, false)).toBe(a);
  });

  it('wraps Shift+Tab from the first item to the last', () => {
    expect(wrapFocusTarget(items, a, true)).toBe(c);
  });

  it('leaves Tab inside the list to the browser', () => {
    expect(wrapFocusTarget(items, a, false)).toBeUndefined();
    expect(wrapFocusTarget(items, b, false)).toBeUndefined();
    expect(wrapFocusTarget(items, b, true)).toBeUndefined();
    expect(wrapFocusTarget(items, c, true)).toBeUndefined();
  });

  it('pulls focus that is outside the list back to its edge', () => {
    expect(wrapFocusTarget(items, 'elsewhere', false)).toBe(a);
    expect(wrapFocusTarget(items, 'elsewhere', true)).toBe(c);
    expect(wrapFocusTarget(items, null, false)).toBe(a);
  });

  it('keeps a single item focused in both directions', () => {
    expect(wrapFocusTarget([a], a, false)).toBe(a);
    expect(wrapFocusTarget([a], a, true)).toBe(a);
  });

  it('has nothing to focus when the list is empty', () => {
    expect(wrapFocusTarget<string>([], a, false)).toBeUndefined();
    expect(wrapFocusTarget<string>([], null, true)).toBeUndefined();
  });
});
