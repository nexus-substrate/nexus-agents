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
 * CLAUDE.md: the governor path set is PARSED from the section of CODEOWNERS
 * bounded by the `# @governor-section-start` and `# @governor-section-end`
 * directives, and BOTH governor gates derive their set from this single parse.
 * An entry outside those directives is an ordinary review-request, not a
 * governor path.
 *
 * @module scripts/governor-section
 */

/**
 * The directive line that OPENS the governor section of /CODEOWNERS (#6048).
 *
 * A dedicated directive, not the human heading. Until #6048 the boundary was a
 * prefix of the committed heading (`# Governor's own core — …`), which made a
 * line written for people double as a parser boundary: a mention of the phrase
 * opened the section (#6032), and the prefix and the prose had to be separated
 * by hand. Four defects in this ~20-line parser — #5137, #5576, #6030, #6032 —
 * and three of them were boundary-matching, which indicts the representation
 * rather than any single matcher.
 *
 * The directive carries no prose, so nothing about it gets edited, and it is
 * matched as a whole trimmed line (see {@link governorSectionLines}), so a
 * comment NAMING it does not open anything. There is deliberately NO fallback
 * to the old heading prefix: a silent fallback would recreate the #6032 class
 * with one more accepted spelling. The heading that follows it in CODEOWNERS
 * is free prose that nobody has to be careful about.
 */
export const GOVERNOR_SECTION_START_DIRECTIVE = '# @governor-section-start';

/**
 * The directive line that ENDS the governor section (#4683, #6048).
 *
 * #4683 introduced an end sentinel because the section previously ran from
 * its heading to end of file, and `#` lines are skipped as comments, so a
 * later section heading could not end it either: any CODEOWNERS entry appended
 * below became a governor path AND its owners became ratifiers. #6048 renames
 * that sentinel into the directive pair so both boundaries share one shape.
 */
export const GOVERNOR_SECTION_END_DIRECTIVE = '# @governor-section-end';

/**
 * Thrown when the governor section cannot be derived from CODEOWNERS: a
 * directive is missing, duplicated, or out of order, or the bounded section
 * yields no path pattern. A distinct class so a gate can tell a parse refusal
 * from an I/O failure; both are fail-closed, but they are repaired differently.
 */
export class GovernorSectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GovernorSectionError';
  }
}

function cannotDerive(what: string): GovernorSectionError {
  return new GovernorSectionError(`CODEOWNERS: ${what} — the governor path set cannot be derived`);
}

/**
 * The zero-based line index of the ONE directive line, or a named refusal.
 *
 * Whole-line match after trimming, never a substring or a prefix. `includes`
 * ended the section on a comment that named the sentinel (#6030); a prefix
 * opened it on a comment that named the heading (#6032). A directive that is
 * absent and one that appears twice are both refused with the count, because
 * a second start above the real one would silently widen the set and a second
 * one inside it would silently vanish as a comment.
 */
function directiveLineIndex(
  lines: readonly string[],
  directive: string,
  role: 'start' | 'end'
): number {
  const hits = lines.flatMap((raw, index) => (raw.trim() === directive ? [index] : []));
  const name = `governor section ${role} directive '${directive}'`;
  if (hits.length > 1) {
    throw cannotDerive(`${name} duplicated (${String(hits.length)} occurrences)`);
  }
  const [only] = hits;
  if (only === undefined) throw cannotDerive(`${name} not found`);
  return only;
}

/**
 * The governor section's owner-rule lines: every non-blank, non-comment line
 * strictly between the start and end directives.
 *
 * Shared by the path and owner parsers so the two cannot disagree about where
 * the section is. Refuses, with a {@link GovernorSectionError} naming the
 * cause, rather than returning a flag: #5576 and #5137 were both a missing
 * boundary reported as a boolean that one consumer forgot to read, and the
 * two consumers then failed closed in OPPOSITE directions (paths ran to end of
 * file, owners went empty). One thrown error is one verdict for both gates.
 */
