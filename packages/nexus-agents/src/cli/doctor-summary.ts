/** Summary rendering shared by local doctor and its live CLI handler. */
import type { DoctorResult } from './doctor.js';
import type { CliReadiness } from './cli-readiness.js';
import { colors, writeLine } from './ansi-output.js';
import { failingVerdictTerms, summaryNotes } from './doctor-verdict-terms.js';

/** Prints the summary line with issue count. */
export function printDoctorSummary(result: DoctorResult, live?: readonly CliReadiness[]): void {
  const terms = failingVerdictTerms(result, live);
  const freshnessNote = summaryNotes(result, live);
  // Name the terms, don't just count them (#6011). `doctor` marks several lines
  // with a warning glyph, and only some of them are counted — the API-keys note
  // is advisory because CLI auth already satisfies `hasAuthMethod`. A bare count
  // left the reader to re-derive which warning it referred to, which meant
  // reading printDoctorSummary to find out.
  // Parenthesised, not after an em dash: `freshnessNote` already appends its own
  // ` — stale global install` clause, and two dash-separated clauses on one line
  // read as a single run-on. Seen in the real output before this was changed.
  const named = terms.length > 0 ? ` (${terms.join(', ')})` : '';
  const ready = live === undefined ? result.allHealthy : terms.length === 0;
  const summary =
    live?.length === 0
      ? `${colors.yellow}${colors.bold}Summary: live readiness unmeasured — no adapters probed${colors.reset}${named}${freshnessNote}`
      : ready
        ? `${colors.green}${colors.bold}Status: Ready${colors.reset}${freshnessNote}`
        : `${colors.yellow}${colors.bold}Summary: ${String(terms.length)} issue(s) found${named}${colors.reset}${freshnessNote}`;
  writeLine(`${summary}\n`);
}
