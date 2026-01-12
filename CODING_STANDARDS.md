# Nexus Agents - Coding Standards

**Version:** 2.1.0
**Last Updated:** 2026-01-11 (ET)
**Status:** Active

---

## Table of Contents

1. [Time & Verification Authority](#1-time--verification-authority)
2. [Source Hygiene](#2-source-hygiene)
3. [Code Structure Limits](#3-code-structure-limits)
4. [TypeScript Standards](#4-typescript-standards)
5. [MCP Server Standards](#5-mcp-server-standards)
6. [Agent & Skill Standards](#6-agent--skill-standards)
7. [Security Standards](#7-security-standards)
8. [Testing Standards](#8-testing-standards)
9. [Dependency Management](#9-dependency-management)
10. [Quality Gates](#10-quality-gates)
11. [Execution Protocol](#11-execution-protocol)

---

## Quick Start by Role

| I am a...              | Start here                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| First-time contributor | [Section 10 (Quality Gates)](#10-quality-gates) → [Section 3 (Limits)](#3-code-structure-limits) |
| CI failure debugger    | [Section 10.1 (Pre-Commit)](#101-pre-commit-must-pass)                                           |
| AI agent (Claude Code) | Full document - all sections mandatory                                                           |
| Security reviewer      | [Section 7 (Security)](#7-security-standards) → [Section 5.3](#53-security-requirements)         |
| MCP tool developer     | [Section 5 (MCP)](#5-mcp-server-standards) → [Section 4 (TypeScript)](#4-typescript-standards)   |
| Agent developer        | [Section 6 (Agent Standards)](#6-agent--skill-standards)                                         |

### Quick Commands

```bash
# Run all quality gates (must pass before commit)
pnpm lint && pnpm typecheck && pnpm test

# Fix common issues
pnpm lint:fix              # Auto-fix lint errors

# Check what needs fixing
pnpm lint --format compact | head -20
```

---

## 1. Time & Verification Authority

### 1.1 Timezone Standard

All timestamps, calculations, and date-bound logic use **America/New_York (ET)**.

```typescript
// Always get current time in ET
const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
```

**Rules:**

- Verify current datetime before any time-sensitive operation
- Record timezone explicitly in logs and outputs
- If time cannot be determined reliably: prefix with `Verify:` and do not guess

### 1.2 Version Currency

Before using any dependency, tool, or API:

1. Check the **current stable version** (not latest/beta/rc)
2. Verify it is **not deprecated**
3. Document the version check with date

```typescript
// Example: Version verification comment
// Verified 2026-01-03: @modelcontextprotocol/sdk@1.25.1 is current stable
// Deprecation check: No deprecation notices in changelog
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
```

---

## 2. Source Hygiene

### 2.1 Primary Sources (Authoritative)

When making "must/required/best practice" claims, cite primary sources in order:

1. **Official Documentation** - Language, runtime, framework docs
2. **Specifications** - MCP Protocol Spec, JSON-RPC 2.0, OAuth 2.1
3. **RFCs** - IETF standards (HTTP, TLS, OAuth)
4. **Security Standards** - OWASP ASVS, Top 10, CWE
5. **Platform Docs** - GitHub, npm, cloud providers

### 2.2 Citation Format

```typescript
// (Source: MCP Spec 2025-11-25, Section 5.2)
// (Source: TypeScript 5.8 Handbook, Strict Mode)
// (Verify: Not confirmed in official docs)
```

### 2.3 Prohibited Sources

Do NOT cite as justification:

- Blog posts, Medium articles
- Vendor marketing pages
- Stack Overflow answers (use for hints only)
- Outdated documentation (>1 year without verification)

---

## 3. Code Structure Limits

### 3.1 Hard Limits (Enforced by ESLint)

| Metric                  | Limit       | Rationale                          |
| ----------------------- | ----------- | ---------------------------------- |
| File length             | ≤ 400 lines | Maintainability, review efficiency |
| Function length         | ≤ 50 lines  | Single responsibility, testability |
| Cyclomatic complexity   | ≤ 10        | Understandability                  |
| Parameters per function | ≤ 5         | Use options object for more        |
| Nesting depth           | ≤ 4 levels  | Early returns, guard clauses       |

### 3.2 Splitting Rules

When approaching limits:

1. Extract helper functions by responsibility
2. Split files by domain/feature
3. Create new modules at clear boundaries
4. Never split mid-function or mid-class

### 3.3 Interfaces Before Implementations

**Hard Rule:** Define interfaces before writing implementations.

```typescript
// 1. Define interface first
interface IModelAdapter {
  complete(request: CompletionRequest): Promise<Result<Response, Error>>;
}

// 2. Then implement
class ClaudeAdapter implements IModelAdapter {
  async complete(request: CompletionRequest): Promise<Result<Response, Error>> {
    // implementation
  }
}
```

**Boundary Checklist (Required for multi-module changes):**

1. Module responsibilities defined
2. Interface contracts specified
3. Dependency direction documented
4. Test plan at boundaries
5. Migration/compatibility notes

---

## 4. TypeScript Standards

### 4.1 Required Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

### 4.2 Type Safety Rules

```typescript
// Use unknown over any
function parse(input: unknown): Result<Data, ParseError> {}

// Use Result<T, E> for fallible operations
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// Zod for runtime validation at boundaries
const InputSchema = z.object({
  task: z.string().min(1),
  context: z.record(z.unknown()).optional(),
});

// Discriminated unions over optional fields
type Message =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; name: string; input: unknown };
```

### 4.3 Naming Conventions

| Type       | Convention            | Example                          |
| ---------- | --------------------- | -------------------------------- |
| Interfaces | `I` prefix            | `IModelAdapter`                  |
| Types      | PascalCase            | `CompletionRequest`              |
| Functions  | camelCase, verb-first | `createAdapter`, `validateInput` |
| Constants  | SCREAMING_SNAKE       | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Files      | kebab-case            | `model-adapter.ts`               |
| Test files | `.test.ts` suffix     | `model-adapter.test.ts`          |

---

## 5. MCP Server Standards

### 5.1 Protocol Compliance

Target: **MCP Protocol 2025-11-25** (Source: modelcontextprotocol.io)

```typescript
// Tool definition with Zod schemas
server.tool(
  'tool_name',
  {
    param: z.string().describe('Clear description for Claude'),
  },
  async (args) => {
    // Validate early, fail fast
    const validated = InputSchema.safeParse(args);
    if (!validated.success) {
      return { isError: true, content: [{ type: 'text', text: validated.error.message }] };
    }

    // Return structured content
    return { content: [{ type: 'text', text: result }] };
  }
);
```

### 5.2 Tool Design Rules

1. **Clear names** - Verb-noun format: `create_expert`, `run_workflow`
2. **Detailed descriptions** - Claude uses these to decide when to call
3. **Zod validation** - All inputs validated at tool boundary
4. **Tool errors vs protocol errors** - Use `isError: true` for tool failures
5. **Structured output** - Support both `structuredContent` and `TextContent`

### 5.3 Security Requirements

```typescript
// Path traversal prevention
function validatePath(userPath: string, allowedRoot: string): Result<string, SecurityError> {
  const resolved = path.resolve(allowedRoot, userPath);
  if (!resolved.startsWith(allowedRoot)) {
    return { ok: false, error: new SecurityError('Path traversal detected') };
  }
  return { ok: true, value: resolved };
}

// No user-provided RegExp (ReDoS prevention)
// Use static patterns only - never construct regex from user input
const VALID_PATTERN = /^[a-zA-Z0-9_-]+$/; // Static, safe pattern

// Rate limiting
const rateLimiter = new TokenBucket({
  capacity: 100,
  refillRate: 10,
});
```

---

## 6. Agent & Skill Standards

### 6.1 Agent Architecture

Based on Claude Agent SDK patterns (Source: Anthropic Engineering Blog):

```typescript
// Agent loop: Gather → Act → Verify → Repeat
interface IAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly state: AgentState;

  // Core loop
  execute(task: Task): Promise<Result<TaskResult, AgentError>>;

  // Inter-agent communication
  handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>>;

  // Lifecycle
  initialize(ctx: AgentContext): Promise<void>;
  cleanup(): Promise<void>;
}
```

### 6.2 Multi-Agent Orchestration

```typescript
// Orchestrator-Worker pattern
// Lead agent spawns 3-5 subagents for parallel work
// Each subagent needs:
interface SubagentTask {
  objective: string; // Clear goal
  outputFormat: JSONSchema; // Expected output structure
  toolGuidance: string[]; // Which tools to use
  boundaries: string[]; // What NOT to do
}

// Context isolation - subagents get minimal context
// Lead agent synthesizes results
```

### 6.3 Consensus Voting

For major decisions, use research + consensus:

```typescript
interface VotingRound {
  proposal: string;
  agents: AgentVote[];
  threshold: 'majority' | 'supermajority' | 'unanimous';
  result: 'approved' | 'rejected' | 'needs_revision';
}

interface AgentVote {
  agentId: string;
  vote: 'approve' | 'dissent' | 'abstain';
  reasoning: string;
  amendments?: string[];
}
```

#### 6.3.1 Protocol Selection Matrix

| Task Type              | Protocol       | Implementation           | Threshold     | Use When                      |
| ---------------------- | -------------- | ------------------------ | ------------- | ----------------------------- |
| Architecture decisions | Aegean         | aegean-protocol.ts       | supermajority | Byzantine tolerance needed    |
| Code review/reasoning  | Reflexion      | reflexion-protocol.ts    | severity <0.3 | Iterative critique required   |
| Security audit         | Constitutional | constitutional-critic.ts | unanimous     | Principle validation needed   |
| Quick decisions        | Simple Voting  | result-aggregator.ts     | majority      | Speed over thoroughness       |
| Anti-groupthink        | Free-MAD       | free-mad-scoring.ts      | score-based   | Minority opinion matters      |
| Iterative improvement  | Self-Refine    | self-refine-protocol.ts  | convergence   | Self-contained refinement     |
| Implementation tasks   | TRINITY        | trinity-coordinator.ts   | verification  | Thinker/Worker/Verifier roles |
| Byzantine systems      | CP-WBFT        | weighted-voting.ts       | 67% weighted  | Untrusted or variable agents  |

#### 6.3.2 Protocol Implementation Pattern

All protocols MUST implement `ICollaborationProtocol`:

```typescript
interface ICollaborationProtocol {
  readonly pattern: CollaborationPattern;
  execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>>;
  cancel(reason: string): void;
}

type CollaborationPattern =
  | 'sequential' // Chain results through agents
  | 'parallel' // Execute simultaneously
  | 'review' // Peer review pattern
  | 'consensus' // Voting-based decision
  | 'reflexion' // Multi-agent critique loop
  | 'aegean' // Byzantine consensus
  | 'self-refine' // Iterative self-improvement
  | 'self-debug'; // Error detection and repair

// Byzantine quorum calculation (Aegean)
function calculateQuorumSize(totalAgents: number): number {
  // Tolerates f faults in 3f+1 agents
  const f = Math.floor((totalAgents - 1) / 3);
  return 2 * f + 1; // Minimum for safety
}
```

#### 6.3.3 Voting Rules (Protocol-Aware)

| Decision Type      | Protocol        | Threshold         | Rationale                  |
| ------------------ | --------------- | ----------------- | -------------------------- |
| Reversible changes | Simple Voting   | majority (>50%)   | Speed over consensus       |
| Implementation     | TRINITY         | Verifier approval | Role-based validation      |
| Architecture       | Aegean          | supermajority     | Byzantine fault tolerance  |
| Security-critical  | Constitutional  | unanimous         | Principle-based safety     |
| Irreversible       | Aegean + Const. | supermajority +   | Maximum safety guarantees  |
| Performance-based  | CP-WBFT         | 67% weighted      | Trust-weighted voting      |
| Debate outcomes    | Free-MAD        | Anti-conformity   | Protect minority positions |

#### 6.3.4 Source Files

| Module              | Path                                                |
| ------------------- | --------------------------------------------------- |
| Aegean Protocol     | `src/agents/collaboration/aegean-protocol.ts`       |
| Reflexion Protocol  | `src/agents/collaboration/reflexion-protocol.ts`    |
| Constitutional      | `src/agents/collaboration/constitutional-critic.ts` |
| Free-MAD Scoring    | `src/agents/collaboration/free-mad-scoring.ts`      |
| Self-Refine         | `src/agents/collaboration/self-refine-protocol.ts`  |
| TRINITY Coordinator | `src/agents/collaboration/trinity-coordinator.ts`   |
| Weighted Voting     | `src/consensus/weighted-voting.ts`                  |
| Voting Protocol     | `src/consensus/voting-protocol.ts`                  |

### 6.4 Skill Definition Format

```yaml
---
name: skill-name
description: |
  When to use this skill (Claude matches against this).
  Include keywords users would say.
allowed-tools: Read, Bash(npm:*), Edit
model: claude-sonnet-4
---
# Skill Instructions

Clear, actionable instructions under 500 lines.
Reference supporting files rather than inlining everything.
```

---

## 7. Security Standards

### 7.1 Secrets Management

```typescript
// Secrets vault pattern - never in process.env directly
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

### 7.2 Input Validation Pipeline

```typescript
// Validate at every boundary
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

### 7.3 Security Checklist

- [ ] No secrets in logs, errors, or outputs
- [ ] Path traversal prevention on all file operations
- [ ] No user-provided RegExp (ReDoS)
- [ ] Rate limiting on all public tools
- [ ] Input validation with Zod at boundaries
- [ ] Output sanitization before returning
- [ ] Memory bounds on all collections
- [ ] Timeout on all external calls

### 7.4 Sandbox Execution Standards

All agent-executed code MUST run through the sandbox system.

#### Mode Selection

| Mode        | When to Use                          | Security Level |
| ----------- | ------------------------------------ | -------------- |
| `none`      | Local development, trusted code only | None           |
| `policy`    | Standard operation, known commands   | Medium         |
| `container` | Production, untrusted input, CI/CD   | High           |

**Default:** `policy` mode with automatic fallback if Docker unavailable.

#### Command Classification

```typescript
// Commands MUST be classified before execution
type CommandClass = 'allowed' | 'denied' | 'requires_approval';

// Allowed - Execute immediately in sandbox
const ALLOWED = ['pnpm', 'npm', 'git', 'node', 'tsc', 'eslint', 'vitest'];

// Denied - Never execute, return error
const DENIED = ['rm', 'curl', 'wget', 'ssh', 'sudo', 'kill', 'chmod'];

// Requires Approval - Log warning, require explicit flag
const REQUIRES_APPROVAL = ['docker', 'kubectl', 'aws', 'gcloud'];
```

#### Resource Limits (Enforced)

| Resource   | Limit     | Rationale                  |
| ---------- | --------- | -------------------------- |
| Memory     | 512 MB    | Prevent memory exhaustion  |
| CPU        | 2 cores   | Prevent CPU monopolization |
| Timeout    | 5 minutes | Prevent hung processes     |
| Processes  | 10 max    | Prevent fork bombs         |
| Disk write | Read-only | Prevent persistent changes |
| Network    | None      | Prevent data exfiltration  |

#### Environment Sanitization Rules

```typescript
// Environment variables MUST be sanitized before passing to sandbox
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

// Sanitize function - required before any sandbox.execute()
function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => !BLOCKED_PREFIXES.some((prefix) => key.startsWith(prefix))
    )
  );
}
```

#### Integration Requirements

1. **MCP Tools**: All Bash tool calls MUST route through SandboxManager
2. **Workflow Steps**: Shell actions MUST use sandbox execution
3. **CLI Adapters**: External CLI calls MUST respect sandbox policy
4. **Tests**: Sandbox behavior MUST have penetration tests (see `sandbox-pentest.test.ts`)

#### Audit Logging

All sandbox executions MUST be logged:

```typescript
interface SandboxAuditLog {
  timestamp: string; // ISO 8601 ET
  command: string; // Command executed (sanitized)
  mode: SandboxMode; // none | policy | container
  result: 'success' | 'denied' | 'timeout' | 'error';
  durationMs: number;
  userId?: string; // If available
}
```

---

## 8. Testing Standards

### 8.1 Coverage Requirements

| Type            | Target | Scope                                |
| --------------- | ------ | ------------------------------------ |
| Line coverage   | ≥ 80%  | All packages                         |
| Branch coverage | ≥ 75%  | All packages                         |
| Critical paths  | 100%   | Security, validation, error handling |

### 8.2 Test Structure

```typescript
// Vitest with in-memory MCP testing
import { describe, it, expect } from 'vitest';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('tool: orchestrate', () => {
  it('should analyze task and delegate to experts', async () => {
    // Arrange
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Act
    const result = await client.callTool({
      name: 'orchestrate',
      arguments: { task: 'Review this code' },
    });

    // Assert
    expect(result.isError).toBe(false);
    expect(result.content).toMatchSnapshot();
  });
});
```

### 8.3 Test Categories

1. **Unit tests** - Isolated, mocked dependencies
2. **Integration tests** - Real dependencies, test boundaries
3. **Contract tests** - Verify interface compliance
4. **Golden tests** - Snapshot critical outputs
5. **Security tests** - Fuzzing, path traversal, injection

---

## 9. Dependency Management

### 9.1 Recommended Stack (2026)

```yaml
runtime: Node.js 22.x LTS
language: TypeScript 5.8+
package_manager: pnpm 9.x
monorepo: Turborepo
testing: Vitest 3.x
linting: ESLint 9.x (flat config)
formatting: Prettier
build: tsup 8.x
```

### 9.2 Dependency Rules

1. **Check before adding** - Is it actively maintained? Last release < 6 months?
2. **Pin versions** - Use exact versions in production
3. **Audit regularly** - `pnpm audit` in CI
4. **No deprecated packages** - Check npm deprecation status
5. **Prefer smaller packages** - Single-purpose over kitchen-sink

### 9.3 Version Verification

```bash
# Before adding any dependency
npm view <package> time --json | jq '.modified'
npm view <package> deprecated
npm view <package> engines
```

---

## 10. Quality Gates

### 10.1 Pre-Commit (Must Pass)

- [ ] `pnpm lint` - Zero errors, zero warnings
- [ ] `pnpm typecheck` - Zero errors
- [ ] `pnpm test` - All tests pass
- [ ] No file > 400 lines
- [ ] No function > 50 lines
- [ ] No secrets detected

### 10.2 Pre-Merge (Must Pass)

- [ ] All pre-commit gates
- [ ] Coverage ≥ 80%
- [ ] Security audit clean
- [ ] Dependency review clean
- [ ] Breaking changes documented
- [ ] CHANGELOG updated

### 10.3 Pre-Release (Must Pass)

- [ ] All pre-merge gates
- [ ] E2E tests pass
- [ ] Performance benchmarks pass
- [ ] Documentation updated
- [ ] Version bumped correctly

---

## 11. Execution Protocol

### 11.1 Q Protocol (Before Uncertain Actions)

```
DOING: [specific action]
EXPECT: [observable outcome]
IF YES: [next step]
IF NO: [fallback action]
```

After execution:

```
RESULT: [what happened]
MATCHES: yes/no
THEREFORE: [conclusion and next step]
```

### 11.2 Failure Handling

When anything fails:

1. **State failure** - What failed + raw error
2. **State theory** - Why you think it failed
3. **Propose action** - ONE specific next step
4. **State expected outcome** - What success looks like
5. **Wait for confirmation** - No silent retries

### 11.3 Impact Mapping

Before any change, document:

- What changes
- What it affects (behavior, API, tests)
- Migration requirements
- Remaining `Verify:` items

---

## Appendix: ESLint Configuration

```javascript
// eslint.config.js
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**']),
  {
    name: 'nexus-agents/base',
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
      'max-params': ['error', 5],
      'max-depth': ['error', 4],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
    },
  },
]);
```

---

_Standards derived from: MCP Protocol 2025-11-25, TypeScript 5.8 Handbook, Claude Agent SDK, OWASP ASVS 4.0, Node.js Best Practices_
