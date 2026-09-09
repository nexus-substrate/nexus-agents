/**
 * governor-section.ts — parse the governor-owned path set out of CODEOWNERS.
 *
 * Extracted from check-governor-review.ts in #6030. Not a cosmetic split: that
 * file sat at 396 of its 400-line ceiling, so the #6030 guard tipped it over,
 * and a file at its ceiling answers the next change with a cap bump rather than
 * a decision (#6008). This is the cohesive unit — the CODEOWNERS reader — and it
 * already had cross-file consumers in check-governor-ratification.ts, so it is a
 * sibling with a real producer/consumer relationship rather than a same-file
 * extraction the wiring gate would read as no consumer at all.
 *
 * CLAUDE.md: the governor path set is PARSED from the section bounded by the
 * `Governor's own core` marker and the `END governor-owned paths` sentinel, and
 * BOTH governor gates derive their set from this single parse. An entry outside
 * those markers is an ordinary review-request, not a governor path.
 *
 * @module scripts/governor-section
 */

/**
 * The GOVERNANCE-OF-THE-GOVERNOR section of /CODEOWNERS. Only the path patterns
 * BELOW this marker comment are treated as governor paths; the rest of CODEOWNERS
 * (security, pipeline, mcp, …) carries its own review requirements but is out of
 * scope for THIS gate. The marker is the section heading committed in CODEOWNERS.
 */
export const GOVERNOR_SECTION_MARKER = "Governor's own core";

/**
 * Sentinel that ends the governor section (#4683).
 *
 * The section previously ran from its heading to end of file, and `#` lines are
 * skipped as comments, so a later section heading could not end it either. Any
 * CODEOWNERS entry appended below therefore became a governor path AND — far
 * worse — its owners became ratifiers of governor changes. That was latent only
 * because the governor section happens to be last today; appending one ordinary
 * section would have silently handed ratification rights to its owners.
 */
export const GOVERNOR_SECTION_END_MARKER = 'END governor-owned paths';

/** The literal CODEOWNERS line that terminates the governor section. */
export const GOVERNOR_SECTION_END_LINE = `# ${GOVERNOR_SECTION_END_MARKER}`;

/**
 * The governor section's owner-rule lines, plus whether the section was
 * explicitly terminated.
 *
 * Shared by the path and owner parsers so the two cannot disagree about where
 * the section ends. `terminated` is reported rather than assumed, because the
 * two callers fail closed in OPPOSITE directions: an unterminated section must
 * yield MORE protected paths (protect everything below) but NO ratifiers (we
 * cannot say who is authorised).
 */
export function governorSectionLines(codeownersText: string): {
  lines: string[];
  terminated: boolean;
  /**
   * Whether the START marker was found (#5576). Only `terminated` was tracked,
   * so a missing or renamed start marker returned `lines: []` with no signal —
   * indistinguishable from a section that exists and is empty, and both derive
   * zero governor patterns, which every gate downstream read as "nothing to
   * assert". The end-marker case was #5137; this is the same shape one line
   * earlier.
   */
  started: boolean;
} {
  const lines: string[] = [];
  let inSection = false;
  let terminated = false;
  for (const raw of codeownersText.split('\n')) {
    if (!inSection) {
      if (raw.includes(GOVERNOR_SECTION_MARKER)) inSection = true;
      continue;
    }
    // EXACT LINE, not a substring (#6030). `includes` here ended the section on
    // any line NAMING the sentinel, and because this test runs BEFORE the
    // comment skip below, an ordinary explanatory comment did it. Measured
    // against the real file: one comment under the start marker took the set
    // from 13 patterns to 0 while `started` and `terminated` both still
    // reported success -- so neither the #5576 missing-start guard nor the
    // #5137 missing-end guard could fire. Fail-OPEN, on the governor path.
    //
    // Exact matching is fail-closed in the other direction too: a sentinel
    // whose text drifts leaves the section unterminated, which #4683 already
    // routes to end-of-file -- MORE paths governed, not fewer.
    if (raw.trim() === GOVERNOR_SECTION_END_LINE) {
      terminated = true;
      break;
    }
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    lines.push(line);
  }
  return { lines, terminated, started: inSection };
}

/**
 * Extract the governor path PATTERNS from CODEOWNERS text — the patterns in the
 * governance-of-the-governor section only (everything from the
 * {@link GOVERNOR_SECTION_MARKER} heading to end of file). Each owner-rule line's
 * FIRST token is the path pattern; comment/blank lines are skipped. This is the
 * SINGLE SOURCE — the gate never hardcodes a divergent copy.
 */
