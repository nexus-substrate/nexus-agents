/**
 * Pure helpers for the narrow-screen navigation drawer (#7308).
 *
 * The drawer is a native <dialog> opened with showModal(), which already
 * makes the rest of the page inert and closes on Escape. What the dialog
 * does not do is keep Tab inside it: past its last control Chromium moves
 * focus out to the browser chrome. These helpers decide when to wrap.
 *
 * @module website/lib/menu-drawer
 */

/** Selector for the controls a reader can Tab to inside the drawer. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), summary, input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Where focus must go so Tab stays inside `items`, or undefined when the
 * browser's own move already does (focus is not at an edge).
 *
 * Empty list: undefined — there is nothing to contain focus in, and the
 * caller must not cancel the key press for nothing.
 * Focus outside the list (or none): the edge in the direction of travel.
 */
export function wrapFocusTarget<T>(
  items: readonly T[],
  active: T | null,
  backwards: boolean
): T | undefined {
  const first = items[0];
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return undefined;
  const index = active === null ? -1 : items.indexOf(active);
  if (index === -1) return backwards ? last : first;
  if (backwards && index === 0) return last;
  if (!backwards && index === items.length - 1) return first;
  return undefined;
}
