/**
 * Gateway Keyword Constants
 *
 * Single source of truth for security and architecture keywords used by
 * both the tier classifier and governance enforcer. Extracted to prevent
 * divergence between the two modules (DRY).
 *
 * @module mcp/gateway/gateway-keywords
 */

/**
 * Keywords that indicate security-related work.
 *
 * Matched on word boundaries by `keyword-match.ts`, NOT raw substring (#4518).
 *
 * `'auth'` used to be here as a bare stem and fired on **author**, escalating
 * a CHANGELOG formatting task to a security supermajority. Replacing it with
 * a bare word ALONE would have been worse: `\bauth\b` does not match
 * "authentication" or "authorization", so real security work would stop being
 * detected. Both are kept — `auth` on a word boundary catches "auth flow"
 * without catching "author", and the longer forms are enumerated explicitly.
 * Precision in the data rather than cleverness in the matcher.
 */
export const SECURITY_KEYWORDS = [
  'security',
  'vulnerabilit',
  'cve-',
  'exploit',
  'injection',
  'xss',
  'csrf',
  'auth',
  'authentication',
  'authorization',
  'authn',
  'authz',
  'oauth',
  'unauthenticated',
  'unauthorized',
  'penetration',
  'threat',
  'malware',
  'credentials',
  'secrets',
  'encryption',
  'certificate',
] as const;

/** Keywords that indicate architecture-related work (case-insensitive substring match). */
export const ARCHITECTURE_KEYWORDS = [
  'architecture',
  'breaking change',
  'breaking api',
  'api change',
  'migration',
  'refactor.*system',
  'redesign',
  'microservice',
  'monolith',
  'deprecation',
  'schema change',
  'database',
  'infrastructure',
] as const;

/** Roles that always trigger promotion to Tier 3. */
export const PROMOTED_ROLES = new Set(['security_expert', 'architecture_expert']);
