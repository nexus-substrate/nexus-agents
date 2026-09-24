/**
 * The one credential-shape pattern set every redactor applies (#6753).
 *
 * `security/output-sanitizer`, `core/logger` and `learning/outcome-storage`
 * each kept their own list, and the lists drifted: a GitHub token was
 * `{20,}` in two and exactly `{36}` in the third, the logger alone knew
 * Azure and GCP shapes, and only the sanitizer knew npm, PyPI and GitLab
 * tokens. Each consumer now applies this set with its own placeholder.
 *
 * What belongs here: patterns whose match IS a credential wherever it
 * appears — vendor key prefixes, token prefixes, credential-named
 * assignments specific enough that no prose uses them, URL userinfo.
 *
 * What does not: context rules (`Bearer …`, `password=…`, `token: …`,
 * `?api_key=…`, JSON fields). Those differ per consumer in scope and in how
 * much of the match they keep, and each is a local extension in its module.
 *
 * Where the old lists disagreed, the wider quantifier won, so no consumer
 * redacts less than before. Quantifiers on unanchored classes are bounded
 * (#1496). This module imports nothing, so `core/logger` can depend on it.
 *
 * @module core/credential-patterns
 */

/** A credential shape, named for the format it recognises. */
interface CredentialPattern {
  readonly name: string;
  /** Global; the whole match is replaced by the consumer's placeholder. */
  readonly pattern: RegExp;
}

const CREDENTIAL_PATTERNS: readonly CredentialPattern[] = [
  // OpenAI `sk-…`, `sk-proj-…` and Anthropic `sk-ant-…` share this prefix.
  { name: 'sk-api-key', pattern: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'pk-public-key', pattern: /pk-[A-Za-z0-9_-]{20,}/g },
  // No word boundary: the logger and outcome store never had one.
  { name: 'aws-access-key-id', pattern: /AKIA[0-9A-Z]{16}/g },
  // Covers the sanitizer's `AIzaSy` + 24 and the logger's `AIza` + 35.
  { name: 'google-api-key', pattern: /AIza[0-9A-Za-z_-]{26,}/g },
  // ghp_ gho_ ghu_ ghs_ ghr_: `{20,}`, not the logger's exact `{36}` (#6753).
  { name: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'github-fine-grained-pat', pattern: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'gitlab-pat', pattern: /glpat-[A-Za-z0-9_-]{10,}/g },
  { name: 'npm-token', pattern: /npm_[A-Za-z0-9]{20,}/g },
  { name: 'pypi-token', pattern: /pypi-[A-Za-z0-9_-]{20,}/g },
  {
    name: 'aws-secret-access-key',
    pattern: /aws_secret_access_key["']?[ \t]*[:=][ \t]*["']?[^"'\s]{1,256}/gi,
  },
  {
    name: 'aws-session-token',
    pattern: /aws_session_token["']?[ \t]*[:=][ \t]*["']?[^"'\s]{1,256}/gi,
  },
  { name: 'azure-account-key', pattern: /AccountKey=[a-zA-Z0-9+/=]{1,256}/gi },
  { name: 'azure-sas', pattern: /SharedAccessSignature=[a-zA-Z0-9%]{1,256}/gi },
  {
    name: 'azure-connection-string',
    pattern: /DefaultEndpointsProtocol=https?;AccountName=[^;]{1,256};AccountKey=[^;]{1,256}/gi,
  },
  {
    name: 'gcp-private-key',
    pattern: /"private_key":\s*"-----BEGIN[^"]{1,5000}-----END[^"]{1,500}-----"/g,
  },
  { name: 'gcp-private-key-id', pattern: /"private_key_id":\s*"[a-f0-9]{1,256}"/gi },
];

/**
 * URL userinfo: `scheme://user:pass@` or `scheme://token@`. Group 1 is the
 * scheme, kept so the redacted URL still names its host. The user part
 * excludes `:` and both parts exclude `/?#@` and whitespace, so a port
 * (`host:8080/…`) or an `@` in a path or query is never taken for
 * credentials. Bounded quantifiers keep the match linear.
 */
const URL_USERINFO_PATTERN =
  /\b([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/?#@:]{0,256}(?::[^\s/?#@]{0,256})?@/gi;

/**
 * `text` with every shared credential shape replaced by `placeholder`, and
 * URL userinfo replaced by `placeholder` with the scheme and host kept.
 * `placeholder` is used as a `String.replace` replacement string.
 */
export function redactCredentialShapes(text: string, placeholder: string): string {
  let result = text;
  for (const { pattern } of CREDENTIAL_PATTERNS) {
    result = result.replace(pattern, placeholder);
  }
  return result.replace(URL_USERINFO_PATTERN, `$1${placeholder}@`);
}