export function governorPathsFromCodeowners(codeownersText: string): string[] {
  // An UNterminated section falls back to end-of-file (#4683). For paths that
  // is the fail-closed direction: more paths treated as governor-owned, not
  // fewer. The owner parser fails closed the other way.
  const section = governorSectionLines(codeownersText);
  const patterns: string[] = [];
  for (const line of section.lines) {
    const pattern = line.split(/\s+/)[0];
    if (pattern !== undefined && pattern !== '') patterns.push(pattern);
  }

  // A section that STARTED must yield patterns (#6030). Returning [] here would
  // report "no governor paths exist" when the truth is "I failed to find them",
  // and both gates read that as nothing to assert -- the exact shape CLAUDE.md
  // forbids: a check that cannot fail by construction. This parser has now
  // produced three boundary defects (#5137, #5576, #6030), each landing on an
  // empty set with healthy flags, so the guard is on the OUTPUT invariant
  // rather than on one more known input spelling.
  //
  // An absent section is NOT this error -- `started === false` is #5576's case
  // and is reported there. This fires only when the markers were found and the
  // parse still came back empty.
  if (section.started && patterns.length === 0) {
    throw new Error(
      `CODEOWNERS governor section found but yielded ZERO path patterns. ` +
        `This is a parse failure, not an empty set: both governor gates derive ` +
        `their path set from here, so an empty result would silently disable them. ` +
        `Check for a comment between "${GOVERNOR_SECTION_MARKER}" and ` +
        `"${GOVERNOR_SECTION_END_LINE}" that terminates the section early.`
    );
  }
  return patterns;
}

/**
 * Match a repo-relative changed file against a single CODEOWNERS path pattern.
 * Supports the subset CODEOWNERS uses in this repo:
 *  - a leading `/` anchors the pattern at the repo root (all our patterns do);
 *  - a trailing `/` matches that directory and everything under it (recursive);
 *  - `*` matches any run of characters within a path segment;
 *  - an exact file path matches that file.
 * The file path is normalized to forward slashes with no leading `./`.
 */
export function matchesCodeownersPattern(file: string, pattern: string): boolean {
  const f = file.replace(/\\/g, '/').replace(/^\.\//, '');
  // Anchor: CODEOWNERS patterns here are all root-anchored ('/...'). Strip the
  // leading slash for comparison against the (root-relative) changed file.
  const pat = pattern.startsWith('/') ? pattern.slice(1) : pattern;

  // Directory pattern: 'foo/bar/' matches 'foo/bar/anything/under/here'.
  if (pat.endsWith('/')) {
    return f === pat.slice(0, -1) || f.startsWith(pat);
  }

  // Glob with '*': translate to a regex anchored over the whole path.
  if (pat.includes('*')) {
    const re = new RegExp(
      '^' +
        pat
          .split('*')
          .map((seg) => seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*') +
        '$'
    );
    return re.test(f);
  }

  // Exact file match.
  return f === pat;
}

/** True when `file` is under any governor path pattern. */
export function isGovernorPath(file: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchesCodeownersPattern(file, p));
}

/**
 * Governor patterns that match no tracked file (#6034).
 *
 * Pure: the caller supplies the pattern set, the tracked-file listing and the
 * CODEOWNERS lines, so the decision is testable without a working tree. The
 * I/O half lives in `checkGovernorPatternsResolve` (inject-governance.ts).
 *
 * Matching uses {@link matchesCodeownersPattern} — the same matcher both
 * governor gates use. A separate glob engine could pass a pattern the gates
 * cannot match, which would be this defect one layer over.
 *
 * Returns `"CODEOWNERS:<line>  <pattern>"` per unresolved entry. The line
 * number matters: "some pattern is stale" is not actionable on a 14-entry list.
 */
export function unresolvedGovernorPatterns(
  patterns: readonly string[],
  trackedFiles: readonly string[],
  codeownersLines: readonly string[]
): string[] {
  const unresolved: string[] = [];
  for (const pattern of patterns) {
    if (trackedFiles.some((file) => matchesCodeownersPattern(file, pattern))) continue;
    const idx = codeownersLines.findIndex((l) => l.trim().split(/\s+/)[0] === pattern);
    const where = idx === -1 ? 'CODEOWNERS' : `CODEOWNERS:${String(idx + 1)}`;
    unresolved.push(`${where}  ${pattern}`);
  }
  return unresolved;
}
