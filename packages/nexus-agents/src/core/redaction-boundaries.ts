/** Shared JSON document and atomic value boundaries for redaction (#7322, #7315). */

/**
 * Whether `text` is one JSON document. Every context-rule prefix starts with a
 * letter, and in a JSON document letters occur only inside string literals, so
 * this one test places every match inside a JSON string.
 */
export function isJsonDocument(text: string): boolean {
  if (!/^\s*[[{"]/.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

interface ValueScanState {
  depth: number;
  quoted: boolean;
}

type ValueBoundary = 'before' | 'after' | undefined;

/** Field separators and balanced containers; quoted content is opaque. */
function fieldValueBoundary(char: string, state: ValueScanState): ValueBoundary {
  if (char === '"') {
    state.quoted = !state.quoted;
    return undefined;
  }
  if (state.quoted) return undefined;
  if (/[[{]/.test(char)) {
    state.depth++;
    return undefined;
  }
  if (/[\]}]/.test(char)) {
    if (state.depth === 0) return 'before';
    state.depth--;
    return state.depth === 0 ? 'after' : undefined;
  }
  if (state.depth === 0 && /[,\s]/.test(char)) return 'before';
  return undefined;
}

/** The pre-#7322 whitespace/query stops, plus a JSON string's closing quote. */
function contextValueBoundary(char: string, query: boolean, json: boolean): ValueBoundary {
  return /\s/.test(char) || (query && char === '&') || (json && char === '"')
    ? 'before'
    : undefined;
}

/** Escapes inside a JSON string are always consumed as a pair. */
function isJsonEscape(char: string, json: boolean, quoted: boolean): boolean {
  return json && quoted && char === '\\';
}

/**
 * End of a context value. Plain text keeps the pre-#7296 extent: the whole
 * non-whitespace run (`&`-bounded for a query value). Inside a JSON string the
 * value also ends at the unescaped `"` that closes the string, and an escape is
 * consumed as an indivisible pair, so the redaction never splits one (#7296).
 * A legacy match limit never splits an escape. `json-field` instead scans a
 * complete unquoted field value, keeping structural commas and braces outside
 * the value; nesting and strings inside containers use the same escape scan.
 */
export function contextValueEnd(
  text: string,
  start: number,
  query: boolean,
  json: boolean,
  boundary: number | 'json-field' = text.length
): number {
  const field = json && boundary === 'json-field';
  const limit = typeof boundary === 'number' ? Math.min(boundary, text.length) : text.length;
  const state: ValueScanState = { depth: 0, quoted: !field };
  let end = start;
  while (end < limit) {
    const char = text[end] ?? '';
    if (isJsonEscape(char, json, state.quoted)) {
      end += 2;
      continue;
    }
    const stop = field ? fieldValueBoundary(char, state) : contextValueBoundary(char, query, json);
    if (stop === 'before') break;
    end++;
    if (stop === 'after') break;
  }
  return Math.min(end, text.length);
}

/**
 * End of a value a legacy match stopped short of at an escaped quote inside a
 * JSON string: one decoding level down, that quote opened a quoted value. The
 * value runs through its escaped closing quote, or to the end of the enclosing
 * string, with escapes consumed as pairs. Taking the whole quoted value means a
 * later rule's keyword inside it is never separated from its own value.
 */
export function escapedValueEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length) {
    const char = text[end];
    if (char === '"') break;
    if (char !== '\\') {
      end++;
      continue;
    }
    const closes = text[end + 1] === '"';
    end += 2;
    if (closes) break;
  }
  return Math.min(end, text.length);
}
