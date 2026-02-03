/**
 * Secrets Management Knowledge Module
 *
 * Secrets lifecycle, rotation patterns, vault integration,
 * environment variable handling, and pre-commit scanning.
 *
 * @module agents/experts/knowledge/security/secrets-management
 * @see NIST 800-53: SC-12, SC-13
 * (Source: Epic #643 / Issue #645 - Phase 1a)
 */

import type { KnowledgeModule } from '../types.js';

export const SECRETS_MANAGEMENT_MODULE: KnowledgeModule = {
  id: 'security-secrets-management',
  domain: 'security',
  title: 'Secrets Management and Key Lifecycle',
  nistControls: ['SC-12', 'SC-13'],
  tags: ['secrets', 'vault', 'key-management', 'rotation', 'environment-variables'],
  sections: [
    {
      title: 'Secrets Lifecycle',
      content: [
        'PHASES: Generation -> Storage -> Distribution -> Usage -> Rotation -> Revocation',
        'GENERATION:',
        '  - Use cryptographically secure RNG (crypto.randomBytes, /dev/urandom)',
        '  - Minimum entropy: API keys 256-bit, passwords 128-bit',
        '  - Generate secrets in secure environment, not dev machines',
        'STORAGE:',
        '  - Secrets manager (Vault, AWS Secrets Manager, GCP Secret Manager)',
        '  - Encrypted at rest with managed keys (AES-256-GCM)',
        '  - Access-controlled: least privilege, audit logged',
        'REVOCATION:',
        '  - Immediate revocation capability for all secret types',
        '  - Maintain revocation list or use short-lived secrets',
        '  - Automate revocation on personnel changes',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'Never Hardcode Secrets',
      content: [
        'DETECT: Strings matching secret patterns in source code',
        '  - API keys: long alphanumeric strings, base64 blocks',
        '  - Connection strings with embedded passwords',
        '  - Private keys (-----BEGIN RSA PRIVATE KEY-----)',
        '  - AWS access keys (AKIA...), GCP service account JSON',
        'PREVENTION:',
        '  - Pre-commit hooks: git-secrets, Gitleaks, detect-secrets',
        '  - CI scanning: run secret detection in every PR pipeline',
        '  - IDE plugins: flag secrets in real-time during development',
        'IF EXPOSED:',
        '  1. Revoke the secret immediately',
        '  2. Rotate to a new secret',
        '  3. Audit usage logs for unauthorized access',
        '  4. Remove from git history (BFG Repo-Cleaner or git filter-branch)',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'Rotation Policies',
      content: [
        'ROTATION SCHEDULE:',
        '  - API keys: every 90 days or on suspected compromise',
        '  - Database credentials: every 90 days, automated',
        "  - TLS certificates: before expiry (automate with ACME/Let's Encrypt)",
        '  - Signing keys: annually, with key versioning',
        '  - Service account tokens: every 30 days',
        'ZERO-DOWNTIME ROTATION:',
        '  1. Create new secret (version N+1)',
        '  2. Deploy consumers to accept both N and N+1',
        '  3. Update producers to use N+1',
        '  4. Verify all traffic uses N+1',
        '  5. Revoke version N',
        'AUTOMATION: Use secrets manager native rotation (Vault dynamic secrets)',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Environment Variable Handling',
      content: [
        'RULES:',
        '  - Use env vars for runtime secrets injection (12-factor app)',
        '  - Never log env var values (log presence only: KEY_SET=true)',
        '  - Never pass secrets via CLI arguments (visible in ps/proc)',
        '  - Never commit .env files (add to .gitignore)',
        'LOADING PATTERN:',
        '  1. Load from secrets manager at startup (preferred)',
        '  2. Inject via orchestrator env (Kubernetes secrets, ECS secrets)',
        '  3. Load from .env file in development only (dotenv)',
        'VALIDATION:',
        '  - Fail fast on missing required secrets at startup',
        '  - Validate secret format (expected length, prefix) without logging value',
        '  - Use typed config schemas (Zod) to enforce required secrets',
      ].join('\n'),
      priority: 8,
    },
    {
      title: 'Vault Integration Patterns',
      content: [
        'HASHICORP VAULT:',
        '  - Use AppRole auth for services (role_id + secret_id)',
        '  - Use Kubernetes auth for K8s workloads (service account JWT)',
        '  - Prefer dynamic secrets (database, AWS STS) over static',
        '  - Set TTL on leases; renew before expiry',
        'CERTIFICATE MANAGEMENT:',
        '  - Use Vault PKI engine for internal TLS certificates',
        '  - Short-lived certs (24-72 hours) with automated renewal',
        '  - Pin to CA, not individual leaf certificates',
        'CLIENT PATTERN:',
        '  - Cache secrets in memory with TTL (never write to disk)',
        '  - Handle lease expiry gracefully (re-fetch, not crash)',
        '  - Use connection pooling for Vault client requests',
      ].join('\n'),
      priority: 7,
    },
  ],
} as const;
