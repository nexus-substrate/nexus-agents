/**
 * Authentication Knowledge Module
 *
 * OAuth2 flows, JWT validation, MFA patterns, session management,
 * and password storage best practices.
 *
 * @module agents/experts/knowledge/security/authentication
 * @see NIST 800-53: IA-2, IA-5, IA-8
 * (Source: Epic #643 / Issue #645 - Phase 1a)
 */

import type { KnowledgeModule } from '../types.js';

export const AUTHENTICATION_MODULE: KnowledgeModule = {
  id: 'security-authentication',
  domain: 'security',
  title: 'Authentication Standards and Patterns',
  nistControls: ['IA-2', 'IA-5', 'IA-8'],
  tags: ['authentication', 'oauth2', 'jwt', 'mfa', 'session'],
  sections: [
    {
      title: 'OAuth2 Authorization Code Flow with PKCE',
      content: [
        'REQUIRED for SPAs and mobile apps (no client_secret in public clients)',
        'FLOW: 1) Generate code_verifier (43-128 chars, [A-Za-z0-9-._~])',
        '      2) Derive code_challenge = BASE64URL(SHA256(code_verifier))',
        '      3) Redirect to /authorize with code_challenge + method=S256',
        '      4) Exchange auth code + code_verifier at /token endpoint',
        'CHECKLIST:',
        '  - Use state parameter to prevent CSRF (bind to session)',
        '  - Validate redirect_uri exactly (no open redirects)',
        '  - Store tokens in memory or httpOnly cookies (never localStorage)',
        '  - Use nonce parameter with OIDC to prevent replay attacks',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'JWT Validation Rules',
      content: [
        'SIGNING: Use RS256 (RSA + SHA-256) or ES256 (ECDSA); never HS256 with public keys',
        'VALIDATION CHECKLIST:',
        '  1. Verify signature against known public key (JWKS endpoint)',
        '  2. Check exp claim (reject expired tokens)',
        '  3. Check iss claim (must match expected issuer)',
        '  4. Check aud claim (must match this service)',
        '  5. Check iat claim (reject tokens issued too far in the past)',
        '  6. Reject alg: "none" explicitly',
        'TOKEN LIFETIMES:',
        '  - Access token: max 15 minutes',
        '  - Refresh token: max 7 days, single-use with rotation',
        '  - ID token: max 1 hour',
        'DENY: Embedded secrets in JWT payloads, JWTs in URL parameters',
      ].join('\n'),
      priority: 10,
    },
    {
      title: 'Multi-Factor Authentication (MFA)',
      content: [
        'TOTP (Time-based One-Time Password):',
        '  - Use SHA-1/SHA-256 with 6-digit codes, 30-second window',
        '  - Allow +/- 1 time step for clock drift',
        '  - Store shared secret encrypted at rest (AES-256)',
        '  - Provide backup codes (8+ chars, single-use, hashed in storage)',
        'WebAuthn / FIDO2 (preferred):',
        '  - Phishing-resistant: origin-bound credentials',
        '  - Use resident keys for passwordless flows',
        '  - Store credential public key + credential ID, never private key',
        '  - Set attestation: "none" unless compliance requires "direct"',
        'ENFORCEMENT: Require MFA for admin actions, sensitive data access, account recovery',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Session Management',
      content: [
        'COOKIE SETTINGS (all required):',
        '  - httpOnly: true (prevent XSS token theft)',
        '  - secure: true (HTTPS only)',
        '  - sameSite: "Lax" (default) or "Strict" (sensitive ops)',
        '  - path: "/" or most restrictive path needed',
        '  - maxAge: match session timeout (idle: 15min, absolute: 8hr)',
        'SESSION LIFECYCLE:',
        '  - Regenerate session ID after authentication',
        '  - Invalidate session server-side on logout (not just cookie clear)',
        '  - Implement idle timeout (15 min) and absolute timeout (8 hr)',
        '  - Bind session to user-agent + IP range for anomaly detection',
        'DENY: Session IDs in URLs, persistent sessions without re-auth',
      ].join('\n'),
      priority: 9,
    },
    {
      title: 'Password Storage',
      content: [
        'ALGORITHMS (in preference order):',
        '  1. argon2id (memory=64MB, iterations=3, parallelism=4)',
        '  2. bcrypt (cost factor=12, max input 72 bytes)',
        '  3. scrypt (N=2^17, r=8, p=1) — if argon2 unavailable',
        'RULES:',
        '  - Minimum 12 characters, no maximum below 128',
        '  - Check against breach databases (HIBP k-anonymity API)',
        '  - No composition rules (uppercase/special char requirements)',
        '  - Hash on server side, never client-only',
        'DENY: MD5, SHA-1, SHA-256 without KDF, plain-text storage, reversible encryption',
      ].join('\n'),
      priority: 8,
    },
  ],
} as const;
