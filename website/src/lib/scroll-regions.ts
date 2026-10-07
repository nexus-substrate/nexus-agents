/**
 * scroll-regions.ts — make overflowing table wrappers keyboard-scrollable,
 * and only those (#7199 a11y review).
 *
 * The build wraps every table in a plain `.scroll-wrap` div
 * (src/plugins/hast-wrap-tables.ts). A wrapper whose table fits needs nothing.
 * One whose table overflows must be focusable so the overflow can be scrolled
 * without a pointer (axe: scrollable-region-focusable), and a focusable
 * region needs a name — a unique one, or every table on a page reads as the
 * same landmark (axe: landmark-unique). Without JS the wrappers stay plain,
 * pointer-scrollable divs.
 *
 * @module website/src/lib/scroll-regions
 */

export interface TableContext {
  /** Text of the table's <caption>, if any. */
  caption?: string | undefined;
  /** Text of the nearest heading before the table, if any. */
  heading?: string | undefined;
}

function clean(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/\s+/g, ' ').trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

/**
 * One accessible name per table, in document order: the caption, else the
 * nearest preceding heading, else "Table N" (N is 1-based position). A
 * repeated name gets " (table N)" appended so every label is unique.
 */
export function regionLabels(tables: readonly TableContext[]): string[] {
  const used = new Set<string>();
  return tables.map((table, index) => {
    const n = String(index + 1);
    const base = clean(table.caption) ?? clean(table.heading) ?? `Table ${n}`;
    let label = used.has(base) ? `${base} (table ${n})` : base;
    for (let k = 2; used.has(label); k++) label = `${base} (table ${n}, ${String(k)})`;
    used.add(label);
    return label;
  });
}

function precedingHeading(el: Element): string | undefined {
  // Walk back through previous siblings, then up, to the nearest heading.
  for (let node: Element | null = el; node !== null; node = node.parentElement) {
    for (let sib = node.previousElementSibling; sib !== null; sib = sib.previousElementSibling) {
      if (/^H[1-6]$/.test(sib.tagName)) return sib.textContent;
      const last = [...sib.querySelectorAll('h1, h2, h3, h4, h5, h6')].at(-1);
      if (last !== undefined) return last.textContent;
    }
    if (node.classList.contains('docs-body')) break;
  }
  return undefined;
}

/** Name and enable the wrappers that overflow; strip the rest. */
export function syncScrollRegions(root: ParentNode = document): void {
  const wrappers = [...root.querySelectorAll<HTMLElement>('.scroll-wrap')];
  const labels = regionLabels(
    wrappers.map((wrap) => ({
      caption: wrap.querySelector('caption')?.textContent ?? undefined,
      heading: precedingHeading(wrap),
    }))
  );
  wrappers.forEach((wrap, i) => {
    if (wrap.scrollWidth > wrap.clientWidth) {
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', labels[i] ?? `Table ${String(i + 1)}`);
    } else {
      wrap.removeAttribute('tabindex');
      wrap.removeAttribute('role');
      wrap.removeAttribute('aria-label');
    }
  });
}
