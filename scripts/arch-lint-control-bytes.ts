/**
 * Raw control bytes in source for arch-lint: a `.ts` file must not carry one.
 *
 * A sibling of arch-lint.ts rather than a section of it, so the rule
 * collection can grow without the collector itself needing an exemption.
 *
 * @module scripts/arch-lint-control-bytes
 * (Source: Issue #6149)
 */

import { relative } from 'node:path';
import type { Violation } from './arch-lint.js';
import { ROOT } from './script-paths.js';

/**
 * Every C0 control byte except `\t`, `\n` and `\r`: 0x00-0x08, 0x0B, 0x0C,
 * 0x0E-0x1F. These are single-byte in UTF-8 and never part of a multi-byte
 * sequence, so scanning the decoded string finds exactly the raw bytes.
 * Spelled as escapes so this module does not match itself.
 */
const CONTROL_BYTE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

interface ControlByteHit {
  readonly line: number;
  readonly col: number;
  readonly code: number;
}

function findControlBytes(content: string): ControlByteHit[] {
  return content.split('\n').flatMap((line, i): ControlByteHit[] => {
    const m = CONTROL_BYTE.exec(line);
    if (m === null) return [];
    // One hit per line: the file is reported line by line, and the first byte
    // on a line is enough to open it at the right place.
    return [{ line: i + 1, col: m.index + 1, code: line.charCodeAt(m.index) }];
  });
}

function hex(code: number): string {
  return `0x${code.toString(16).toUpperCase().padStart(2, '0')}`;
}

function violation(file: string, hit: ControlByteHit): Violation {
  return {
    file,
    line: hit.line,
    rule: 'control-bytes',
    category: 'Source Encoding',
    message:
      `${file}:${String(hit.line)}:${String(hit.col)} raw control byte ${hex(hit.code)}` +
      ` — write it as an escape (\`\\0\`, \`\\x${hit.code.toString(16).padStart(2, '0')}\`)` +
      ` so grep stops classifying the file as binary (#6149)`,
    severity: 'error',
  };
}

/**
 * Check that a source file carries no raw control byte (#6149).
 *
 * `improvement-review.ts` joined its dedup-key parts with a literal NUL
 * written into the string. Runtime-wise that is the same string as `'\0'`,
 * but `grep` classifies a file with a NUL as binary and prints no matching
 * lines, so every grep-based ratchet and sweep over `src/` skipped the file:
 * the #6008 census missed a bare `max-lines` disable that was on line 21.
 *
 * Reports `file:line:col` — the column is the 1-based character index on the
 * line, which is also the byte column whenever the bytes before it are ASCII.
 * Every hit is an error: the two files that carried raw bytes inside regex
 * literals when the rule landed were rewritten as escapes in #6158, so there
 * is no baseline allowance left to ratchet.
 */
export function checkControlBytes(filePath: string, content: string): Violation[] {
  const file = relative(ROOT, filePath);
  return findControlBytes(content).map((hit) => violation(file, hit));
}
