---
title: Security Architecture
description: Security pipeline, threat model, sandboxing, trust classification, and input hardening
tier: 2
keywords: [security, trust, sanitize, policy, injection, byzantine, reputation]
related_files:
  - docs/architecture/UNTRUSTED_INPUT_HARDENING.md
  - CLAUDE.md
---

# Security Architecture

**Tier 2** | Deep technical documentation for security implementation
**Hub:** [README.md](./README.md) | **Full Architecture:** [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## Overview

Security-first design with 7 defense layers:

1. **Input Validation** - Zod schemas at all boundaries
2. **Secrets Vault** - Never expose API keys or tokens
3. **Rate Limiting** - Token bucket per tool
4. **Memory Bounds** - Context pruning, history caps
5. **Path Safety** - Normalized paths, directory jails
6. **Timeout Protection** - TimeoutGuard for async operations
7. **Byzantine Detection** - `WeightedVoting` pattern detection (exported, not on the `consensus_vote` path — see Threat Model)

---

## Authentication & Access Control

The MCP server ships one transport, `StdioServerTransport` (`src/cli-server.ts`, `src/mcp/server.ts`). It communicates with the parent process only — no network listener, so no other process can reach it. Process isolation is the access control; no authentication runs on this path.

There is no REST API mode. Earlier versions of this section described an `api.enabled: true` config key and an auto-generated `~/.nexus-agents/auth/rest-api-key`; neither is implemented. `AppConfigSchema` (`src/config/schemas.ts`) has no `api` key, no source file references `rest-api-key`, and nothing under `src/` opens an HTTP listener. An `api:` block in `nexus-agents.yaml` is not read by any code.

| Environment       | Auth enforced? | Notes                                                                                   |
| ----------------- | -------------- | --------------------------------------------------------------------------------------- |
| Local MCP (stdio) | No             | Only the parent process can reach the server                                            |
| Network-exposed   | Not supported  | No HTTP transport ships; a token can be generated (below) but no code path validates it |

### Token-Based Authentication (Issue #739)

The `AuthHandler` middleware (`src/mcp/middleware/auth-handler.ts`) and its token CLI are implemented; enforcement is not. No server code path calls `AuthHandler.authenticate()`, and no HTTP endpoint exists to present a token to (see MCP Middleware Security below).

**Token management CLI commands:**

```bash
nexus-agents auth init          # Generate new auth token
nexus-agents auth show          # Show token status (file path, permissions)
nexus-agents auth rotate        # Rotate token (invalidate old, generate new)
nexus-agents auth init --force  # Regenerate token (overwrite existing)
```

**Security properties:**

- Tokens are 64-character hex strings (32 bytes of `crypto.randomBytes`)
- Stored at `~/.nexus-agents/auth/server-token` with `0600` permissions (owner read/write only)
- Directory created with `0700` permissions
- Timing-safe comparison (`crypto.timingSafeEqual`) prevents timing attacks
- Token shown only once on generation (not recoverable — rotate if lost)

**Enabling authentication:**

```yaml
# nexus-agents.yaml
security:
  auth:
    enabled: true
    method: token # 'token' is the only implemented method; 'oauth2' is accepted but behaves as 'token' and warns (#5678, narrowed at the next major: #5681)
    tokenHeader: Authorization # Header name for Bearer token
    tokenFile: ~/.nexus-agents/auth/server-token # Token storage path
```

Or via environment variables:

```bash
export NEXUS_AUTH_ENABLED=true
nexus-agents --mode=server
```

**Client usage:** none today. Setting `NEXUS_AUTH_ENABLED=true` generates and logs the token file path at startup, but there is no listener that accepts an `Authorization` header, so no client can use the token.

---

## Threat Model

| Threat             | Vector               | Mitigation                               | Status       |
| ------------------ | -------------------- | ---------------------------------------- | ------------ |
| Prompt Injection   | Malicious prompts    | Input/output tagging, structured output  | ✅           |
| SSRF               | Outbound HTTP calls  | URL allowlist, private IP blocking       | ✅           |
| Path Traversal     | Malicious file paths | Path normalization, directory jail       | ✅           |
| ReDoS              | Malicious regex      | Static patterns only, no user RegExp     | ✅           |
| MCP SDK ReDoS      | CVE-2026-0621        | TimeoutGuard, URI validation             | ✅           |
| Secrets Exposure   | Logs, errors         | Secrets vault, sanitization              | ✅           |
| Token Exhaustion   | Unbounded context    | Memory caps, pruning                     | ✅           |
| Injection          | Malformed prompts    | Input validation, Zod schemas            | ✅           |
| Byzantine Failures | Malicious agents     | Weighted voting with Byzantine detection | ⚠️ not wired |

**Byzantine Failures is not on the live vote path.** `WeightedVoting` (`src/consensus/weighted-voting.ts`) is exported from `consensus/index.ts` along with its factory `createWeightedVoting`, but neither has a non-test caller, and `ConsensusEngine` (`src/consensus/engine.ts`) — what `consensus_vote` runs — does not reference it. The class implements two of the four documented patterns (contrarian, collusion) and returns `false` without evaluating when fewer than 3 votes are present. See [CONSENSUS_PROTOCOLS.md](./CONSENSUS_PROTOCOLS.md#byzantine-detection-patterns).

**Reference:** OWASP LLM Top 10 (LLM01: Prompt Injection)

---

## MCP Middleware Security

Locally registered MCP tools are wrapped in a middleware pipeline by `createSecureHandler` (`src/mcp/middleware/secure-handler.ts`). Coverage is **per-tool opt-in**, not a transport chokepoint: each tool's registration calls `createSecureHandler` itself, and a registration that does not is not covered. Upstream MCP proxy tools — registered by `initUpstreamServers` (`src/cli-server-tools.ts`) with a raw passthrough handler when the gateway lists upstream servers — receive none of the layers below; the server logs this at startup as `upstreamProxiesUncovered: true`. The `registerTool()` interception proxies (`mcp/gateway/gateway-server-proxy.ts`, `mcp/tools/annotation-proxy.ts`, `mcp/tools/tool-observability-proxy.ts`) add annotations, gateway dispatch and metrics; they do not add security layers.

| Layer               | Protection                                                                              | Default                                            |
| ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Input Validation    | Argument size cap (`MAX_INPUT_SIZE_BYTES`), conversation-tag stripping, Zod per handler | On for covered tools                               |
| Policy Firewall     | Allowlist/denylist rules per tool; evaluated and logged, denials not applied            | Always `warn` — configured `enforce` is overridden |
| Rate Limiting       | Token bucket per tool (configurable requests/min)                                       | On (60/min)                                        |
| Output Sanitization | Secret pattern redaction (keys, tokens, passwords)                                      | On for covered tools                               |
| Audit Logging       | SIEM-compatible JSON-L events for tool invocations                                      | **Off** until `security.audit.enabled: true`       |
| Authentication      | Bearer-token `AuthHandler` with timing-safe compare                                     | **Not enforced** — no `authenticate()` call site   |

Three rows need qualification:

- **Policy Firewall.** `defaultConfig.security.policy.policyMode` is `enforce`, but `stagePolicyFirewallForRollout` (`src/mcp/middleware/policy-registry.ts`), called from `cli-server-tools.ts` at startup, unconditionally sets the firewall to `warn`: every rule is evaluated and every would-be denial is logged, none is applied. The startup record names the config value `configuredPolicyMode` (`cli-server-audit.ts`) because it is not the effective mode. There is no operator switch to `enforce` today (#4888).

- **Authentication.** `AuthHandler` is constructed at startup (`cli-server-auth.ts`) and can generate a token, but no server code path calls `AuthHandler.authenticate()` (`grep -rn "\.authenticate(" src --exclude=*.test.ts` returns nothing). On the stdio transport, process isolation is the access control (see Authentication & Access Control above); the token is never checked.
- **Audit logging** is opt-in. `initializeAuditLogger` (`cli-server-audit.ts`) returns `null` unless `security.audit.enabled === true`, and `defaultConfig.security` (`config/schemas.ts`) has no `audit` key, so a default install writes no audit log. Startup reports the absence (#4996).

CORS, security headers and request body-size limits are not implemented: the only transport is `StdioServerTransport`, and `src/mcp/middleware/` contains no HTTP middleware. Earlier versions of this table listed them.

### Configuration

Values marked `default` are what ships; the `audit` block is absent by default and must be added to enable audit logging.

```yaml
security:
  policy:
    policyMode: enforce # default, but overridden to warn at startup (see above); enforce | warn
    defaultMode: read-only # default; read-only | read-write

  rateLimit:
    enabled: true # default
    requestsPerMinute: 60 # default

  audit: # not present by default — add this block to turn audit logging on
    enabled: true
    logDir: .nexus-agents/audit # per-repo (epic #2872); cross-repo override: ~/.nexus-agents/audit
    minSeverity: info # info | warning | critical
    enableHashChain: false # Tamper-evident log chain
    maxFileSizeBytes: 10485760
    maxFiles: 10
```

---

## Sandbox Execution

All agent-executed code runs through the sandbox system.

### Execution Modes

| Mode                 | Description                                                            | Security Level | Use Case             |
| -------------------- | ---------------------------------------------------------------------- | -------------- | -------------------- |
| `none`               | No sandboxing (development only)                                       | None           | Local dev, debugging |
| `policy`             | Command allowlist enforcement (`PolicySandboxExecutor`)                | Medium         | Standard operation   |
| `container` / `deno` | Accepted for config back-compat; resolves to `policy` mode after #2551 | (see below)    | (see below)          |

### Real isolation: out-of-process via OpenCode sandbox bootstrap (#2500)

Nexus-agents is **sandbox-compatible, not a sandbox-builder**. The in-process Docker / Deno executors were deleted in [#2551](https://github.com/nexus-substrate/nexus-agents/issues/2551) — they were dead code masquerading as security boundary. For real isolation, set the `NEXUS_SANDBOX` environment variable and run nexus-agents inside an OpenCode-managed Docker sandbox; see [docs/guides/SANDBOXED-USAGE.md](../guides/SANDBOXED-USAGE.md).

The `container` and `deno` modes are kept in the `SandboxMode` config union so existing config files don't fail validation, but the factory resolves both to `policy` mode at runtime with a warning. New deployments wanting container-level isolation should use the OpenCode bootstrap.

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

Audit events are written as SIEM-compatible JSON-L to `<repo>/.nexus-agents/audit/` by default — `audit/` is per-repo state (epic #2872). Configurable via the `audit.logDir` config field or `NEXUS_DATA_DIR`.

### Event Types

| Event                     | Severity | Trigger                           |
| ------------------------- | -------- | --------------------------------- |
| `tool_invocation`         | info     | Every tool call (success/failure) |
| `policy_decision`         | warning  | Policy firewall deny              |
| `rate_limit_violation`    | warning  | Rate limit exceeded               |
| `system_startup/shutdown` | info     | Server lifecycle events           |

### Enabling Audit Logging

```yaml
security:
  audit:
    enabled: true
    minSeverity: info
    enableHashChain: true # Optional tamper-evident chain
```

Each event includes: timestamp, actor, tool name, request ID, duration, and outcome. With `enableHashChain: true`, events include a SHA-256 hash chain for tamper detection.

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

  policy:
    policyMode: enforce # enforce | warn
    defaultMode: read-only # read-only | read-write

  rateLimit:
    enabled: true
    requestsPerMinute: 60

  audit:
    enabled: false # Set to true for structured audit logging
    logDir: .nexus-agents/audit # per-repo (epic #2872); cross-repo override: ~/.nexus-agents/audit
    minSeverity: info # info | warning | critical
    enableHashChain: false # Tamper-evident hash chain
    maxFileSizeBytes: 10485760 # 10 MB per log file
    maxFiles: 10 # Log rotation file count
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

| File                                             | Purpose                       |
| ------------------------------------------------ | ----------------------------- |
| `src/mcp/middleware/auth-handler.ts`             | Token-based authentication    |
| `src/mcp/middleware/secure-handler.ts`           | Tool-level security wrapper   |
| `src/mcp/middleware/request-context.ts`          | Request tracking and auth     |
| `src/mcp/middleware/rate-limiter.ts`             | Rate limiting                 |
| `src/security/sandbox/sandbox-manager.ts`        | Sandbox orchestration         |
| `src/security/sandbox/sandbox-executor.ts`       | Policy-based execution        |
| `src/security/input-sanitizer.ts`                | Input validation              |
| `src/security/output-sanitizer.ts`               | Output sanitization / secrets |
| `src/security/trust-classifier.ts`               | Trust tier classification     |
| `src/security/policy-gate.ts`                    | Policy enforcement            |
| `src/security/corroboration-validator.ts`        | Action corroboration checks   |
| `src/security/reputation-model.ts`               | Agent reputation scoring      |
| `src/security/audit-trail.ts`                    | Security logging              |
| `src/security/firewall/`                         | Firewall pipeline             |
| `src/security/safety-bench/`                     | SafetyBench evaluation        |
| `src/security/safety-bench/safety-categories.ts` | Category taxonomy             |
| `src/security/safety-bench/safety-enums.ts`      | Risk levels, outcomes         |
| `src/security/safety-bench/safety-schemas.ts`    | Validation schemas            |

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

- **Consensus Protocols:** [CONSENSUS_PROTOCOLS.md](./CONSENSUS_PROTOCOLS.md) (Byzantine detection)
- **Routing System:** [ROUTING_SYSTEM.md](./ROUTING_SYSTEM.md) (Budget limits)
- **Full Architecture:** [ARCHITECTURE.md](../../ARCHITECTURE.md)
- **Coding Standards:** [CODING_STANDARDS.md](../../CODING_STANDARDS.md)
