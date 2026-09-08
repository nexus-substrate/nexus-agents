/**
 * Verdict accounting for `nexus-agents doctor` — which of `isAllHealthy`'s terms
 * are currently failing.
 *
 * A separate module from the formatting because it answers a different question:
 * formatting decides how a result is rendered, this decides what counts as a
 * problem. Keeping the count derivable from a named list is what stops the
 * count and the verdict drifting apart again (#4851).
 *
 * @module cli/doctor-verdict-terms
 */

import { scratchSeverityIsAcceptable, worstSeverity } from './doctor-scratch-space.js';
import * as installFreshness from './doctor-install-freshness.js';
import type { DoctorResult } from './doctor.js';

/**
 * The verdict's failing terms, named.
 *
 * #4851 established the invariant — every term `isAllHealthy` reads must be a
 * term the count reads, or a lone failing diagnostic renders "Summary: 0
 * issue(s) found": a summary shown ONLY because something is wrong, saying
 * nothing is wrong. It was fixed by adding the terms that were missing at the
 * time, which left two still absent (an unsupported CLI version, and
 * `hasAuthMethod`) and the same bug reachable two other ways.
 *
 * Returning the terms instead of a bare number is what stops that recurring:
 * the list is the count, so a term cannot be added to the verdict and forgotten
 * in the total. Keep this in step with {@link isAllHealthy} — every `&&` there
 * needs a row here.
 */
export function failingVerdictTerms(result: DoctorResult): string[] {
  const terms: string[] = [];
  if (!result.nodeVersion.supported) terms.push('node version');
  if (!result.mcpServerReady) terms.push('MCP server');
  if (!installFreshness.installFreshnessIsHealthy(result.installFreshness)) {
    terms.push('install freshness');
  }
  if (!scratchSeverityIsAcceptable(worstSeverity(result.scratchSpace))) terms.push('scratch space');
  // `hasAuthMethod` (an API key OR an installed+authenticated CLI) deliberately
  // gets NO row of its own. Whenever it fails with CLIs present, every CLI is
  // unauthenticated and the per-CLI rows below already count it; a separate row
  // would report one problem twice. Its only otherwise-uncovered case is an
  // empty CLI list, which the 'no CLIs detected' row covers.
  // `versionStatus === 'unsupported'` was the term the per-CLI filter missed: an
  // installed, authenticated CLI on an unsupported version failed the verdict
  // while contributing nothing to the count.
  for (const c of result.clis) {
    if (!c.installed || !c.authenticated || c.versionStatus === 'unsupported') {
      terms.push(`CLI ${c.name}`);
    }
  }
  // `isAllHealthy` passes `whenEmpty = false` (#4581): zero detected CLIs is not
  // a healthy install. Without this row an API-key-only setup with no CLI reads
  // as unhealthy with nothing counted.
  if (result.clis.length === 0) terms.push('no CLIs detected');
  return terms;
}
