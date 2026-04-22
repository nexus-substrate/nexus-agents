# Test Secrets Policy

<!-- CANONICAL SOURCE: Issue #1410 -->

Auto-loaded when writing tests that involve secrets, API keys, tokens, or credentials.

## Non-Negotiable Rule

**NEVER use realistic-looking secrets in test fixtures.** GitHub secret scanning runs on git history and cannot be configured with allowlists. A committed secret — even a fake one — triggers alerts, wastes time on rotation verification, and erodes trust in real alerts.

## Required Pattern

All test secrets MUST be **obviously fake** by containing one or more of:

- `TEST`, `FAKE`, `EXAMPLE`, `NOT_REAL`, `NOTREAL`
- Repeated placeholder chars: `xxxx`, `0000`
- The word `test` or `example` in the value itself

## Canonical Constants

Import from `src/testing/test-secrets.ts` instead of inventing new fake secrets:

```typescript
import { FAKE_OPENAI_KEY, FAKE_GOOGLE_KEY, FAKE_GITHUB_PAT } from '../../testing/test-secrets.js';
```

Available constants:
| Constant | Pattern | Example |
|---|---|---|
| `FAKE_OPENAI_KEY` | `sk-TESTFAKE...` | OpenAI API key tests |
| `FAKE_ANTHROPIC_KEY` | `sk-ant-TESTFAKE...` | Anthropic key tests |
| `FAKE_GOOGLE_KEY` | `AIzaSyTEST-FAKE...` | Google/Gemini key tests |
| `FAKE_AWS_KEY_ID` | `AKIATESTFAKE...` | AWS key pattern tests |
| `FAKE_GITHUB_PAT` | `ghp_TESTFAKE...` | GitHub PAT tests |
| `FAKE_GITHUB_OAUTH` | `gho_TESTFAKE...` | GitHub OAuth tests |
| `FAKE_BEARER_TOKEN` | `Bearer eyTEST...` | JWT/Bearer tests |
| `FAKE_PASSWORD` | `password=TESTFAKE...` | Credential pattern tests |

## Bad vs Good Examples

```typescript
// BAD — looks real, triggers secret scanning
const key = 'AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q';
const token = 'ghp_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r';
const sk = 'sk-proj-abc123def456ghi789jkl012mno345pqr678';

// GOOD — obviously fake, import from canonical module
import { FAKE_GOOGLE_KEY, FAKE_GITHUB_PAT } from '../../testing/test-secrets.js';
const key = FAKE_GOOGLE_KEY; // 'AIzaSyTEST-FAKE-KEY-NOT-REAL-0000000000'
const token = FAKE_GITHUB_PAT; // 'ghp_TESTFAKExxxxxxxxxxxxxxxxxxxxxxxxxx0000'

// GOOD — inline is OK if obviously fake
const sk = 'sk-TESTFAKE_not_a_real_key_00000000000000000';
```

## When to Apply

- Writing any test that validates secret detection, sanitization, or redaction
- Adding example config or documentation with placeholder credentials
- Creating mock API responses that include token fields

## Gitleaks vs GitHub Secret Scanning

- **Gitleaks** (pre-commit): Configurable via `.gitleaks.toml`. Currently allowlists `*.test.ts` paths.
- **GitHub Secret Scanning** (server-side): Scans ALL committed blobs including history. NO allowlist config. This is why values must be obviously fake — path-based exclusions don't help.
