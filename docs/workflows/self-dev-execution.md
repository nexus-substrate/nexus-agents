---
title: 'Self-Development Execution Phases'
description: 'Phases 6.5-9 of the self-development workflow: code review through commit, covering Docker sandbox execution, security scanning, verification, and PR creation.'
tier: 2
keywords: [self-development, execution, docker, sandbox, security-check, implement, verify]
---

# Self-Development Execution Phases (6.5–9)

These phases execute after human plan approval (Phase 6) in the [Self-Development Workflow](./SELF_DEVELOPMENT_WORKFLOW.md). They cover code review, sandboxed implementation, security scanning, verification, and commit/PR creation.

---

## Phase 6.5: CODE REVIEW (Human Checkpoint #2)

**Objective:** Human reviews actual generated code BEFORE any execution occurs.

**Security Rationale:** Phase 6 approves the _plan_. Phase 6.5 approves the _actual code_. This two-checkpoint design prevents approved plans from producing unapproved code.

### Input

```typescript
interface CodeReviewInput {
  plan: ApprovedPlan;
  generatedFiles: Array<{
    path: string;
    content: string;
    action: 'create' | 'modify' | 'delete';
    diff?: string; // unified diff for modifications
  }>;
  estimatedRisk: 'low' | 'medium' | 'high' | 'critical';
}
```

### Process

1. **Generate code** from the approved plan — NO EXECUTION at this stage
2. **Present to human** — full file contents and diffs for every changed file
3. **Human reviews** for security vulnerabilities, unintended side effects, and suspicious patterns

### Security Checklist

The human reviewer completes this checklist before approval:

```markdown
- [ ] No hardcoded secrets, tokens, or credentials
- [ ] No unexpected network requests or external API calls
- [ ] No file writes outside the project directory
- [ ] No execution of external commands beyond what the plan requires
- [ ] Changes match the approved plan (no scope creep)
- [ ] No obfuscated or intentionally unclear code
```

### Output

```typescript
interface CodeReviewOutput {
  approved: boolean;
  reviewerComments: string;
  securityChecklistCompleted: boolean;
  requestedChanges?: string[];
}
```

**Threshold:** Human APPROVE **and** security checklist fully completed. If either condition fails, return to code generation with reviewer feedback.

---

## Phase 7: IMPLEMENT

**Objective:** Implement the approved code using self-correcting protocols inside a Docker sandbox.

**Protocols:** SelfDebugProtocol + SelfRefineProtocol + Docker Sandbox

### Input

```typescript
interface ImplementInput {
  plan: ApprovedPlan;
  codebaseRoot: string;
  codeReviewApproval: CodeReviewOutput;
}
```

### Docker Sandbox Configuration

```typescript
interface DockerSandboxConfig {
  memoryLimit: '512m';
  cpuLimit: 1.0;
  timeoutSeconds: 300;
  networkMode: 'none';
  readOnlyRootFilesystem: true;
  allowedWritePaths: ['/tmp', '/workspace'];
  noNewPrivileges: true;
  seccompProfile: 'default';
  capDrop: 'ALL';
  image: 'node:22-slim';
}
```

```bash
# DOCKER_RUN_TEMPLATE
docker run --rm \
  --memory=512m \
  --cpus=1.0 \
  --timeout=300 \
  --network=none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=256m \
  -v "$WORKSPACE:/workspace:rw" \
  --no-new-privileges \
  --security-opt seccomp=default \
  --cap-drop=ALL \
  node:22-slim \
  "$COMMAND"
```

### Implementation Strategy

1. **Generate code** from the approved, reviewed plan
2. **SelfRefine in Docker** — iteratively improve code quality
   - Max 3 iterations
   - Convergence threshold: Jaccard similarity > 0.95 between iterations
3. **SelfDebug in Docker** — fix failing tests and type errors
   - Max 5 iterations
   - Each iteration: run tests → analyze failures → apply fixes → re-test

