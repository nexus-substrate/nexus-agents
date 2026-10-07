/**
 * The callout vocabulary (#7285): the five GitHub alert kinds, plus the two
 * status tones the Callout component also uses. One table, read by the
 * Markdown alert plugin (hast-alerts.ts) and by components/Callout.astro, so
 * a callout looks and reads the same whichever way it was authored.
 *
 * Meaning is never carried by colour alone: every callout prints its kind as
 * text, and the icon is decorative (aria-hidden). Colours come from
 * remarque's state tokens in styles/components.css, keyed on data-kind.
 *
 * @module website/src/plugins/callout-kinds
 */

export const CALLOUT_KINDS = [
  'note',
  'tip',
  'important',
  'warning',
  'caution',
  'success',
  'error',
] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/** The kinds a Markdown author can write as `> [!KIND]` or `> **Kind:**`. */
export const ALERT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
  success: 'Success',
  error: 'Error',
};

const SVG_OPEN =
  '<svg class="callout-icon" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';

const ICON_PATHS: Record<CalloutKind, string> = {
  // Circle with an "i".
  note: '<circle cx="8" cy="8" r="6.25"/><path d="M8 7.25v4"/><path d="M8 4.75v.01"/>',
  // Light bulb.
  tip: '<path d="M5.75 11.5h4.5"/><path d="M6.5 14h3"/><path d="M5.6 9.6A4 4 0 1 1 10.4 9.6c-.5.45-.65.9-.65 1.4H6.25c0-.5-.15-.95-.65-1.4Z"/>',
  // Speech bubble with "!".
  important:
    '<path d="M2.25 3.25h11.5v8H8.5l-3 2.5v-2.5H2.25Z"/><path d="M8 5.25v3"/><path d="M8 9.75v.01"/>',
  // Triangle with "!".
  warning: '<path d="M8 1.9 14.6 13.6H1.4Z"/><path d="M8 6.25v3.5"/><path d="M8 11.5v.01"/>',
  // Octagon with "!".
  caution:
    '<path d="M5.4 1.75h5.2l3.65 3.65v5.2l-3.65 3.65H5.4L1.75 10.6V5.4Z"/><path d="M8 4.75v4"/><path d="M8 11v.01"/>',
  // Circle with a tick.
  success: '<circle cx="8" cy="8" r="6.25"/><path d="m5.25 8.25 1.9 1.9 3.6-3.9"/>',
  // Circle with a cross.
  error:
    '<circle cx="8" cy="8" r="6.25"/><path d="m5.75 5.75 4.5 4.5"/><path d="m10.25 5.75-4.5 4.5"/>',
};

/** Static, decorative SVG markup for a kind. Contains no author input. */
export function calloutIconSvg(kind: CalloutKind): string {
  return `${SVG_OPEN}${ICON_PATHS[kind]}</svg>`;
}

export function isAlertKind(value: string): value is AlertKind {
  return (ALERT_KINDS as readonly string[]).includes(value);
}
