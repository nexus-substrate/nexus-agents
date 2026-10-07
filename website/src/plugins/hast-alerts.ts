/**
 * hast-alerts.ts — turn alert blockquotes into labelled callouts (#7285,
 * design-review finding 8).
 *
 * The docs write admonitions two ways, and both rendered as italic quotations:
 *
 *   > [!NOTE]                      GitHub alert syntax (marker on its own line)
 *   > body
 *
 *   > **Note:** body               the repo's older bold-label convention
 *   > **Warning — lead.** body     (a bold lead sentence is kept, minus the label)
 *
 * Each becomes `<aside class="callout" data-kind="…" role="note">` with the
 * kind printed as a visible title and a decorative icon. `role="note"` keeps
 * the callouts out of the landmark list: a page with nine notes would
 * otherwise carry nine identically named complementary landmarks.
 *
 * Only the start of the FIRST paragraph is inspected, and only the five alert
 * kinds match, so a quotation that merely contains bold text is left alone.
 *
 * @module website/src/plugins/hast-alerts
 */

import { defineHastPlugin, type HastPluginDefinition } from 'satteri';
import { CALLOUT_LABELS, calloutIconSvg, isAlertKind, type AlertKind } from './callout-kinds.ts';
import {
  el,
  isBlankText,
  isElement,
  raw,
  text,
  textOf,
  type HastChild,
  type HastElement,
} from './hast-tree.ts';

const GITHUB_MARKER = /^\[!([a-z]+)\][ \t]*(?:\r?\n|$)/i;
/** `Note:` / `Warning — rest` inside the bold label. */
const BOLD_LABEL = /^\s*([a-z]+)\s*(?::|—|–)\s*/i;

interface Alert {
  kind: AlertKind;
  /** The blockquote's children with the marker or label removed. */
  body: HastChild[];
}

function isText(node: unknown): node is { type: 'text'; value: string } {
  if (typeof node !== 'object' || node === null) return false;
  return (node as { type?: unknown }).type === 'text';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type Stripped = { kind: AlertKind; rest: HastChild[] } | undefined;

/** `nodes` with `pattern` removed from the start of a leading text node. */
function trimLeadingText(nodes: readonly HastChild[], pattern: RegExp): HastChild[] {
  const first = nodes.at(0);
  if (!isText(first)) return [...nodes];
  const remainder = first.value.replace(pattern, '');
  return remainder === '' ? nodes.slice(1) : [text(remainder), ...nodes.slice(1)];
}

/** Paragraph children with the leading GitHub marker removed, or undefined. */
function stripGithubMarker(children: readonly HastChild[]): Stripped {
  const first = children.at(0);
  if (!isText(first)) return undefined;
  const match = GITHUB_MARKER.exec(first.value);
  const kind = match?.[1]?.toLowerCase();
  if (match === null || kind === undefined || !isAlertKind(kind)) return undefined;
  return { kind, rest: trimLeadingText(children, GITHUB_MARKER) };
}

/** `**Note**: text` — the colon sits outside the bold. */
function stripBareLabel(strong: HastElement, following: readonly HastChild[]): Stripped {
  const kind = textOf(strong).trim().toLowerCase();
  const next = following.at(0);
  if (!isAlertKind(kind) || !isText(next) || !next.value.startsWith(':')) return undefined;
  return { kind, rest: trimLeadingText(following, /^:\s*/) };
}

/** `**Note:** text` or `**Warning — lead sentence.** text`. */
function stripLeadLabel(strong: HastElement, following: readonly HastChild[]): Stripped {
  const lead = strong.children.at(0);
  if (!isText(lead)) return undefined;
  const match = BOLD_LABEL.exec(lead.value);
  const kind = match?.[1]?.toLowerCase();
  if (match === null || kind === undefined || !isAlertKind(kind)) return undefined;

  const leadRest = lead.value.slice(match[0].length);
  const leadAfter = strong.children.slice(1);
  if (leadRest === '' && leadAfter.length === 0) {
    // The label was the whole bold: drop it and the gap after it.
    return { kind, rest: trimLeadingText(following, /^\s+/) };
  }
  // Keep the lead sentence, minus the label.
  const kept = el('strong', strong.properties, [text(capitalize(leadRest)), ...leadAfter]);
  return { kind, rest: [kept, ...following] };
}

/** Paragraph children with a leading bold alert label removed, or undefined. */
function stripBoldLabel(children: readonly HastChild[]): Stripped {
  const first = children.at(0);
  if (!isElement(first, 'strong')) return undefined;
  const following = children.slice(1);
  return stripBareLabel(first, following) ?? stripLeadLabel(first, following);
}

/** The alert a blockquote declares, or undefined for an ordinary quotation. */
export function detectAlert(blockquote: HastElement): Alert | undefined {
  const firstIndex = blockquote.children.findIndex((c) => !isBlankText(c));
  const firstPara = blockquote.children[firstIndex];
  if (!isElement(firstPara, 'p')) return undefined;

  const stripped = stripGithubMarker(firstPara.children) ?? stripBoldLabel(firstPara.children);
  if (stripped === undefined) return undefined;

  const keepPara = stripped.rest.some((c) => !isBlankText(c));
  const before = blockquote.children.slice(0, firstIndex);
  const after = blockquote.children.slice(firstIndex + 1);
  const para = keepPara ? [el('p', firstPara.properties, stripped.rest)] : [];
  return { kind: stripped.kind, body: [...before, ...para, ...after] };
}

/** The callout element for an alert. */
export function calloutElement(kind: AlertKind, body: HastChild[]): HastElement {
  return el('aside', { className: ['callout'], dataKind: kind, role: 'note' }, [
    el('p', { className: ['callout-title'] }, [
      raw(calloutIconSvg(kind)),
      text(CALLOUT_LABELS[kind]),
    ]),
    el('div', { className: ['callout-body'] }, body),
  ]);
}

export default function hastAlerts(): HastPluginDefinition {
  return defineHastPlugin({
    name: 'nexus-alerts',
    element: {
      filter: ['blockquote'],
      visit(node, ctx) {
        const alert = detectAlert(node);
        if (alert === undefined) return;
        ctx.replaceNode(node, calloutElement(alert.kind, alert.body));
      },
    },
  });
}