```typescript
const selfRefineConfig = {
  maxIterations: 3,
  convergenceThreshold: 0.95, // Jaccard similarity
  evaluationCriteria: ['correctness', 'readability', 'test-coverage'],
};

const selfDebugConfig = {
  maxIterations: 5,
  debugStrategies: ['error-trace', 'type-narrowing', 'test-isolation'],
  exitOnAllPass: true,
};
```

### Sandboxed Code Executor

```typescript
// Execution lifecycle
async function executeInSandbox(config: DockerSandboxConfig): Promise<void> {
  const workspace = await createTempWorkspace();
  try {
    await copyProject(workspace, config.codebaseRoot);
    await writeCode(workspace, generatedFiles);
    const result = await execDockerCommand(workspace, config);
    return result;
  } finally {
    await cleanup(workspace);
  }
}
```

### Resource Exhaustion Handling

- **OOM (exit code 137):** Log memory usage, reduce batch size, retry with `--memory=1g` once. If still OOM, fail the phase.
- **Timeout (exit code 124):** Log elapsed time, classify as CONNECTION_ERROR (transient). Retry once with `timeoutSeconds * 1.5`.

### Output

```typescript
interface ImplementOutput {
  success: boolean;
  modifiedFiles: string[];
  selfRefineIterations: number;
  selfDebugIterations: number;
  finalTestResults: TestResults;
  dockerLogs: string;
  resourceUsage: { peakMemoryMb: number; wallTimeSeconds: number };
}
```

---

## Phase 7.5: SECURITY CHECK

**Objective:** Automated security scanning of all generated/modified code before verification.

**Protocol:** SecureCodeChecker

### Input

```typescript
interface SecurityCheckInput {
  modifiedFiles: Array<{ path: string; content: string }>;
  codebaseRoot: string;
}
```

### Security Checks

| Check                      | Severity | Action                  |
| -------------------------- | -------- | ----------------------- |
| Hardcoded Secrets          | critical | **block**               |
| Path Traversal             | critical | **block**               |
| Command Injection          | critical | **block**               |
| Privilege Escalation       | critical | **block**               |
| Network Calls              | high     | **warn + human review** |
| File Write Outside Project | critical | **block**               |
| Sensitive File Access      | high     | **warn**                |
| Obfuscated Code            | critical | **block**               |