export function governorSectionLines(codeownersText: string): string[] {
  const raw = codeownersText.split('\n');
  const start = directiveLineIndex(raw, GOVERNOR_SECTION_START_DIRECTIVE, 'start');
  const end = directiveLineIndex(raw, GOVERNOR_SECTION_END_DIRECTIVE, 'end');
  if (end < start) {
    throw cannotDerive(
      `governor section end directive '${GOVERNOR_SECTION_END_DIRECTIVE}' precedes the start directive`
    );
  }
  return raw
    .slice(start + 1, end)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * Extract the governor path PATTERNS from CODEOWNERS text — the patterns in the
 * governance-of-the-governor section only (everything between the
 * {@link GOVERNOR_SECTION_START_DIRECTIVE} and {@link GOVERNOR_SECTION_END_DIRECTIVE}
 * lines). Each owner-rule line's FIRST token is the path pattern; comment/blank
 * lines are skipped. This is the SINGLE SOURCE — the gate never hardcodes a
 * divergent copy.
 *
 * Never returns an empty array: an absent or malformed section throws from
 * {@link governorSectionLines}, and a well-bounded section that yields nothing
 * throws here.
 */
export function governorPathsFromCodeowners(codeownersText: string): string[] {
  const patterns: string[] = [];
  for (const line of governorSectionLines(codeownersText)) {
    const pattern = line.split(/\s+/)[0];
    if (pattern !== undefined && pattern !== '') patterns.push(pattern);
  }

  // A bounded section must yield patterns (#6030). Returning [] here would
  // report "no governor paths exist" when the truth is "I failed to find them",
  // and both gates read that as nothing to assert -- the exact shape CLAUDE.md
  // forbids: a check that cannot fail by construction. The guard is on the
  // OUTPUT invariant rather than on one more known input spelling.
  if (patterns.length === 0) {
    throw new GovernorSectionError(
      `CODEOWNERS governor section found but yielded ZERO path patterns. ` +
        `This is a parse failure, not an empty set: both governor gates derive ` +
        `their path set from here, so an empty result would silently disable them. ` +
        `Every line between "${GOVERNOR_SECTION_START_DIRECTIVE}" and ` +
        `"${GOVERNOR_SECTION_END_DIRECTIVE}" is blank or a comment.`
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
 * Governor entries for files that must NOT exist (#6174).
 *
 * GitHub reads CODEOWNERS from `.github/CODEOWNERS` (precedence over the root
 * file), the root, or `docs/CODEOWNERS` (the root takes precedence over it).
 * The governor gates parse only the root file, so a PR that creates a shadow
 * file changes what GitHub enforces without changing what the gates measure.
 * Listing them in the governor section makes creating one a governor change;
 * `scripts/check-codeowners-errors.ts` fails closed when one exists. The #6034
 * "matches no tracked file" rule exempts exactly these — for them, matching
 * nothing is the healthy state.
 */
export const MUST_NOT_EXIST_GOVERNOR_PATHS: readonly string[] = [
  '/.github/CODEOWNERS',
  '/docs/CODEOWNERS',
];

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
 *
 * Entries in {@link MUST_NOT_EXIST_GOVERNOR_PATHS} are skipped: they are
 * governed precisely so that nothing matches them (#6174).
 */
export function unresolvedGovernorPatterns(
  patterns: readonly string[],
  trackedFiles: readonly string[],
  codeownersLines: readonly string[]
): string[] {
  const unresolved: string[] = [];
  for (const pattern of patterns) {
    if (MUST_NOT_EXIST_GOVERNOR_PATHS.includes(pattern)) continue;
    if (trackedFiles.some((file) => matchesCodeownersPattern(file, pattern))) continue;
    const idx = codeownersLines.findIndex((l) => l.trim().split(/\s+/)[0] === pattern);
    const where = idx === -1 ? 'CODEOWNERS' : `CODEOWNERS:${String(idx + 1)}`;
    unresolved.push(`${where}  ${pattern}`);
  }
  return unresolved;
}
