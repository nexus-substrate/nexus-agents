/**
 * hast-process-list.ts — tutorial steps as a process list (#7285).
 *
 * On a tutorial (`diataxis: tutorial`), the run of top-level H2 steps written
 * `## 1. …`, `## 2. …` becomes one `<ol class="process-list">`, each step an
 * item holding its heading and everything up to the next H2 — the USWDS
 * process-list pattern (counter and left rule, styled in components.css).
 *
 * The headings stay real H2s with unchanged text, so the "on this page"
 * outline and existing `#1-install…` anchors keep working. The step number
 * already in the heading text is what the counter shows; the period is kept
 * for screen readers and hidden visually. The list ends at the first
 * unnumbered H2 ("What you did", "Next") and does not resume.
 *
 * @module website/src/plugins/hast-process-list
 */

import { defineHastPlugin, type HastPluginDefinition } from 'satteri';
import {
  el,
  frontmatterOf,
  isElement,
  rewriteRoot,
  text,
  textOf,
  type HastChild,
  type HastElement,
} from './hast-tree.ts';

const STEP = /^\d+\.\s+/;

function isSectionBreak(node: HastChild): boolean {
  return isElement(node, 'h1') || isElement(node, 'h2');
}

function isStep(node: HastChild): node is HastElement {
  return isElement(node, 'h2') && STEP.test(textOf(node));
}

/** The heading with its leading number wrapped as the visible counter. */
function counterHeading(h2: HastElement): HastElement {
  const first = h2.children.at(0);
  if (first?.type !== 'text') return h2;
  const match = STEP.exec(first.value);
  if (match === null) return h2;
  const digits = match[0].trimEnd().slice(0, -1); // "12. " -> "12"
  const num = el('span', { className: ['process-list-num'] }, [
    text(digits),
    el('span', { className: ['visually-hidden'] }, [text('.')]),
  ]);
  return el('h2', h2.properties, [
    num,
    text(` ${first.value.slice(match[0].length)}`),
    ...h2.children.slice(1),
  ]);
}

export function groupSteps(children: HastChild[]): HastChild[] {
  const start = children.findIndex(isStep);
  if (start === -1) return children;

  const items: HastElement[] = [];
  let i = start;
  for (
    let heading = children.at(i);
    heading !== undefined && isStep(heading);
    heading = children.at(i)
  ) {
    let end = i + 1;
    while (end < children.length && !isSectionBreak(children[end])) end++;
    items.push(
      el('li', { className: ['process-list-item'] }, [
        counterHeading(heading),
        ...children.slice(i + 1, end),
      ])
    );
    i = end;
  }
  const list = el('ol', { className: ['process-list'] }, items);
  return [...children.slice(0, start), list, text('\n'), ...children.slice(i)];
}

export default function hastProcessList(): HastPluginDefinition {
  return defineHastPlugin({
    name: 'nexus-process-list',
    after: rewriteRoot((children, ctx) =>
      frontmatterOf(ctx)['diataxis'] === 'tutorial' ? groupSteps(children) : children
    ),
  });
}