```typescript
const SECURITY_CHECKS = [
  {
    name: 'Hardcoded Secrets',
    severity: 'critical',
    patterns: [
      /(?:api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{8,}/i,
      /sk-[a-zA-Z0-9]{20,}/,
      /ghp_[a-zA-Z0-9]{36}/,
      /AIzaSy[a-zA-Z0-9_-]{33}/,
    ],
  },
  {
    name: 'Path Traversal',
    severity: 'critical',
    patterns: [/\.\.\//g, /path\.join\([^)]*\.\./],
  },
  {
    name: 'Command Injection',
    severity: 'critical',
    patterns: [/exec\s*\(\s*[`'"]\s*\$\{/, /child_process/, /eval\s*\(/, /new\s+Function\s*\(/],
  },
  {
    name: 'Privilege Escalation',
    severity: 'critical',
    patterns: [/process\.setuid/, /process\.setgid/, /sudo\s/],
  },
  {
    name: 'Network Calls',
    severity: 'high',
    patterns: [/fetch\s*\(/, /https?:\/\//, /net\.connect/, /dgram\.createSocket/],
  },
  {
    name: 'File Write Outside Project',
    severity: 'critical',
    patterns: [/fs\.writeFile.*['"]\/(etc|usr|var|home)/, /fs\.mkdirSync.*['"]\//],
  },
  {
    name: 'Sensitive File Access',
    severity: 'high',
    patterns: [/\/etc\/passwd/, /\/etc\/shadow/, /\.ssh\//, /\.env(?:\.|$)/],
  },
  {
    name: 'Obfuscated Code',
    severity: 'critical',
    patterns: [/\\x[0-9a-f]{2}/i, /String\.fromCharCode/, /atob\s*\(/, /Buffer\.from.*base64/],
  },
] as const;
```

```typescript
function runSecurityChecks(input: SecurityCheckInput): SecurityCheckOutput {
  const findings: SecurityFinding[] = [];

  for (const file of input.modifiedFiles) {
    for (const check of SECURITY_CHECKS) {
      for (const pattern of check.patterns) {
        const matches = file.content.match(pattern);
        if (matches) {
          findings.push({
            check: check.name,
            severity: check.severity,
            file: file.path,
            match: matches[0],
            line: getLineNumber(file.content, matches.index),
          });
        }
      }
    }
  }

  return {
    passed: findings.filter((f) => f.severity === 'critical').length === 0,
    findings,
    criticalCount: findings.filter((f) => f.severity === 'critical').length,
    highCount: findings.filter((f) => f.severity === 'high').length,
  };
}
```

### Output

```typescript
interface SecurityCheckOutput {
  passed: boolean;
  findings: SecurityFinding[];
  criticalCount: number;
  highCount: number;
}
```

**Threshold:** Zero critical findings. High-severity findings trigger human review but do not block.

---

## Phase 8: VERIFY

**Objective:** Comprehensive verification of all changes before commit.

**Protocol:** Parallel test execution

### Input

```typescript
interface VerifyInput {
  codebaseRoot: string;
  modifiedFiles: string[];
  securityCheckOutput: SecurityCheckOutput;
}
```

### Verification Checks

| Check          | Command                | Pass Criteria     |
| -------------- | ---------------------- | ----------------- |
| Type Check     | `pnpm typecheck`       | Exit code 0       |
| Lint           | `pnpm lint`            | Exit code 0       |
| Unit Tests     | `pnpm test`            | All tests pass    |
| Coverage       | `pnpm test --coverage` | Statements >= 80% |
| Build          | `pnpm build`           | Exit code 0       |
| Security Audit | `pnpm audit`           | No critical vulns |

All checks run in parallel where possible. Any failure blocks the commit phase.

### Output

```typescript
interface VerifyOutput {
  allPassed: boolean;
  results: Record<string, { passed: boolean; output: string; durationMs: number }>;
  coveragePercent: number;
  failedChecks: string[];
}
```

---

## Phase 9: COMMIT

**Objective:** Create a pull request with the verified changes.

**Protocol:** Git operations

### Input

```typescript
interface CommitInput {
  codebaseRoot: string;
  plan: ApprovedPlan;
  verifyOutput: VerifyOutput;
  modifiedFiles: string[];
}
```

### Git Operations

1. **Create branch:** `feat/<issue>-<description>` or `fix/<issue>-<description>`
2. **Stage files:** Add only the modified/created files (never `git add -A`)
3. **Commit** with conventional message:

```bash
git commit -m "feat(scope): description

Implements #<issue>.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### PR Template

```markdown
## Summary

- <1-3 bullet points describing what changed and why>

## Changes

- <list of modified files with brief description>

## Test Plan

- [ ] Type check passes
- [ ] Lint passes
- [ ] All unit tests pass
- [ ] Coverage >= 80%
- [ ] Build succeeds
- [ ] Security audit clean
- [ ] Security check (Phase 7.5) passed with zero critical findings

## Self-Development Metadata

- Plan ID: <plan-id>
- Code Review: Approved by <reviewer>
- SelfRefine iterations: <n>
- SelfDebug iterations: <n>
- Docker sandbox: node:22-slim, network=none, cap-drop=ALL
```

### Output

```typescript
interface CommitOutput {
  branchName: string;
  commitHash: string;
  prUrl: string;
  prNumber: number;
}
```

**Human merges the PR.** The agent never force-pushes or auto-merges.
