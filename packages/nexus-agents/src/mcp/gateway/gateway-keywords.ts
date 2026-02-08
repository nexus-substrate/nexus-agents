/**
 * Gateway Keyword Constants
 *
 * Single source of truth for security and architecture keywords used by
 * both the tier classifier and governance enforcer. Extracted to prevent
 * divergence between the two modules (DRY).
 *
 * @module mcp/gateway/gateway-keywords
 */

/** Keywords that indicate security-related work (case-insensitive substring match). */
export const SECURITY_KEYWORDS = [
  'security',
  'vulnerabilit',
  'cve-',
  'exploit',
  'injection',
  'xss',
  'csrf',
  'auth',
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
