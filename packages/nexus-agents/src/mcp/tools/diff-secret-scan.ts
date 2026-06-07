/**
 * Pre-push secret scan for auto-remediation diffs (#3540 phase 3 / #3669).
 *
 * The #3618/#3648 consensus votes flagged THE gap the merge-time safeguards miss:
 * `gh pr create` PUBLISHES the branch, so a secret a remediation writes into the
 * diff is leaked the instant it's pushed — before never-auto-merge / CODEOWNERS /
 * the breaker ever fire, and irreversibly in git history. So the auto-remediation
 * implement adapters MUST scan the staged content BEFORE push and fail closed.
 *
 * This is an in-tree, dependency-free regex scanner (gitleaks/trufflehog can be
 * layered on top later). Fail-closed: any match → not clean → the adapter aborts
 * the push.
 *
 * @module mcp/tools/diff-secret-scan
 */

// @export-no-consumer-yet — see #3669
// The Option B / Option A implement adapters call scanForSecrets before push.

/** A known secret shape. */
interface SecretPattern {
  readonly name: string;
  readonly re: RegExp;
}

/** High-signal secret patterns (kept conservative to limit false positives). */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'openai-key', re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { name: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  // Generic `secret/token/password/api_key = "long-value"` assignments.
  {
    name: 'generic-credential-assignment',
    re: /(?:api[_-]?key|secret|token|password|passwd|credential)\s*[:=]\s*["'][A-Za-z0-9/+_-]{16,}["']/i,
  },
];

/** One secret finding (the matched pattern + a redacted locator). */
export interface SecretFinding {
  readonly pattern: string;
  /** 1-based line number within the scanned text. */
  readonly line: number;
}

/** Scan result. `clean` is true only when there are zero findings. */
export interface SecretScanResult {
  readonly clean: boolean;
  readonly findings: readonly SecretFinding[];
}

/**
 * Scan text (e.g. a unified diff or a file's contents) for secrets. Fail-closed:
 * the caller treats `clean === false` as "do not push". Findings report the
 * pattern name + line only — never the secret value.
 */
export function scanForSecrets(text: string): SecretScanResult {
  const findings: SecretFinding[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) findings.push({ pattern: name, line: i + 1 });
    }
  }
  return { clean: findings.length === 0, findings };
}

/** Human-readable, value-free summary of a scan result. */
export function describeSecretFindings(result: SecretScanResult): string {
  if (result.clean) return 'no secrets detected';
  return result.findings.map((f) => `${f.pattern}@L${String(f.line)}`).join(', ');
}
