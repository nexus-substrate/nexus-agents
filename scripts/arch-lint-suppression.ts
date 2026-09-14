/**
 * Suppression hygiene for arch-lint: a `max-lines` disable states its reason.
 *
 * A sibling of arch-lint.ts rather than a section of it, so the rule
 * collection can grow without the collector itself needing a suppression.
 *
 * @module scripts/arch-lint-suppression
 * (Source: Issue #6008)
 */

import { relative } from 'node:path';
import type { Violation } from './arch-lint.js';
import { SRC_ROOT } from './script-paths.js';

/**
 * A `/* eslint-disable max-lines *\/` directive, whatever follows `max-lines`.
 * `(?![\w-])` keeps `max-lines-per-function` out of scope.
 */
const MAX_LINES_DISABLE = /\/\*\s*eslint-disable\s+max-lines(?![\w-])/;

/**
 * The same directive carrying a non-empty `-- reason` clause. The reason may
 * start on the same line or, with `--` closing the line, on the next one
 * (audit-logger.ts). `-- *\/` is an empty clause and does not count.
 */
const MAX_LINES_DISABLE_WITH_REASON = /\/\*\s*eslint-disable\s+max-lines\s+--\s*(?:$|(?!\*\/)\S)/;

/**
 * Check that every `eslint-disable max-lines` states why (#6008).
 *
 * A blanket disable silences the only thing that knows the file's real line
 * count, and the files with no recorded reason were the ones furthest past the
 * 600-line governance ceiling: seven of the eleven bare disables measured
 * 660-969 lines, while the reasoned ones mostly sat inside the 400-600 band
 * `.rules/governance.md` allows for a cohesive file. The reason has to live in
 * the directive's own `-- <reason>` clause; a trailing `// ...` after `*\/` is
 * prose eslint never sees, and it drifted ("400-600 OK" on a 969-line file).
 *
 * Runs over package source only. This module names the directive in its own
 * patterns, so scanning scripts/ would make it match itself.
 */
export function checkSuppressionReason(filePath: string, content: string): Violation[] {
  const file = relative(SRC_ROOT, filePath);
  const message =
    '`eslint-disable max-lines` without a `-- <reason>` clause; state why the file stays ' +
    'whole, or bound the rule with `/* eslint max-lines: [...] */` instead (#6008)';
  return content.split('\n').flatMap((line, i): Violation[] =>
    MAX_LINES_DISABLE.test(line) && !MAX_LINES_DISABLE_WITH_REASON.test(line)
      ? [
          {
            file,
            line: i + 1,
            rule: 'suppression-reason',
            category: 'Suppression Hygiene',
            message,
            severity: 'error',
          },
        ]
      : []
  );
}
