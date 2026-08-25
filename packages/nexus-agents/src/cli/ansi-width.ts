/**
 * Display-width measurement for terminal strings.
 *
 * Its own module rather than a box-drawing detail: measuring how many columns a
 * string occupies is not specific to boxes, and `box-drawing.ts` is only its
 * first caller. Splitting it also gives the export a real cross-file consumer,
 * which the producer/consumer ratchet is right to demand — a test importing a
 * symbol is not a consumer of it.
 *
 * @module cli/ansi-width
 */

/** ANSI SGR escapes — zero display columns, non-zero `String.length`. */
const ANSI_SGR = /\u001b\[[0-9;]*m/g;

/**
 * Display width of a string, ignoring ANSI colour escapes (#4913).
 *
 * `String.prototype.length` counts escape bytes, which occupy no columns. Every
 * pad computed from it is wrong by however many escapes the caller happened to
 * include — which is why three call sites had grown hand-tuned
 * `BOX_WIDTH + 8` / `+ 11` / `+ 7` constants, each correct only for that line's
 * exact colours and all of them wrong under `NO_COLOR`.
 */
export function visibleWidth(s: string): number {
  return s.replace(ANSI_SGR, '').length;
}
