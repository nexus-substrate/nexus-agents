/**
 * Authorization Knowledge Module
 *
 * RBAC/ABAC decision trees, policy patterns, least privilege,
 * and access control enforcement.
 *
 * @module agents/experts/knowledge/security/authorization
 * @see NIST 800-53: AC-3, AC-4, AC-6
 * (Source: Epic #643 / Issue #645 - Phase 1a)
 */

import type { KnowledgeModule } from '../types.js';

export const AUTHORIZATION_MODULE: KnowledgeModule = {
  id: 'security-authorization',
  domain: 'security',
  title: 'Authorization Patterns and Access Control',
  nistControls: ['AC-3', 'AC-4', 'AC-6'],
  tags: ['authorization', 'rbac', 'abac', 'access-control', 'least-privilege'],
  sections: [
    {
      title: 'RBAC vs ABAC Decision Tree',
      content: [
        'USE RBAC WHEN:',
        '  - Permissions map cleanly to job roles',
        '  - Organization has stable, well-defined role hierarchy',
        '  - Fewer than ~20 distinct permission sets needed',
        '  - Compliance requires auditable role assignments',
        'USE ABAC WHEN:',
        '  - Access depends on resource attributes (owner, classification)',
        '  - Context-sensitive rules (time-of-day, location, device)',
        '  - Fine-grained per-field or per-record authorization',
        '  - Dynamic policies that change without code deployment',
        'HYBRID APPROACH: Use RBAC for coarse-grained + ABAC for fine-grained',
        '  Example: RBAC grants "editor" role, ABAC restricts to own-department docs',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'Permission Inheritance and Hierarchy',
      content: [
        'PATTERN: Role hierarchy with additive permissions',
        '  viewer < editor < admin < super-admin',
        '  Each level inherits ALL permissions from levels below',
        'RULES:',
        '  - Deny overrides allow at every level',
        '  - Explicit deny cannot be overridden by inherited allow',
        '  - Permission boundaries: cap maximum permissions regardless of role',
        '  - Scope permissions to resource type + action pairs',
        'ANTI-PATTERNS:',
        '  - Negation-based rules (allow all except...) — use allowlists instead',
        '  - Role explosion (>50 roles) — indicates need for ABAC migration',
        '  - Permission creep — audit and revoke unused permissions quarterly',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Deny-by-Default Enforcement',
      content: [
        'PRINCIPLE: All access is denied unless explicitly granted',
        'IMPLEMENTATION:',
        '  1. Default middleware rejects unauthenticated requests (401)',
        '  2. Default authz middleware rejects unauthorized requests (403)',
        '  3. Routes explicitly declare required permissions',
        '  4. Missing permission annotations = denied (fail closed)',
        'CHECKLIST:',
        '  - [ ] No endpoint is accessible without authz check',
        '  - [ ] New routes require explicit permission declaration',
        '  - [ ] Wildcard permissions (e.g., resource:*) are prohibited',
        '  - [ ] Service-to-service calls use scoped service accounts',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'Policy Enforcement Points',
      content: [
        'LAYERED ENFORCEMENT (defense in depth):',
        '  Layer 1 — API Gateway: Rate limiting, IP filtering, token validation',
        '  Layer 2 — Service Middleware: Role/permission checks, scope validation',
        '  Layer 3 — Business Logic: Resource ownership, field-level access',
        '  Layer 4 — Data Layer: Row-level security, column masking',
        'RULES:',
        '  - Never rely on a single enforcement point',
        '  - Gateway checks are necessary but not sufficient',
        '  - Authorization decisions must be logged (who, what, when, result)',
        '  - Cache authz decisions with short TTL (max 5 min)',
      ].join('\n'),
      priority: 8,
    },
    {
      title: 'OAuth2 Scopes and API Authorization',
      content: [
        'SCOPE DESIGN:',
        '  - Use resource:action format (e.g., users:read, orders:write)',
        '  - Define minimal scope sets for each client type',
        '  - Require scope consent for third-party clients',
        'ENFORCEMENT:',
        '  - Validate token scopes on every API request',
        '  - Reject tokens with broader scopes than endpoint requires',
        '  - Use audience (aud) restriction to prevent token misuse across services',
        'LEAST PRIVILEGE:',
        '  - Grant minimum scopes needed for the client use case',
        '  - Short-lived tokens with narrow scopes over long-lived broad tokens',
        '  - Review and prune granted scopes periodically',
      ].join('\n'),
      priority: 8,
    },
  ],
} as const;
