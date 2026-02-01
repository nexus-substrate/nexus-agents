---
title: 'Security Architecture'
description: 'Security-first design with 7 defense layers:'
---

---

## Overview

Security-first design with 7 defense layers:

1. **Input Validation** - Zod schemas at all boundaries
2. **Secrets Vault** - Never expose API keys or tokens
3. **Rate Limiting** - Token bucket per tool
4. **Memory Bounds** - Context pruning, history caps
5. **Path Safety** - Normalized paths, directory jails
6. **Timeout Protection** - TimeoutGuard for async operations
7. **Byzantine Detection** - Weighted voting with pattern detection

---

## ⚠️ Critical: Authentication Disabled by Default

**The CLI server runs WITHOUT authentication by default.**

### Risk Assessment

| Environment           | Risk Level | Recommendation                    |
| --------------------- | ---------- | --------------------------------- |
| Local Development     | Low        | Acceptable for local-only access  |
| CI/CD Pipelines       | Medium     | Enable auth if exposed to network |
| Production Deployment | **HIGH**   | **MUST enable authentication**    |
| Shared Networks       | **HIGH**   | **MUST enable authentication**    |

### Enabling Authentication

Set the environment variable before starting the server:

```bash
export NEXUS_AUTH_ENABLED=true
nexus-agents --mode=server
```

Or in your configuration:

```yaml
# nexus-agents.yaml
server:
  auth:
    enabled: true
    # Configure your auth provider
```

### Startup Warning

When authentication is disabled, the server logs:

```
[WARN] Authentication is disabled. Set NEXUS_AUTH_ENABLED=true to enable.
```

**Do not ignore this warning in production environments.**

---

## Threat Model

| Threat             | Vector               | Mitigation                               | Status |
| ------------------ | -------------------- | ---------------------------------------- | ------ |
| Prompt Injection   | Malicious prompts    | Input/output tagging, structured output  | ✅     |
| SSRF               | Outbound HTTP calls  | URL allowlist, private IP blocking       | ✅     |
| Path Traversal     | Malicious file paths | Path normalization, directory jail       | ✅     |
| ReDoS              | Malicious regex      | Static patterns only, no user RegExp     | ✅     |
| MCP SDK ReDoS      | CVE-2026-0621        | TimeoutGuard, URI validation             | ✅     |
| Secrets Exposure   | Logs, errors         | Secrets vault, sanitization              | ✅     |
| Token Exhaustion   | Unbounded context    | Memory caps, pruning                     | ✅     |
| Injection          | Malformed prompts    | Input validation, Zod schemas            | ✅     |
| Byzantine Failures | Malicious agents     | Weighted voting with Byzantine detection | ✅     |

**Reference:** OWASP LLM Top 10 (LLM01: Prompt Injection)

---

## Sandbox Execution

All agent-executed code runs through the sandbox system.

### Execution Modes

| Mode        | Description                      | Security Level | Use Case                    |
| ----------- | -------------------------------- | -------------- | --------------------------- |
| `none`      | No sandboxing (development only) | None           | Local dev, debugging        |
| `policy`    | Command allowlist enforcement    | Medium         | Standard operation          |
| `container` | Full Docker isolation            | High           | Production, untrusted input |

### Docker Security (Container Mode)

```bash
docker run \
  --cap-drop=ALL \           # Drop all Linux capabilities
  --read-only \              # Read-only root filesystem
  --network=none \           # No network access
  --user=node \              # Non-root user
  --memory=512m \            # Memory limit
  --cpus=2 \                 # CPU limit
  --pids-limit=10 \          # Process limit
  --security-opt=no-new-privileges
```

### Command Classification

| Category              | Commands                                           | Action             |
| --------------------- | -------------------------------------------------- | ------------------ |
| **Allowed**           | pnpm, npm, git, gh, node, npx, tsc, eslint, vitest | Execute in sandbox |
| **Denied**            | rm, curl, wget, ssh, sudo, kill, chmod, dd, mkfs   | Block immediately  |
| **Requires Approval** | docker, kubectl, aws, gcloud                       | User confirmation  |

### Resource Limits

| Resource   | Limit     | Rationale                  |
| ---------- | --------- | -------------------------- |
| Memory     | 512 MB    | Prevent memory exhaustion  |
| CPU        | 2 cores   | Prevent CPU monopolization |
| Timeout    | 5 minutes | Prevent hung processes     |
| Processes  | 10 max    | Prevent fork bombs         |
| Disk write | Read-only | Prevent persistent changes |
| Network    | None      | Prevent data exfiltration  |

---

