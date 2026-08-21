/**
 * Word-boundary keyword matching for governance domain classification (#4518).
 *
 * The classifier previously used a raw substring test:
 *
 * ```ts
 * if (SECURITY_KEYWORDS.some((kw) => lower.includes(kw))) return 'security';
 * ```
 *
 * `'auth'` as an unbounded substring fires on **author**, so a CHANGELOG
 * formatting task ("list the pull request author name") was classified as
 * security work and escalated to a supermajority voting bar. A TypeDoc
 * question was escalated too, because the task text named the file
 * `security.ts`.
 *
 * That is worse than noise on the governance path. The recorded
 * `promotionReason` asserts security keywords were detected in work with no
 * security dimension, so an auditor reading why a task required supermajority
 * reads a false justification — and if most escalations are "author"
 * collisions, the domain signal stops being worth reading at all.
 *
 * ## Three matching modes, because the keyword lists mix three intents
 *
 *  - **Stems** (`vulnerabilit`, `cve-`) are deliberate prefixes covering
 *    inflections. Anchored at a word start, open at the end.
 *  - **Regex entries** (`refactor.*system`) were already regex-shaped but sat
 *    in a list documented as substring-matched, so that entry could only ever
 *    match the literal text `refactor.*system` — it was dead. Now compiled.
 *  - **Everything else** is a word or phrase and is matched on word
 *    boundaries.
 *
 * @module mcp/gateway/keyword-match
 * (Source: Issue #4518)
 */

/** Keywords that are intentionally prefixes, not whole words. */
const STEM_KEYWORDS = new Set(['vulnerabilit', 'cve-']);

/** Keywords authored as regular expressions rather than literals. */
const REGEX_KEYWORDS = new Set(['refactor.*system']);

/** Escape a literal for safe use inside a RegExp. */
function escapeLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Drop tokens that look like code rather than prose.
 *
 * A task that merely *names* `security.ts` is not security work. Filenames,
 * dotted identifiers and paths are stripped before matching so the classifier
 * reads intent rather than incidental symbols.
 */
export function stripCodeLikeTokens(text: string): string {
  return text
    .replace(/\S+\.(?:ts|tsx|js|jsx|mjs|cjs|json|ya?ml|md|toml|lock)\b/gi, ' ')
    .replace(/\b[\w.-]+\/[\w./-]+/g, ' ');
}

/** Build the matcher for one keyword, honouring its intended mode. */
function toPattern(keyword: string): RegExp {
  if (REGEX_KEYWORDS.has(keyword)) return new RegExp(keyword, 'i');
  if (STEM_KEYWORDS.has(keyword)) return new RegExp(`\\b${escapeLiteral(keyword)}`, 'i');
  return new RegExp(`\\b${escapeLiteral(keyword)}\\b`, 'i');
}

/** Compiled once per keyword — these lists are module constants. */
const PATTERNS = new Map<string, RegExp>();
function patternFor(keyword: string): RegExp {
  const cached = PATTERNS.get(keyword);
  if (cached !== undefined) return cached;
  const built = toPattern(keyword);
  PATTERNS.set(keyword, built);
  return built;
}

/**
 * Return the first keyword genuinely present in `text`, or undefined.
 *
 * Returns the keyword rather than a boolean so the caller can record WHICH
 * term triggered the classification — the `promotionReason` is only
 * trustworthy if it names the real match.
 */
export function findMatchingKeyword(text: string, keywords: readonly string[]): string | undefined {
  const prose = stripCodeLikeTokens(text);
  return keywords.find((kw) => patternFor(kw).test(prose));
}

/** Boolean convenience for call sites that do not need the matched term. */
export function matchesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return findMatchingKeyword(text, keywords) !== undefined;
}
