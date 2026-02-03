/**
 * OWASP API Security Top 10 (2023) Knowledge Module
 *
 * Detection patterns and remediation guidance for each OWASP API
 * security risk category.
 *
 * @module agents/experts/knowledge/security/owasp-api-top10
 * @see https://owasp.org/API-Security/
 * (Source: Epic #643 / Issue #645 - Phase 1a)
 */

import type { KnowledgeModule } from '../types.js';

export const OWASP_API_TOP10_MODULE: KnowledgeModule = {
  id: 'security-owasp-api-top10',
  domain: 'security',
  title: 'OWASP API Security Top 10 (2023)',
  nistControls: ['AC-3', 'AC-4', 'AC-6', 'IA-2', 'IA-5', 'SC-8', 'SI-10', 'AU-2'],
  tags: ['owasp', 'api', 'web-security', 'top10'],
  sections: [
    {
      title: 'API1 - Broken Object Level Authorization (BOLA)',
      content: [
        'DETECT: Direct object references in URL paths (e.g., /api/users/{id})',
        'DETECT: Missing ownership checks on resource access',
        'DETECT: Sequential or guessable IDs without authz validation',
        'REMEDIATE: Enforce per-object authorization checks in every handler',
        'REMEDIATE: Use non-sequential UUIDs for resource identifiers',
        'REMEDIATE: Validate resource ownership against authenticated user context',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'API2 - Broken Authentication',
      content: [
        'DETECT: Missing rate limiting on auth endpoints',
        'DETECT: Credentials in URL query parameters',
        'DETECT: Weak token generation (short, predictable)',
        'REMEDIATE: Enforce strong password policies + MFA',
        'REMEDIATE: Use short-lived access tokens (<15 min) with refresh rotation',
        'REMEDIATE: Rate-limit login attempts per IP and per account',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'API3 - Broken Object Property Level Authorization',
      content: [
        'DETECT: API responses exposing internal fields (isAdmin, passwordHash)',
        'DETECT: Mass assignment via unfiltered request bodies',
        'DETECT: Missing field-level access control on PATCH/PUT',
        'REMEDIATE: Define explicit response schemas per role',
        'REMEDIATE: Whitelist assignable fields; reject unknown properties',
        'REMEDIATE: Use DTOs to decouple internal models from API contracts',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'API4 - Unrestricted Resource Consumption',
      content: [
        'DETECT: Missing pagination limits on list endpoints',
        'DETECT: No request size limits on file uploads or payloads',
        'DETECT: Unbounded queries (SELECT * without LIMIT)',
        'REMEDIATE: Set max page size (e.g., 100 items), enforce server-side',
        'REMEDIATE: Limit request body size, file upload size, query complexity',
        'REMEDIATE: Implement rate limiting per user/IP with budget tracking',
      ].join('\n'),
      priority: 8,
    },
    {
      title: 'API5 - Broken Function Level Authorization',
      content: [
        'DETECT: Admin endpoints accessible by regular users',
        'DETECT: HTTP method-based access control bypass (GET vs DELETE)',
        'DETECT: Missing role checks on privileged operations',
        'REMEDIATE: Deny by default; explicitly grant per-role access',
        'REMEDIATE: Enforce authz at middleware layer, not just in handlers',
        'REMEDIATE: Audit all endpoints for correct role requirements',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'API6 - Unrestricted Access to Sensitive Business Flows',
      content: [
        'DETECT: No rate limiting on business-critical flows (checkout, transfers)',
        'DETECT: Automated abuse of referral/reward systems',
        'DETECT: Missing CAPTCHA or bot detection on high-value operations',
        'REMEDIATE: Identify and protect business-critical flows',
        'REMEDIATE: Add velocity checks and anomaly detection',
        'REMEDIATE: Implement step-up authentication for sensitive operations',
      ].join('\n'),
      priority: 7,
    },
    {
      title: 'API7 - Server Side Request Forgery (SSRF)',
      content: [
        'DETECT: User-supplied URLs fetched server-side without validation',
        'DETECT: Internal service endpoints reachable via URL parameters',
        'DETECT: DNS rebinding or redirect-following in URL fetchers',
        'REMEDIATE: Validate and whitelist allowed URL schemes and hosts',
        'REMEDIATE: Block requests to internal/private IP ranges (RFC 1918)',
        'REMEDIATE: Use allowlists for external service integrations',
      ].join('\n'),
      priority: 8,
    },
    {
      title: 'API8 - Security Misconfiguration',
      content: [
        'DETECT: Verbose error messages exposing stack traces',
        'DETECT: Missing security headers (CORS wildcard, no CSP)',
        'DETECT: Default credentials or unnecessary HTTP methods enabled',
        'REMEDIATE: Harden CORS: explicit origins, no wildcard with credentials',
        'REMEDIATE: Enable security headers: CSP, HSTS, X-Content-Type-Options',
        'REMEDIATE: Disable debug endpoints and verbose errors in production',
      ].join('\n'),
      priority: 7,
    },
    {
      title: 'API9 - Improper Inventory Management',
      content: [
        'DETECT: Undocumented or shadow API endpoints',
        'DETECT: Old API versions still accessible without deprecation',
        'DETECT: Missing API gateway or centralized access control',
        'REMEDIATE: Maintain an API inventory with OpenAPI specs',
        'REMEDIATE: Enforce versioning policy with sunset dates',
        'REMEDIATE: Route all traffic through API gateway for visibility',
      ].join('\n'),
      priority: 6,
    },
    {
      title: 'API10 - Unsafe Consumption of APIs',
      content: [
        'DETECT: Third-party API responses used without validation',
        'DETECT: Missing TLS verification on outbound API calls',
        'DETECT: No timeout or circuit breaker on external dependencies',
        'REMEDIATE: Validate and sanitize all third-party API responses',
        'REMEDIATE: Enforce TLS 1.2+ with certificate verification',
        'REMEDIATE: Set timeouts, retries, and circuit breakers on external calls',
      ].join('\n'),
      priority: 7,
    },
  ],
} as const;
