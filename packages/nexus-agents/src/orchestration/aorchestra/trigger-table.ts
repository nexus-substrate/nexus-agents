/**
 * Trigger Table — file-pattern to expert role routing.
 *
 * Maps file extensions, path prefixes, and filename patterns to
 * recommended expert types. Used by agent planner to augment expert
 * selection based on task file context.
 *
 * Uses simple string matching (includes/endsWith) instead of regex
 * to avoid ReDoS risk from user-provided patterns.
 *
 * @module orchestration/aorchestra/trigger-table
 * (Source: Issue #1304, Epic #1299, arXiv:2602.20478)
 */

import type { BuiltInExpertType } from '../../agents/experts/expert-config.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A single trigger rule mapping a file pattern to an expert role.
 */
export interface TriggerRule {
  /** Pattern to match against file paths (simple string match) */
  readonly pattern: string;
  /** Expert role to recommend when pattern matches */
  readonly role: BuiltInExpertType;
  /** Reason for this mapping */
  readonly reason: string;
}

// ============================================================================
// Default Trigger Table
// ============================================================================

/**
 * Default trigger table with common file pattern → expert mappings.
 * Patterns use simple string matching (includes) for ReDoS safety.
 */
export const DEFAULT_TRIGGER_TABLE: readonly TriggerRule[] = [
  // Testing
  { pattern: '.test.', role: 'testing', reason: 'Test file' },
  { pattern: '.spec.', role: 'testing', reason: 'Spec file' },
  { pattern: '__tests__', role: 'testing', reason: 'Test directory' },

  // Security
  { pattern: 'security/', role: 'security', reason: 'Security module' },
  { pattern: 'security\\', role: 'security', reason: 'Security module (Windows)' },
  { pattern: 'auth/', role: 'security', reason: 'Authentication module' },
  { pattern: 'auth\\', role: 'security', reason: 'Authentication module (Windows)' },
  { pattern: 'crypto', role: 'security', reason: 'Cryptography code' },

  // Documentation
  { pattern: 'docs/', role: 'documentation', reason: 'Documentation directory' },
  { pattern: 'docs\\', role: 'documentation', reason: 'Documentation directory (Windows)' },
  { pattern: '.md', role: 'documentation', reason: 'Markdown documentation' },

  // DevOps / CI
  { pattern: 'Dockerfile', role: 'devops', reason: 'Docker configuration' },
  { pattern: 'docker-compose', role: 'devops', reason: 'Docker Compose' },
  { pattern: '.github/workflows', role: 'devops', reason: 'GitHub Actions CI' },
  { pattern: '.gitlab-ci', role: 'devops', reason: 'GitLab CI' },
  { pattern: 'Jenkinsfile', role: 'devops', reason: 'Jenkins pipeline' },
  { pattern: '.yaml', role: 'devops', reason: 'YAML config' },
  { pattern: '.yml', role: 'devops', reason: 'YAML config' },

  // Infrastructure
  { pattern: 'terraform/', role: 'infrastructure', reason: 'Terraform IaC' },
  { pattern: 'terraform\\', role: 'infrastructure', reason: 'Terraform IaC (Windows)' },
  { pattern: '.tf', role: 'infrastructure', reason: 'Terraform file' },
  { pattern: 'ansible/', role: 'infrastructure', reason: 'Ansible playbook' },
  { pattern: 'pulumi/', role: 'infrastructure', reason: 'Pulumi IaC' },

  // Architecture
  { pattern: 'adr/', role: 'architecture', reason: 'Architecture Decision Record' },
  { pattern: 'architecture/', role: 'architecture', reason: 'Architecture module' },
];

// ============================================================================
// Public API
// ============================================================================

/**
 * Match file paths against trigger rules and return recommended expert roles.
 *
 * Uses simple string includes matching for ReDoS safety — no user-provided
 * regex. Returns deduplicated roles ordered by first match.
 *
 * @param filePaths - File paths to check against trigger rules
 * @param table - Trigger table to use (default: DEFAULT_TRIGGER_TABLE)
 * @returns Deduplicated array of recommended expert roles
 */
export function matchTriggers(
  filePaths: readonly string[],
  table: readonly TriggerRule[] = DEFAULT_TRIGGER_TABLE
): readonly BuiltInExpertType[] {
  if (filePaths.length === 0) return [];

  const matched = new Set<BuiltInExpertType>();
  const lowerPaths = filePaths.map((p) => p.toLowerCase());

  for (const rule of table) {
    const lowerPattern = rule.pattern.toLowerCase();
    for (const lowerPath of lowerPaths) {
      if (lowerPath.includes(lowerPattern)) {
        matched.add(rule.role);
        break; // One match per rule is enough
      }
    }
  }

  return [...matched];
}
