/**
 * Canonical fake secrets for test fixtures.
 *
 * ALL test code that needs secret-like values MUST import from here.
 * Every value contains "TEST", "FAKE", "EXAMPLE", or "xxxx" to make it
 * unambiguously non-real. This prevents GitHub secret scanning alerts
 * and accidental credential exposure.
 *
 * @module testing/test-secrets
 * (Source: Issue #1410 — secret scanning process improvement)
 */

// ============================================================================
// API Keys
// ============================================================================

/** Fake OpenAI-style API key (sk-* prefix, 48 chars). */
export const FAKE_OPENAI_KEY = 'sk-TESTFAKE000000000000000000000000000000000000000';

/** Fake Anthropic API key (sk-ant-* prefix). */
export const FAKE_ANTHROPIC_KEY = 'sk-ant-TESTFAKE00000000000000000000000000000000';

/** Fake Google AI / Gemini API key (AIzaSy prefix, 39 chars total). */
export const FAKE_GOOGLE_KEY = 'AIzaSyTEST-FAKE-KEY-NOT-REAL-0000000000';

/** Fake AWS access key ID (AKIA prefix, 20 chars). */
export const FAKE_AWS_KEY_ID = 'AKIATESTFAKENOTREAL0';

/** Fake AWS secret access key. */
export const FAKE_AWS_SECRET = 'TESTFAKE+NotReal/0000000000000000000000000';

// ============================================================================
// Tokens
// ============================================================================

/** Fake GitHub personal access token (ghp_ prefix, 40 chars). */
export const FAKE_GITHUB_PAT = 'ghp_TESTFAKExxxxxxxxxxxxxxxxxxxxxxxxxx0000';

/** Fake GitHub OAuth token (gho_ prefix, 40 chars). */
export const FAKE_GITHUB_OAUTH = 'gho_TESTFAKExxxxxxxxxxxxxxxxxxxxxxxxxx0000';

/** Fake Bearer/JWT token. */
export const FAKE_BEARER_TOKEN = 'Bearer eyTEST.FAKE.NOT-REAL-TOKEN-000000000';

// ============================================================================
// Credentials
// ============================================================================

/** Fake password for credential pattern tests. */
export const FAKE_PASSWORD = 'password=TESTFAKE_not_real_password_000';

/** Fake database connection string. */
export const FAKE_DB_URL = 'postgres://testuser:TESTFAKE_password@localhost:5432/testdb';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Wraps a secret pattern in context text for sanitizer tests.
 * Returns a string like "config key: <secret>" for testing redaction.
 */
export function wrapInContext(secret: string, label = 'key'): string {
  return `${label}: ${secret}`;
}
