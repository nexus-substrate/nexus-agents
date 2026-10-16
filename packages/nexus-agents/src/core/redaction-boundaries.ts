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

/** Encoded whitespace/delimiters and escaped quotes terminate contextual scanning (#7426). */
function isEncodedDelimiter(text: string, index: number, limit: number): boolean {
  const next = text[index + 1];
  if (next === 'n' || next === 'r' || next === 't') return true;
  if (next === '"') {
    // A legacy match limit never splits an opening escape pair (#7315).
    return index + 1 < limit;
  }
  return false;
}

/** Whether an escape terminates contextual scanning at an encoded delimiter (#7426). */
function isTerminatingEscape(text: string, end: number, field: boolean, limit: number): boolean {
  return !field && isEncodedDelimiter(text, end, limit);
}

/** Resolves the effective scan limit for contextValueEnd. */
function scanLimit(boundary: number | 'json-field', length: number): number {
  return typeof boundary === 'number' ? Math.min(boundary, length) : length;
}

/** Resolves the stop condition for a character during value scanning. */
function stepBoundary(
  char: string,
  field: boolean,
  state: ValueScanState,
  query: boolean,
  json: boolean
): ValueBoundary {
  return field ? fieldValueBoundary(char, state) : contextValueBoundary(char, query, json);
}

/**
 * End of a context value. Plain text keeps the pre-#7296 extent: the whole
 * non-whitespace run (`&`-bounded for a query value). Inside a JSON string the
 * value also ends at the unescaped `"` that closes the string, and an escape is
 * consumed as an indivisible pair, so the redaction never splits one (#7296),
 * while encoded whitespace/delimiters (`\n`, `\r`, `\t`) and escaped quotes (`\"`)
 * terminate contextual value scanning (#7426).
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
  const limit = scanLimit(boundary, text.length);
  const state: ValueScanState = { depth: 0, quoted: !field };
  let end = start;
  while (end < limit) {
    const char = text.charAt(end);
    if (isJsonEscape(char, json, state.quoted)) {
      if (isTerminatingEscape(text, end, field, limit)) break;
      end += 2;
      continue;
    }
    const stop = stepBoundary(char, field, state, query, json);
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
