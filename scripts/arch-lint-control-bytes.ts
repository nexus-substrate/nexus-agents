/**
 * Raw control bytes in source for arch-lint: a `.ts` file must not carry one.
 *
 * A sibling of arch-lint.ts, following arch-lint-suppression.ts, so the rule
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

/**
 * Files that carried raw control bytes when the rule landed, keyed on the
 * ROOT-relative path, valued with the number of offending lines (#6158).
 *
 * A ratchet, not an allowlist: a baselined file may carry exactly this many
 * offending lines. One more is an error, and so is one fewer — a baseline
 * entry whose file is now clean is a blind spot for the next raw byte, so the
 * fix that removes the bytes must remove the entry in the same change.
 */
export const CONTROL_BYTE_BASELINE: ReadonlyMap<string, number> = new Map([
  ['packages/nexus-agents/src/cli/vote-command.test.ts', 1],
  ['packages/nexus-agents/src/pipeline/research-context.ts', 1],
]);

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

function violation(
  file: string,
  hit: ControlByteHit,
  detail: string,
  severity: Violation['severity']
): Violation {
  return {
    file,
    line: hit.line,
    rule: 'control-bytes',
    category: 'Source Encoding',
    message:
      `${file}:${String(hit.line)}:${String(hit.col)} raw control byte ${hex(hit.code)}` +
      ` — write it as an escape (\`\\0\`, \`\\x${hit.code.toString(16).padStart(2, '0')}\`)` +
      ` so grep stops classifying the file as binary${detail} (#6149)`,
    severity,
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
 * Baselined files (see `CONTROL_BYTE_BASELINE`) get warnings at their recorded
 * count and errors on either side of it.
 */
export function checkControlBytes(filePath: string, content: string): Violation[] {
  const file = relative(ROOT, filePath);
  const hits = findControlBytes(content);
  const expected = CONTROL_BYTE_BASELINE.get(file);

  if (expected === undefined) {
    return hits.map((hit) => violation(file, hit, '', 'error'));
  }
  if (hits.length === expected) {
    return hits.map((hit) =>
      violation(file, hit, `; baselined at ${String(expected)} (#6158)`, 'warning')
    );
  }
  if (hits.length > expected) {
    return hits.map((hit) =>
      violation(
        file,
        hit,
        `; baseline allows ${String(expected)}, found ${String(hits.length)}`,
        'error'
      )
    );
  }
  return [
    {
      file,
      line: 1,
      rule: 'control-bytes',
      category: 'Source Encoding',
      message:
        `${file} is in CONTROL_BYTE_BASELINE at ${String(expected)} but carries ` +
        `${String(hits.length)}; remove the entry so the file is guarded again (#6149)`,
      severity: 'error',
    },
  ];
}

/**
 * A baseline entry naming a file the walk never reached (renamed, deleted) is
 * as stale as one whose file is clean; the per-file check cannot see it.
 */
export function checkControlByteBaselineCoverage(scannedPaths: readonly string[]): Violation[] {
  const scanned = new Set(scannedPaths.map((p) => relative(ROOT, p)));
  return [...CONTROL_BYTE_BASELINE.keys()]
    .filter((file) => !scanned.has(file))
    .map((file) => ({
      file,
      line: 1,
      rule: 'control-bytes',
      category: 'Source Encoding',
      message: `${file} is in CONTROL_BYTE_BASELINE but was not scanned; remove the entry (#6149)`,
      severity: 'error',
    }));
}