## Environment Sanitization

Variables blocked from execution context:

```typescript
const BLOCKED_PREFIXES = [
  'API_',
  'TOKEN_',
  'SECRET_',
  'KEY_',
  'PASSWORD_',
  'CREDENTIAL_',
  'AWS_',
  'AZURE_',
  'GCP_',
  'ANTHROPIC_',
  'OPENAI_',
  'GOOGLE_AI_',
];

function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => !BLOCKED_PREFIXES.some((prefix) => key.startsWith(prefix))
    )
  );
}
```

---

## Secrets Vault Pattern

```typescript
class SecretsVault {
  private readonly secrets: Map<string, string>;

  get(key: string): string | undefined {
    // Audit log access
    return this.secrets.get(key);
  }

  // Sanitize before any output
  sanitize(text: string): string {
    for (const secret of this.secrets.values()) {
      text = text.replaceAll(secret, '[REDACTED]');
    }
    return text;
  }
}
```

### Usage Rules

1. **Never log secrets** - Use sanitize() before any logging
2. **Never return secrets** - Sanitize all tool outputs
3. **Audit access** - Log when secrets are accessed
4. **Rotate regularly** - Support key rotation without restart

---

## Input Validation Pipeline

```typescript
const validateInput = (input: unknown): Result<ValidInput, ValidationError> => {
  // 1. Schema validation (Zod)
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error };

  // 2. Business rule validation
  if (parsed.data.value < 0) {
    return { ok: false, error: new ValidationError('Value must be positive') };
  }

  // 3. Security checks (path traversal, injection, etc.)
  const sanitized = sanitizeInput(parsed.data);

  return { ok: true, value: sanitized };
};
```

---

## Path Traversal Prevention

```typescript
function validatePath(userPath: string, allowedRoot: string): Result<string, SecurityError> {
  const resolved = path.resolve(allowedRoot, userPath);
  if (!resolved.startsWith(allowedRoot)) {
    return { ok: false, error: new SecurityError('Path traversal detected') };
  }
  return { ok: true, value: resolved };
}
```

### Directory Jail

All file operations are restricted to:

- Current working directory
- Explicitly allowed paths in config
- Temporary directories with cleanup

---

## ReDoS Prevention

```typescript
// NEVER do this - user-provided regex
const pattern = new RegExp(userInput); // DANGEROUS!

// ALWAYS do this - static patterns only
const VALID_PATTERN = /^[a-zA-Z0-9_-]+$/; // Static, safe pattern

// Validate against known-safe patterns
function validateIdentifier(input: string): boolean {
  return VALID_PATTERN.test(input);
}
```

### CVE-2026-0621 Mitigation

TimeoutGuard for all async operations:

```typescript
const result = await TimeoutGuard.execute(async () => await mcpTool.execute(args), {
  timeout: 30000,
  name: 'mcp-tool-call',
});
```

---

## Rate Limiting

Token bucket per tool:

```typescript
const rateLimiter = new TokenBucket({
  capacity: 100, // Max burst
  refillRate: 10, // Tokens per second
});

async function executeWithRateLimit<T>(fn: () => Promise<T>, cost: number = 1): Promise<T> {
  if (!rateLimiter.consume(cost)) {
    throw new RateLimitError('Rate limit exceeded');
  }
  return fn();
}
```

### Per-Tool Limits

| Tool Category    | Requests/min | Rationale                |
| ---------------- | ------------ | ------------------------ |
| Read operations  | 120          | Low risk, high frequency |
| Write operations | 60           | Higher risk, audit trail |
| Execute commands | 30           | Highest risk, full audit |
| External API     | 60           | Provider limits          |

---

## Sanitization Pipeline

All output passes through sanitization:

```typescript
// Standard sanitization
const sanitized = logger.sanitize(text);
// API keys, tokens, passwords -> [REDACTED]

// Patterns matched
const REDACT_PATTERNS = [
  /sk-[a-zA-Z0-9]{48}/g, // Anthropic API keys
  /sk-[a-zA-Z0-9-_]{43}/g, // OpenAI API keys
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub tokens
  /password["']?\s*[:=]\s*["']?[^"'\s]+/gi, // Password values
];
```

---

## Security Audit Logging

```typescript
interface SecurityAuditLog {
  timestamp: string; // ISO 8601 ET
  action: string; // What was attempted
  actor: string; // Agent or user ID
  resource: string; // What was accessed
  result: 'allowed' | 'denied' | 'error';
  reason?: string; // Why denied/error
  metadata?: Record<string, unknown>;
}
```

### Logged Events

