/**
 * Differential corpus for the credential redactors (#6753).
 *
 * Kept independent of `core/credential-patterns.ts` on purpose: a sample
 * here is NOT derived from the pattern list, so dropping a pattern from the
 * list makes every consumer's corpus test fail instead of silently dropping
 * the sample with it.
 *
 * Every value is obviously fake (`TESTFAKE`, `xxxx`, `0000`) per
 * `.rules/test-secrets.md`.
 */

/** A string holding a credential, and the substring that must not survive. */
export interface CredentialSample {
  readonly id: string;
  readonly text: string;
  readonly secret: string;
}

/**
 * Self-identifying credential shapes. Every redactor that applies the shared
 * pattern set must remove `secret` from every one of these.
 */
export const SHARED_SHAPE_SAMPLES: readonly CredentialSample[] = [
  {
    id: 'openai-sk',
    text: 'key sk-TESTFAKE000000000000000000 end',
    secret: 'sk-TESTFAKE000000000000000000',
  },
  {
    id: 'anthropic-sk-ant',
    text: 'key sk-ant-api03-TESTFAKE_xxxxxxxxxxxxxxxx0000 end',
    secret: 'sk-ant-api03-TESTFAKE_xxxxxxxxxxxxxxxx0000',
  },
  {
    id: 'openai-sk-proj',
    text: 'key sk-proj-TESTFAKE-xxxxxxxxxxxxxxxx0000 end',
    secret: 'sk-proj-TESTFAKE-xxxxxxxxxxxxxxxx0000',
  },
  {
    id: 'public-pk',
    text: 'key pk-TESTFAKE000000000000000000 end',
    secret: 'pk-TESTFAKE000000000000000000',
  },
  { id: 'aws-akia', text: 'id AKIATESTFAKENOTREAL0 end', secret: 'AKIATESTFAKENOTREAL0' },
  { id: 'aws-akia-embedded', text: 'id=XAKIATESTFAKENOTREAL0 end', secret: 'AKIATESTFAKENOTREAL0' },
  {
    id: 'google-aiza-39',
    text: 'key AIzaSyTEST-FAKE-KEY-NOT-REAL-0000000000 end',
    secret: 'AIzaSyTEST-FAKE-KEY-NOT-REAL-0000000000',
  },
  {
    id: 'google-aiza-30',
    text: 'key AIzaSyTESTFAKExxxxxxxxxxxxxxxx end',
    secret: 'AIzaSyTESTFAKExxxxxxxxxxxxxxxx',
  },
  {
    id: 'github-ghp-36',
    text: 'tok ghp_TESTFAKExxxxxxxxxxxxxxxxxxxxxxxx0000 end',
    secret: 'ghp_TESTFAKExxxxxxxxxxxxxxxxxxxxxxxx0000',
  },
  {
    id: 'github-ghp-24',
    text: 'tok ghp_TESTFAKExxxxxxxxxxxx0000 end',
    secret: 'ghp_TESTFAKExxxxxxxxxxxx0000',
  },
  {
    id: 'github-gho',
    text: 'tok gho_TESTFAKExxxxxxxxxxxx0000 end',
    secret: 'gho_TESTFAKExxxxxxxxxxxx0000',
  },
  {
    id: 'github-ghu',
    text: 'tok ghu_TESTFAKExxxxxxxxxxxx0000 end',
    secret: 'ghu_TESTFAKExxxxxxxxxxxx0000',
  },
  {
    id: 'github-ghs',
    text: 'tok ghs_TESTFAKExxxxxxxxxxxx0000 end',
    secret: 'ghs_TESTFAKExxxxxxxxxxxx0000',
  },
  {
    id: 'github-ghr-36',
    text: 'tok ghr_TESTFAKExxxxxxxxxxxxxxxxxxxxxxxx0000 end',
    secret: 'ghr_TESTFAKExxxxxxxxxxxxxxxxxxxxxxxx0000',
  },
  {
    id: 'github-fine-grained-20',
    text: 'tok github_pat_TESTFAKE_xxxxxxx0000 end',
    secret: 'github_pat_TESTFAKE_xxxxxxx0000',
  },
  {
    id: 'github-fine-grained-long',
    text: 'tok github_pat_TESTFAKE0000_xxxxxxxxxxxxxxxxxxxxxxxxNOTREAL0000 end',
    secret: 'github_pat_TESTFAKE0000_xxxxxxxxxxxxxxxxxxxxxxxxNOTREAL0000',
  },
  { id: 'gitlab-glpat', text: 'tok glpat-TESTFAKExxxx end', secret: 'glpat-TESTFAKExxxx' },
  {
    id: 'npm-token',
    text: 'tok npm_TESTFAKExxxxxxxxxxxx0000 end',
    secret: 'npm_TESTFAKExxxxxxxxxxxx0000',
  },
  {
    id: 'pypi-token',
    text: 'tok pypi-TESTFAKExxxxxxxxxxxx0000 end',
    secret: 'pypi-TESTFAKExxxxxxxxxxxx0000',
  },
  {
    id: 'azure-account-key',
    text: 'conn AccountKey=TESTFAKExxxxxxxx0000== end',
    secret: 'TESTFAKExxxxxxxx0000==',
  },
  {
    id: 'azure-sas',
    text: 'conn SharedAccessSignature=TESTFAKE%2Bxxxx0000 end',
    secret: 'TESTFAKE%2Bxxxx0000',
  },
  {
    id: 'azure-connection-string',
    text: 'DefaultEndpointsProtocol=https;AccountName=testfakeacct;AccountKey=TESTFAKEkey0000==;EndpointSuffix=core',
    secret: 'TESTFAKEkey0000==',
  },
  {
    id: 'gcp-private-key',
    text: '{"private_key": "-----BEGIN PRIVATE KEY-----TESTFAKExxxx0000-----END PRIVATE KEY-----"}',
    secret: 'TESTFAKExxxx0000',
  },
  {
    id: 'gcp-private-key-id',
    text: '{"private_key_id": "0000000000aaaa0000"}',
    secret: '0000000000aaaa0000',
  },
  {
    id: 'aws-secret-access-key',
    text: 'aws_secret_access_key=TESTFAKE+NotReal/0000 end',
    secret: 'TESTFAKE+NotReal/0000',
  },
  {
    id: 'aws-session-token',
    text: 'aws_session_token: TESTFAKEsession0000 end',
    secret: 'TESTFAKEsession0000',
  },
  {
    id: 'url-userinfo-password',
    text: 'dsn postgres://testuser:TESTFAKE_password@localhost:5432/testdb',
    secret: 'TESTFAKE_password',
  },
  {
    id: 'url-userinfo-token',
    text: 'remote https://TESTFAKEtoken0000@github.com/o/r.git',
    secret: 'TESTFAKEtoken0000',
  },
];

/**
 * Strings that look credential-adjacent but carry no credential; every
 * redactor must return them unchanged. Not listed: "The bearer of bad news",
 * which `sanitizeErrorDetails` and the outcome store's local `bearer\s+\S+`
 * rule already redacted before #6753 and still do.
 */
export const NEAR_MISS_SAMPLES: readonly string[] = [
  'sk-short0000',
  'pk-short0000',
  'ghp_short0000',
  'github_pat_short',
  'glpat-short',
  'npm_config_registry=https://registry.npmjs.org',
  'pypi-short0000',
  'AKIATESTFAKE0000',
  'AIzaShortTESTFAKE',
  'https://localhost:8080/path?x=1',
  'https://example.com/users/@handle',
  'mail dev@example.com about it',
  'max tokens: 4096',
  'the secret sauce is caching',
  'AccountName=testfakeacct',
];