- Secret access attempts
- Path traversal attempts
- Rate limit violations
- Sandbox escapes attempts
- Byzantine pattern detection
- Command execution

---

## Configuration

```yaml
security:
  sandbox:
    mode: policy # none | policy | container
    fallbackMode: none # Fallback if container unavailable
    resourceLimits:
      memory: 512m
      cpu: 2
      timeout: 300s
      maxProcesses: 10

  allowedPaths: [./] # Directory jail

  rateLimit:
    enabled: true
    requestsPerMinute: 60

  audit:
    enabled: true
    destination: file # file | stdout | service
    path: ./logs/audit.log
```

---

## Security Checklist

Before any code change:

- [ ] No secrets in code, logs, or outputs
- [ ] Input validation at all boundaries
- [ ] Path traversal prevention on file ops
- [ ] No user-provided RegExp (use static patterns)
- [ ] Rate limiting on public interfaces
- [ ] Memory bounds on collections
- [ ] Timeout on external calls
- [ ] Sanitization on all outputs

---

## Agent-SafetyBench Evaluation

Comprehensive safety category taxonomy for agent evaluation (arXiv:2412.14470).

### Safety Categories

| Category             | Risk Level | Description                        |
| -------------------- | ---------- | ---------------------------------- |
| `harm_physical`      | Critical   | Actions causing physical harm      |
| `harm_emotional`     | High       | Psychological or emotional harm    |
| `harm_financial`     | High       | Financial loss or fraud            |
| `deception`          | High       | Misleading or false information    |
| `bias`               | Medium     | Discriminatory outputs             |
| `privacy`            | High       | Privacy violations, data exposure  |
| `manipulation`       | High       | Social engineering, coercion       |
| `instruction_safety` | Critical   | Jailbreak, prompt injection        |
| `robustness`         | Medium     | Adversarial input resilience       |
| `risk_awareness`     | Medium     | Appropriate caution and escalation |

### Expected Outcomes

| Outcome    | Description                        |
| ---------- | ---------------------------------- |
| `refuse`   | Decline harmful request            |
| `caution`  | Proceed with warnings              |
| `clarify`  | Request more information           |
| `escalate` | Elevate to human review            |
| `proceed`  | Safe to execute                    |
| `detect`   | Identify and report attack attempt |

### Usage

```typescript
import { SAFETY_CATEGORIES, getSafetyTaxonomySummary } from 'nexus-agents';

// Get all categories
for (const category of SAFETY_CATEGORIES) {
  console.log(`${category.id}: ${category.defaultRiskLevel}`);
}

// Get summary statistics
const summary = getSafetyTaxonomySummary();
// { totalCategories: 10, totalCriteria: 42, ... }
```

---

## Source Files

| File                                             | Purpose                   |
| ------------------------------------------------ | ------------------------- |
| `src/security/sandbox-manager.ts`                | Sandbox orchestration     |
| `src/security/docker-sandbox.ts`                 | Container isolation       |
| `src/security/secrets-vault.ts`                  | Secrets management        |
| `src/security/rate-limiter.ts`                   | Rate limiting             |
| `src/security/path-validator.ts`                 | Path traversal prevention |
| `src/security/input-sanitizer.ts`                | Input validation          |
| `src/security/audit-logger.ts`                   | Security logging          |
| `src/security/safety-bench/`                     | SafetyBench evaluation    |
| `src/security/safety-bench/safety-categories.ts` | Category taxonomy         |
| `src/security/safety-bench/safety-enums.ts`      | Risk levels, outcomes     |
| `src/security/safety-bench/safety-schemas.ts`    | Validation schemas        |

---

## Penetration Testing

113 security tests covering:

- Container escape prevention
- Capability restrictions
- Network isolation
- Filesystem isolation
- Privilege escalation prevention
- Command injection prevention
- Environment variable sanitization
- CVE regression tests

Run with:

```bash
pnpm test src/security/sandbox-pentest.test.ts
```

---

## Related Documents

- **Consensus Protocols:** [CONSENSUS_PROTOCOLS.md](/nexus-agents/architecture/consensus-protocols/) (Byzantine detection)
- **Routing System:** [ROUTING_SYSTEM.md](/nexus-agents/architecture/routing-system/) (Budget limits)
- **Full Architecture:** [ARCHITECTURE.md](https://github.com/williamzujkowski/nexus-agents/blob/main/ARCHITECTURE.md)
- **Coding Standards:** [CODING_STANDARDS.md](https://github.com/williamzujkowski/nexus-agents/blob/main/CODING_STANDARDS.md)
