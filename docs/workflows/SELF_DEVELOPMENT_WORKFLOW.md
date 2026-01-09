# Self-Development Meta-Workflow Specification

**Version:** 2.1.1
**Status:** IN PROGRESS (Core Implementation Complete)
**Date:** 2026-01-08 (ET)
**GitHub Issue:** [#144](https://github.com/williamzujkowski/nexus-agents/issues/144)
**Author:** Architecture Agent + Security Review
**Revised By:** Human Amendments (Autonomous Mode)

---

## Prerequisites (MUST be completed before implementation)

| Prerequisite                     | Description                                                                                       | Tracking                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------ |
| **v2.3.0 CLI Adapters Stable**   | CLI adapters for Claude, Gemini, Codex must be production-ready with **1 day zero critical bugs** | Issue #75, #76, #77      |
| **v2.3.0 Quality Router Stable** | Quality-based model routing must be tested                                                        | Issue #78                |
| **Docker Available**             | Docker CLI must be available for sandboxed execution                                              | Verified: User confirmed |
| **Security Audit Complete**      | All security safeguards implemented and tested                                                    | This document Section 10 |

**Stability Definition:** "Stable" means zero critical bugs reported for 1 calendar day after deployment.

**This workflow is BLOCKED until all prerequisites are met.**

---

## Executive Summary

This document specifies a meta-workflow for nexus-agents self-development. The workflow enables the system to analyze open issues, plan implementations using its own protocols (TRINITY, Consensus, Reflexion), achieve multi-agent consensus, obtain human approval, and execute implementation using Self-Debug and Self-Refine protocols.

The workflow is reusable for any self-improvement task and codifies the process by which nexus-agents develops itself.

**Security Model:** All code execution occurs in Docker containers with strict resource limits. Human approval is required for **plan approval only** (Phase 6). After plan approval, automated security gates (input sanitization, Docker sandbox, security scans) handle execution without blocking human intervention. PRs are created for milestone changes to enable tracking and rollback. Only repository owner can trigger workflows.

**Autonomy Model:** After human approves the implementation plan, the workflow runs autonomously through security gates. Humans receive notifications but are not blockers. Rate limiting is optional and disabled by default.

---

## 1. Workflow Overview

### 1.1 High-Level Flow

```
 +-------------+     +-------------+     +-------------+
 |   ANALYZE   |---->|  RESEARCH   |---->|    PLAN     |
 | (Sanitized) |     | (Context)   |     | (TRINITY)   |
 +-------------+     +-------------+     +-------------+
        |                  |                   |
        v                  v                   v
 +-------------+     +-------------+     +-------------+
 |    VOTE     |<----|   REVIEW    |<----|   REFINE    |
 | (Consensus) |     | (Human)     |     | (Reflexion) |
 +-------------+     +-------------+     +-------------+
        |
        | [PLAN APPROVED - Autonomous from here]
        v
 +-------------+     +-------------+     +-------------+
 |  GENERATE   |---->|  IMPLEMENT  |---->|   SECURE    |
 | (Code)      |     | (Sandboxed) |     |   CHECK     |
 +-------------+     +-------------+     +-------------+
        |                  |                   |
        v                  v                   v
 +-------------+     +-------------+     +-------------+
 |   VERIFY    |---->|   COMMIT    |---->| MILESTONE   |
 | (Tests)     |     | (PR)        |     |   PR        |
 +-------------+     +-------------+     +-------------+
                                               |
                                      [Notify human, auto-merge]
```

### 1.2 Phases Summary

| Phase | Name           | Protocol(s)                       | Output                 | Human Checkpoint |
| ----- | -------------- | --------------------------------- | ---------------------- | ---------------- |
| 1     | Analyze        | Adaptive + Input Sanitization     | Prioritized issue list | No               |
| 2     | Research       | Parallel execution                | Context & prior art    | No               |
| 3     | Plan           | TRINITY (Thinker/Worker/Verifier) | Implementation plan    | No               |
| 4     | Refine         | Reflexion (multi-persona critics) | Refined plan           | No               |
| 5     | Vote           | Consensus (5-agent vote)          | Approval/rejection     | No               |
| 6     | Review         | Human checkpoint                  | Plan approval          | **YES**          |
| 6.5   | Generate       | Self-Refine (dry-run)             | Generated code         | No (automated)   |
| 7     | Implement      | Self-Debug (Docker sandbox)       | Working code           | No (automated)   |
| 7.5   | Security Check | SecureCodeChecker                 | Security scan results  | No (automated)   |
| 8     | Verify         | Test execution                    | Test results           | No (automated)   |
| 9     | Commit         | Git operations                    | Milestone PR           | No (notify only) |

**Note:** After Phase 6 (Plan Approval), the workflow runs autonomously. Security is enforced by automated gates (Docker sandbox, security scans, test verification). Human receives notifications but is not a blocker.

---

## 2. Phase Specifications

### 2.1 Phase 1: ANALYZE

**Objective:** Analyze open GitHub issues and prioritize for implementation.

**Protocol:** AdaptiveProtocolSelector (parallel pattern for analysis tasks) + Input Sanitization

**Security Gate: Issue Origin Verification**

```typescript
// SECURITY: Only process issues from authorized sources
const AUTHORIZED_AUTHORS = ['williamzujkowski']; // Repository owner only

function verifyIssueOrigin(issue: GitHubIssue): boolean {
  // Only repository owner can trigger self-development workflows
  if (!AUTHORIZED_AUTHORS.includes(issue.author)) {
    logger.warn('Rejected issue from unauthorized author', { author: issue.author });
    return false;
  }
  // Must have explicit self-dev label
  if (!issue.labels.includes('self-development-approved')) {
    logger.warn('Issue missing self-development-approved label', { issue: issue.number });
    return false;
  }
  return true;
}
```

**Security Gate: Input Sanitization**

```typescript
import { z } from 'zod';

// Dangerous patterns that could indicate injection attempts
const DANGEROUS_PATTERNS = [
  /`[^`]*`/g, // Backticks (command substitution)
  /\$\([^)]*\)/g, // $(command) substitution
  /\|/g, // Pipe operator
  /&/g, // Background/AND operator
  /;/g, // Command separator
  />/g, // Redirect output
  /</g, // Redirect input
  /\beval\b/gi, // eval keyword
  /\bexec\b/gi, // exec keyword
  /\bsudo\b/gi, // sudo command
  /\brm\s+-rf\b/gi, // rm -rf pattern
  /\bcurl\b.*\|\s*\w/gi, // curl pipe to execution
];

const IssueContentSchema = z.object({
  title: z
    .string()
    .max(200)
    .refine((val) => !DANGEROUS_PATTERNS.some((p) => p.test(val)), {
      message: 'Issue title contains potentially dangerous patterns',
    }),
  body: z
    .string()
    .max(10000)
    .refine((val) => !DANGEROUS_PATTERNS.some((p) => p.test(val)), {
      message: 'Issue body contains potentially dangerous patterns',
    }),
  labels: z.array(z.string()),
  author: z.string(),
});

function sanitizeIssueContent(issue: unknown): Result<SanitizedIssue, SecurityError> {
  const parsed = IssueContentSchema.safeParse(issue);
  if (!parsed.success) {
    return { ok: false, error: new SecurityError('Issue content validation failed', parsed.error) };
  }
  // Strip any remaining HTML/script tags
  const sanitized = {
    ...parsed.data,
    title: parsed.data.title.replace(/<[^>]*>/g, ''),
    body: parsed.data.body.replace(/<[^>]*>/g, ''),
  };
  return { ok: true, value: sanitized };
}
```

**Inputs:**

```typescript
interface AnalyzeInput {
  repository: string; // e.g., "williamzujkowski/nexus-agents"
  labels?: string[]; // Filter labels e.g., ["enhancement", "bug"]
  excludeLabels?: string[]; // Exclude labels e.g., ["wontfix", "blocked"]
  maxIssues?: number; // Max issues to analyze (default: 20)
  requireOwnerApproval: true; // SECURITY: Only owner-approved issues
}
```

**Process:**

1. Fetch open issues from GitHub via `gh issue list`
2. **SECURITY: Verify issue origin** - reject issues not from authorized authors
3. **SECURITY: Sanitize issue content** - strip dangerous patterns
4. For each validated issue, spawn an analysis agent to evaluate:
   - Complexity (1-5 scale)
   - Dependencies (other issues, PRs, external factors)
   - Alignment with PROJECT_PLAN.md goals
   - Risk assessment (security, breaking changes)
5. Aggregate results and rank by priority score

**Priority Scoring Formula:**

```
priority = (alignment * 3) + (urgency * 2) + (feasibility * 2) - (risk * 1.5) - (complexity * 0.5)
```

**Output:**

```typescript
interface AnalyzeOutput {
  prioritizedIssues: {
    issueNumber: number;
    title: string;
    priorityScore: number;
    complexity: 1 | 2 | 3 | 4 | 5;
    estimatedEffort: string;
    dependencies: string[];
    risks: string[];
  }[];
  selectedIssue: number; // Issue selected for implementation
  selectionRationale: string;
}
```

**Voting Threshold:** N/A (automated selection based on priority score)

---

### 2.2 Phase 2: RESEARCH

**Objective:** Gather context, prior art, and relevant information for the selected issue.

**Protocol:** Parallel collaboration pattern

**Inputs:**

```typescript
interface ResearchInput {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  codebaseRoot: string;
}
```

**Research Agents (Parallel):**

| Agent         | Focus Area                         | Tools               |
| ------------- | ---------------------------------- | ------------------- |
| CodebaseAgent | Existing implementations, patterns | Grep, Glob, Read    |
| ResearchAgent | arXiv papers, prior art            | WebSearch, WebFetch |
| DocsAgent     | Official documentation             | Read, WebFetch      |
| HistoryAgent  | Related PRs, closed issues         | gh CLI              |

**Process:**

1. Spawn 4 research agents in parallel
2. Each agent explores its focus area
3. Aggregate findings with deduplication
4. Identify relevant:
   - Existing code patterns to follow
   - Research papers to cite
   - Breaking changes to consider
   - Test patterns to use

**Output:**

```typescript
interface ResearchOutput {
  codebaseFindings: {
    relevantFiles: string[];
    existingPatterns: string[];
    interfaces: string[];
  };
  researchFindings: {
    papers: { arxivId: string; title: string; relevance: string }[];
    techniques: string[];
  };
  docFindings: {
    officialDocs: string[];
    bestPractices: string[];
  };
  historyFindings: {
    relatedIssues: number[];
    relatedPRs: number[];
    previousAttempts: string[];
  };
  synthesizedContext: string; // Combined summary
}
```

**Voting Threshold:** N/A (information gathering)

---

### 2.3 Phase 3: PLAN

**Objective:** Create detailed implementation plan using TRINITY protocol.

**Protocol:** TrinityCoordinator (Thinker/Worker/Verifier)

**Inputs:**

```typescript
interface PlanInput {
  issue: AnalyzeOutput['selectedIssue'];
  research: ResearchOutput;
}
```

**TRINITY Roles:**

| Role         | Responsibility                      | Output                             |
| ------------ | ----------------------------------- | ---------------------------------- |
| **Thinker**  | Analyze problem, define approach    | Problem analysis, success criteria |
| **Worker**   | Create detailed implementation plan | Step-by-step plan, file changes    |
| **Verifier** | Validate plan against criteria      | Pass/fail verdict, issues found    |

**Process:**

1. **Thinker Phase:**
   - Analyze the issue and research context
   - Define problem boundaries
   - Establish success criteria
   - Identify edge cases and constraints

2. **Worker Phase:**
   - Create implementation plan with:
     - Files to create/modify
     - Interface definitions
     - Test plan
     - Migration steps (if breaking)
   - Address Thinker's success criteria

3. **Verifier Phase:**
   - Check plan against success criteria
   - Validate feasibility
   - Identify gaps or issues
   - If FAIL: iterate with feedback

**TRINITY Config:**

```typescript
const trinityConfig: TrinityConfig = {
  maxIterations: 3,
  timeoutMs: 300000, // 5 minutes
  includeHistory: true,
};
```

**Output:**

```typescript
interface PlanOutput {
  problemAnalysis: string;
  successCriteria: string[];
  implementationPlan: {
    files: {
      path: string;
      action: 'create' | 'modify' | 'delete';
      description: string;
    }[];
    interfaces: string[];
    dependencies: string[];
    testPlan: string;
    migrationSteps?: string[];
  };
  verifierVerdict: 'pass' | 'fail';
  iterations: number;
}
```

**Voting Threshold:** Verifier must pass (verdict === 'pass')

---

### 2.4 Phase 4: REFINE

**Objective:** Refine the plan using multi-persona criticism.

**Protocol:** ReflexionProtocol (multi-agent reflexion)

**Inputs:**

```typescript
interface RefineInput {
  plan: PlanOutput;
  research: ResearchOutput;
}
```

**Personas (Critics):**

| Persona        | Focus                                  | Weight |
| -------------- | -------------------------------------- | ------ |
| **Architect**  | Design quality, patterns, modularity   | 0.25   |
| **Security**   | Security implications, vulnerabilities | 0.25   |
| **Tester**     | Testability, coverage, edge cases      | 0.20   |
| **DevEx**      | Usability, documentation, ergonomics   | 0.15   |
| **Maintainer** | Long-term maintenance, tech debt       | 0.15   |

**Process:**

1. Each persona critiques the plan from their perspective
2. Structured debate synthesizes critiques
3. If weighted severity > threshold: refine and iterate
4. Continue until convergence or max iterations

**Reflexion Config:**

```typescript
const reflexionConfig: ReflexionConfig = {
  maxIterations: 3,
  severityThreshold: 0.3, // Converge when avg severity < 0.3
  personas: SELF_DEV_PERSONAS,
  iterationTimeoutMs: 120000,
  requireConsensus: false,
};
```

**Output:**

```typescript
interface RefineOutput {
  refinedPlan: PlanOutput;
  critiques: {
    personaId: string;
    issues: string[];
    suggestions: string[];
    severity: number;
  }[];
  iterations: number;
  converged: boolean;
  finalSeverity: number;
}
```

**Voting Threshold:** Converge (finalSeverity < 0.3) or max iterations

---

### 2.5 Phase 5: VOTE

**Objective:** Achieve multi-agent consensus on the refined plan.

**Protocol:** ConsensusProtocol

**Inputs:**

```typescript
interface VoteInput {
  issue: AnalyzeOutput['selectedIssue'];
  plan: RefineOutput['refinedPlan'];
  critiques: RefineOutput['critiques'];
}
```

**Voting Agents:**

| Agent              | Expertise            | Veto Power                 |
| ------------------ | -------------------- | -------------------------- |
| **ArchitectAgent** | System design        | Yes (architecture changes) |
| **SecurityAgent**  | Security review      | Yes (security concerns)    |
| **QAAgent**        | Quality assurance    | No                         |
| **DevExAgent**     | Developer experience | No                         |
| **PMAgent**        | Project alignment    | No                         |

**Vote Options:**

- `APPROVE`: Plan is acceptable
- `REJECT`: Plan has fundamental issues
- `ABSTAIN`: No strong opinion

**Consensus Thresholds:**

| Change Type         | Required Votes                   | Veto Override     |
| ------------------- | -------------------------------- | ----------------- |
| Bug fix             | Simple majority (>50%)           | No veto override  |
| Enhancement         | Supermajority (>=4/5)            | No veto override  |
| Architecture change | Unanimous (5/5)                  | N/A               |
| Security-related    | Supermajority + Security APPROVE | Security can veto |
| Breaking change     | Supermajority + user approval    | Requires Phase 6  |

**Output:**

```typescript
interface VoteOutput {
  votes: {
    agentId: string;
    decision: 'approve' | 'reject' | 'abstain';
    reasoning: string;
    conditions?: string[];
  }[];
  approvalCount: number;
  rejectCount: number;
  abstainCount: number;
  consensus: boolean;
  vetoExercised: boolean;
  vetoReason?: string;
  verdict: 'APPROVED' | 'REJECTED' | 'REQUIRES_REVISION';
}
```

**Voting Threshold:** Per change type table above

---

### 2.6 Phase 6: REVIEW (Human Checkpoint)

**Objective:** Obtain human approval before implementation.

**Protocol:** Human-in-the-loop

**Inputs:**

```typescript
interface ReviewInput {
  issue: AnalyzeOutput['selectedIssue'];
  plan: RefineOutput['refinedPlan'];
  voteResult: VoteOutput;
  estimatedImpact: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    testsAdded: number;
    riskLevel: 'low' | 'medium' | 'high';
  };
}
```

**Presentation Format:**

```markdown
## Self-Development Request: Issue #{{issueNumber}}

### Summary

{{plan.problemAnalysis}}

### Proposed Changes

{{plan.implementationPlan.files}}

### Agent Consensus

- Approve: {{voteResult.approvalCount}}/5
- Reject: {{voteResult.rejectCount}}/5
- Conditions: {{voteResult.votes.conditions}}

### Impact Assessment

- Files: {{estimatedImpact.filesChanged}}
- Lines: +{{estimatedImpact.linesAdded}} / -{{estimatedImpact.linesRemoved}}
- Risk: {{estimatedImpact.riskLevel}}

### Action Required

Do you approve this implementation? (yes/no/revise)
```

**Human Responses:**

- `yes` / `approve`: Proceed to Phase 7
- `no` / `reject`: Abort workflow, log reason
- `revise` / `changes`: Return to Phase 4 with feedback

**Output:**

```typescript
interface ReviewOutput {
  humanDecision: 'approved' | 'rejected' | 'revision_requested';
  feedback?: string;
  timestamp: string;
  reviewerId?: string;
}
```

**Threshold:** Human APPROVE required

---

### 2.6.5 Phase 6.5: CODE REVIEW (Human Checkpoint #2)

**Objective:** Human reviews actual generated code BEFORE any execution occurs.

**Protocol:** Human-in-the-loop (pre-execution gate)

**SECURITY RATIONALE:** Phase 6 approves the _plan_. Phase 6.5 approves the _actual code_ before it runs. This prevents scenarios where a reasonable-sounding plan generates dangerous code.

**Inputs:**

```typescript
interface CodeReviewInput {
  plan: RefineOutput['refinedPlan'];
  generatedFiles: {
    path: string;
    content: string;
    action: 'create' | 'modify' | 'delete';
    diff?: string; // For modifications
  }[];
  estimatedRisk: 'low' | 'medium' | 'high';
}
```

**Process:**

1. Generate code files according to plan (NO EXECUTION YET)
2. Present all generated code to human for review
3. Human reviews each file, looking for:
   - Security vulnerabilities (injection, secrets exposure)
   - Unintended side effects
   - Code that doesn't match plan intent
   - Suspicious patterns (network calls, file writes outside project)
4. Human approves, rejects, or requests changes

**Presentation Format:**

```markdown
## Code Review Required: Issue #{{issueNumber}}

### Generated Files ({{generatedFiles.length}} total)

{{#each generatedFiles}}

#### {{action}}: {{path}}

\`\`\`typescript
{{content}}
\`\`\`
{{#if diff}}
**Diff:**
{{diff}}
{{/if}}
{{/each}}

### Security Checklist (Human Must Verify)

- [ ] No hardcoded secrets or credentials
- [ ] No unexpected network requests
- [ ] No file writes outside project directory
- [ ] No execution of external commands
- [ ] Changes match approved plan intent
- [ ] No suspicious obfuscated code

### Action Required

Do you approve this code for sandboxed execution? (yes/no/revise)
```

**Human Responses:**

- `yes` / `approve`: Proceed to Phase 7 (sandboxed execution)
- `no` / `reject`: Abort workflow, log reason
- `revise` / `changes`: Return to Phase 3 with feedback

**Output:**

```typescript
interface CodeReviewOutput {
  humanDecision: 'approved' | 'rejected' | 'revision_requested';
  reviewedFiles: string[];
  securityChecklistComplete: boolean;
  feedback?: string;
  timestamp: string;
  reviewerId?: string;
}
```

**Threshold:** Human APPROVE required + security checklist completed

---

### 2.7 Phase 7: IMPLEMENT

**Objective:** Implement the approved plan using self-correcting protocols in a sandboxed environment.

**Protocol:** SelfDebugProtocol + SelfRefineProtocol + Docker Sandbox

**SECURITY: All code execution occurs inside Docker containers with strict resource limits.**

**Inputs:**

```typescript
interface ImplementInput {
  plan: RefineOutput['refinedPlan'];
  codebaseRoot: string;
  codeReviewApproval: CodeReviewOutput; // REQUIRED: Phase 6.5 approval
}
```

**Docker Sandbox Configuration:**

```typescript
interface DockerSandboxConfig {
  // Resource limits
  memoryLimit: '512m'; // Max 512MB RAM
  cpuLimit: '1.0'; // Max 1 CPU core
  timeoutSeconds: 300; // 5 minute execution timeout

  // Network isolation
  networkMode: 'none'; // NO network access

  // Filesystem isolation
  readOnlyRootFilesystem: true; // Root is read-only
  allowedWritePaths: ['/tmp', '/workspace']; // Only /tmp and /workspace writable

  // Security options
  noNewPrivileges: true; // Cannot escalate privileges
  seccompProfile: 'default'; // Apply default seccomp profile
  capDrop: ['ALL']; // Drop all Linux capabilities

  // Image
  image: 'node:22-slim'; // Minimal Node.js image
}

// Docker run command template
const DOCKER_RUN_TEMPLATE = `
docker run --rm \
  --memory={{memoryLimit}} \
  --cpus={{cpuLimit}} \
  --network={{networkMode}} \
  --read-only \
  --tmpfs /tmp:size=100m \
  --security-opt no-new-privileges \
  --cap-drop ALL \
  -v "{{workspaceDir}}:/workspace:rw" \
  -w /workspace \
  {{image}} \
  sh -c "{{command}}"
`;
```

**Implementation Strategy:**

```
For each file in plan.files:
  1. Generate initial code using plan (NO EXECUTION)
  2. Human reviews code in Phase 6.5 (already completed)
  3. Run SelfRefineProtocol IN DOCKER:
     - Generate -> Feedback -> Refine (max 3 iterations)
     - Stop on convergence (Jaccard > 0.95)
  4. Run SelfDebugProtocol IN DOCKER:
     - Execute tests in sandbox
     - If errors: Explain -> Fix -> Verify
     - Max 5 iterations
  5. If both protocols succeed: mark file complete
  6. If either fails: escalate for human review
```

**SelfRefine Config:**

```typescript
const selfRefineConfig: SelfRefineConfig = {
  maxIterations: 3,
  convergenceThreshold: 0.95, // Stricter convergence
};
```

**SelfDebug Config:**

```typescript
const selfDebugConfig: SelfDebugConfig = {
  maxIterations: 5,
  stopOnFirstError: false,
  includeExplanation: true,
};
```

**Sandboxed Code Executor:**

```typescript
const sandboxedExecutor: CodeExecutor = {
  execute: async (code: string): Promise<ExecutionResult> => {
    // 1. Create isolated workspace directory
    const workspaceDir = await createTempWorkspace();

    // 2. Copy project files to workspace (read-only except generated code)
    await copyProjectToWorkspace(workspaceDir);

    // 3. Write generated code to workspace
    await writeCodeToWorkspace(workspaceDir, code);

    // 4. Execute in Docker container with resource limits
    const result = await execDockerCommand({
      command: 'pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test',
      workspaceDir,
      config: DOCKER_SANDBOX_CONFIG,
      timeout: 300000, // 5 minutes
    });

    // 5. Validate exit was clean (not killed due to resource exhaustion)
    if (result.wasKilled) {
      return {
        success: false,
        error: `Container killed: ${result.killReason}`,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }

    // 6. Cleanup workspace
    await cleanupWorkspace(workspaceDir);

    return {
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  },
};
```

**Resource Exhaustion Handling:**

```typescript
// If container is killed due to resource limits, fail safely
if (result.oomKilled) {
  logger.error('Container OOM killed', { workspaceDir });
  return {
    success: false,
    error: 'Out of memory - code may have infinite loop or excessive allocation',
  };
}
if (result.timedOut) {
  logger.error('Container timed out', { workspaceDir, timeout: 300000 });
  return { success: false, error: 'Execution timed out - code may have infinite loop' };
}
```

**Output:**

```typescript
interface ImplementOutput {
  filesCreated: string[];
  filesModified: string[];
  selfRefineIterations: number;
  selfDebugIterations: number;
  success: boolean;
  failedFiles?: { path: string; error: string }[];
}
```

**Threshold:** All files pass typecheck, lint, and tests

---

### 2.7.5 Phase 7.5: SECURITY CHECK

**Objective:** Automated security scanning of generated code before verification.

**Protocol:** SecureCodeChecker (static analysis + pattern matching)

**SECURITY RATIONALE:** Even human-reviewed code may have subtle security issues. This automated check catches common vulnerabilities before the code is committed.

**Inputs:**

```typescript
interface SecurityCheckInput {
  implementation: ImplementOutput;
  plan: RefineOutput['refinedPlan'];
}
```

**Security Checks Performed:**

| Check                      | Description                                  | Action on Failure   |
| -------------------------- | -------------------------------------------- | ------------------- |
| Hardcoded Secrets          | Scan for API keys, tokens, passwords         | Block + alert       |
| Path Traversal             | Check for `../` in file paths                | Block               |
| Command Injection          | Check for shell metacharacters in exec calls | Block               |
| Privilege Escalation       | Check for sudo, chmod, chown patterns        | Block               |
| Network Calls              | Unexpected fetch/axios/http calls            | Warn + human review |
| File Write Outside Project | Writes to `/etc`, `/usr`, home directory     | Block               |
| Sensitive File Access      | Reading `.env`, credentials files            | Warn                |
| Obfuscated Code            | Base64, eval, Function constructor           | Block               |

**Security Check Implementation:**

```typescript
const SECURITY_CHECKS: SecurityCheck[] = [
  {
    name: 'hardcoded_secrets',
    patterns: [
      /['"][A-Za-z0-9+/=]{40,}['"]/g, // Base64-like strings
      /sk-[a-zA-Z0-9]{32,}/g, // OpenAI-style keys
      /ghp_[a-zA-Z0-9]{36}/g, // GitHub tokens
      /password\s*[:=]\s*['"][^'"]+['"]/gi,
      /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi,
    ],
    severity: 'critical',
    action: 'block',
  },
  {
    name: 'command_injection',
    patterns: [
      /exec\s*\([^)]*\$\{/g, // Template literals in exec
      /spawn\s*\([^)]*\+/g, // String concatenation in spawn
      /child_process/g, // Direct child_process usage
    ],
    severity: 'critical',
    action: 'block',
  },
  {
    name: 'path_traversal',
    patterns: [
      /\.\.\//g, // Parent directory traversal
      /path\.join\([^)]*\.\./g, // join with traversal
    ],
    severity: 'critical',
    action: 'block',
  },
  {
    name: 'network_calls',
    patterns: [/fetch\s*\(/g, /axios\./g, /http\.request/g, /https\.request/g],
    severity: 'warning',
    action: 'human_review',
    allowList: ['test files', 'mock implementations'],
  },
];

async function runSecurityChecks(files: GeneratedFile[]): Promise<SecurityCheckResult> {
  const findings: SecurityFinding[] = [];

  for (const file of files) {
    for (const check of SECURITY_CHECKS) {
      for (const pattern of check.patterns) {
        const matches = file.content.match(pattern);
        if (matches) {
          findings.push({
            file: file.path,
            check: check.name,
            severity: check.severity,
            matches: matches,
            action: check.action,
          });
        }
      }
    }
  }

  const criticalFindings = findings.filter((f) => f.severity === 'critical');
  const warningFindings = findings.filter((f) => f.severity === 'warning');

  return {
    passed: criticalFindings.length === 0,
    criticalCount: criticalFindings.length,
    warningCount: warningFindings.length,
    findings,
    requiresHumanReview: warningFindings.length > 0,
  };
}
```

**Output:**

```typescript
interface SecurityCheckOutput {
  passed: boolean;
  criticalCount: number;
  warningCount: number;
  findings: SecurityFinding[];
  requiresHumanReview: boolean;
  scanDuration: number;
}
```

**Threshold:** Zero critical findings. Warnings require human acknowledgment.

---

### 2.8 Phase 8: VERIFY

**Objective:** Comprehensive verification of implementation.

**Protocol:** Parallel test execution

**Inputs:**

```typescript
interface VerifyInput {
  implementation: ImplementOutput;
  plan: RefineOutput['refinedPlan'];
}
```

**Verification Checks:**

| Check          | Command              | Threshold                  |
| -------------- | -------------------- | -------------------------- |
| Type checking  | `pnpm typecheck`     | Zero errors                |
| Linting        | `pnpm lint`          | Zero errors, zero warnings |
| Unit tests     | `pnpm test`          | All pass                   |
| Coverage       | `pnpm test:coverage` | >= 80%                     |
| Build          | `pnpm build`         | Success                    |
| Security audit | `pnpm audit`         | No high/critical           |

**Process:**

1. Run all checks in sequence (some depend on others)
2. Collect results and failures
3. If any fail: return to Phase 7 with specific errors
4. If all pass: proceed to Phase 9

**Output:**

```typescript
interface VerifyOutput {
  checks: {
    name: string;
    passed: boolean;
    output?: string;
    duration: number;
  }[];
  allPassed: boolean;
  coverage: number;
  failureReport?: string;
}
```

**Threshold:** All checks pass

---

### 2.9 Phase 9: COMMIT (Human Checkpoint)

**Objective:** Create PR and obtain final human approval.

**Protocol:** Git operations + Human-in-the-loop

**Inputs:**

```typescript
interface CommitInput {
  issue: AnalyzeOutput['selectedIssue'];
  implementation: ImplementOutput;
  verification: VerifyOutput;
}
```

**Git Operations:**

```bash
# 1. Create branch
git checkout -b feat/{{issueNumber}}-self-dev-{{timestamp}}

# 2. Stage changes
git add {{implementation.filesCreated}} {{implementation.filesModified}}

# 3. Commit
git commit -m "feat(self-dev): implement #{{issueNumber}}

{{plan.problemAnalysis}}

Changes:
{{implementation.filesModified.map(f => `- ${f}`).join('\n')}}

Verified by:
- TypeCheck: PASS
- Lint: PASS
- Tests: PASS (coverage: {{verification.coverage}}%)

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# 4. Push
git push -u origin HEAD

# 5. Create PR
gh pr create \
  --title "feat(self-dev): {{plan.title}}" \
  --body "{{PR_TEMPLATE}}" \
  --label "self-development"
```

**PR Template:**

```markdown
## Summary

Closes #{{issueNumber}}

This PR was generated by the nexus-agents self-development workflow.

### Changes

{{implementation.files}}

### Agent Consensus

- Approved by: {{voteResult.approvalCount}}/5 agents
- Human approved: {{reviewOutput.humanDecision}}

### Verification

- TypeCheck: PASS
- Lint: PASS
- Tests: PASS ({{verification.coverage}}% coverage)
- Build: PASS
- Security: PASS

### Self-Development Metrics

- Analysis time: {{metrics.analyzeTime}}ms
- Research time: {{metrics.researchTime}}ms
- Planning iterations: {{metrics.planIterations}}
- Refinement iterations: {{metrics.refineIterations}}
- Implementation iterations: {{metrics.implementIterations}}

---

Generated by nexus-agents Self-Development Workflow v1.0.0
```

**Human Action:**

- Review PR in GitHub
- Request changes if needed
- Merge when satisfied

**Output:**

```typescript
interface CommitOutput {
  branch: string;
  commitSha: string;
  prNumber: number;
  prUrl: string;
  status: 'created' | 'merged' | 'closed';
}
```

**Threshold:** Human merges PR

---

## 3. Error Handling

### 3.1 Phase-Level Retry

Each phase can retry up to 2 times before escalating:

```typescript
interface RetryConfig {
  maxRetries: 2;
  backoffMs: [5000, 15000]; // Exponential backoff
  retryableErrors: ['TIMEOUT', 'RATE_LIMITED', 'TRANSIENT_ERROR'];
}
```

### 3.2 Escalation Path

```
Phase Failure
    |
    v
[Retry 1] --> [Retry 2] --> [Escalate]
                              |
                              v
                         Human Intervention Required
```

### 3.3 Recovery Checkpoints

The workflow saves state at each phase completion:

```typescript
interface WorkflowCheckpoint {
  phase: number;
  timestamp: string;
  inputs: unknown;
  outputs: unknown;
  status: 'completed' | 'failed' | 'skipped';
}
```

Recovery can resume from any checkpoint.

---

## 4. Configuration

### 4.1 Default Configuration

```yaml
# self-development-workflow.yaml
name: self-development
version: 1.0.0
description: Meta-workflow for nexus-agents self-improvement

phases:
  analyze:
    protocol: adaptive
    timeout: 60000
    maxIssues: 20

  research:
    protocol: parallel
    timeout: 120000
    agents: 4

  plan:
    protocol: trinity
    maxIterations: 3
    timeout: 300000

  refine:
    protocol: reflexion
    maxIterations: 3
    severityThreshold: 0.3

  vote:
    protocol: consensus
    requiredVotes: 4
    timeout: 60000

  review:
    humanRequired: true
    timeout: 86400000 # 24 hours

  implement:
    protocols: [self-debug, self-refine]
    maxIterations: 5
    timeout: 600000

  verify:
    coverageThreshold: 80
    timeout: 300000

  commit:
    humanRequired: true
    createPR: true

voting:
  thresholds:
    bugfix: 0.5 # Simple majority
    enhancement: 0.8 # Supermajority
    architecture: 1.0 # Unanimous
    security: 0.8 # Supermajority + Security approve
    breaking: 0.8 # Supermajority + human approval
```

### 4.2 Protocol Selection Matrix

| Phase     | Task Type  | Selected Protocol        | Rationale                           |
| --------- | ---------- | ------------------------ | ----------------------------------- |
| Analyze   | Knowledge  | parallel                 | Factual analysis, no reasoning      |
| Research  | Knowledge  | parallel                 | Information gathering               |
| Plan      | Reasoning  | trinity                  | Complex planning needs verification |
| Refine    | Reasoning  | reflexion                | Multi-perspective critique          |
| Vote      | Consensus  | consensus                | Explicit voting requirement         |
| Implement | Code       | self-debug + self-refine | Error recovery + quality            |
| Verify    | Validation | parallel                 | Independent checks                  |

---

## 5. Metrics & Observability

### 5.1 Workflow Metrics

```typescript
interface WorkflowMetrics {
  // Timing
  totalDurationMs: number;
  phaseDurations: Record<string, number>;

  // Iterations
  trinityIterations: number;
  reflexionIterations: number;
  selfDebugIterations: number;
  selfRefineIterations: number;

  // Quality
  finalSeverity: number;
  testCoverage: number;

  // Consensus
  approvalRate: number;
  vetoCount: number;

  // Human
  humanReviewTime: number;
  humanRevisions: number;
}
```

### 5.2 Success Criteria

| Metric                   | Target | Acceptable |
| ------------------------ | ------ | ---------- |
| Workflow completion rate | > 90%  | > 75%      |
| First-pass approval rate | > 70%  | > 50%      |
| Average human revisions  | < 1.5  | < 3        |
| Test coverage            | >= 80% | >= 70%     |
| Verification pass rate   | 100%   | 100%       |

---

## 6. Future Extensions

### 6.1 Planned Improvements

1. **Continuous Self-Development**
   - Scheduled execution (daily/weekly)
   - Automatic issue triage
   - Priority queue management

2. **Learning from History**
   - Track successful patterns
   - Learn from rejections
   - Improve priority scoring

3. **Multi-Issue Parallelism**
   - Work on multiple issues concurrently
   - Dependency-aware scheduling
   - Resource allocation

4. **External CLI Integration**
   - Route specific tasks to Gemini/Codex
   - Leverage 1M context for large analysis
   - Use specialized models for code generation

### 6.2 Research Integration

| Paper            | Technique             | Integration Point   |
| ---------------- | --------------------- | ------------------- |
| arXiv:2512.04695 | TRINITY               | Phase 3 (Plan)      |
| arXiv:2512.20845 | Multi-Agent Reflexion | Phase 4 (Refine)    |
| arXiv:2303.17651 | Self-Refine           | Phase 7 (Implement) |
| arXiv:2304.05128 | Self-Debug            | Phase 7 (Implement) |
| arXiv:2502.19130 | Adaptive Selection    | Phase 1 (Analyze)   |

---

## 7. Implementation Notes

### 7.1 Required Components

All components exist in the codebase:

| Component                | Location                                             | Status      |
| ------------------------ | ---------------------------------------------------- | ----------- |
| TrinityCoordinator       | `agents/collaboration/trinity-coordinator.ts`        | Implemented |
| ConsensusProtocol        | `agents/collaboration/consensus-protocol.ts`         | Implemented |
| ReflexionProtocol        | `agents/collaboration/reflexion-protocol.ts`         | Implemented |
| SelfDebugProtocol        | `agents/collaboration/self-debug-protocol.ts`        | Implemented |
| SelfRefineProtocol       | `agents/collaboration/self-refine-protocol.ts`       | Implemented |
| AdaptiveProtocolSelector | `agents/collaboration/adaptive-protocol-selector.ts` | Implemented |

### 7.2 New Components Implemented

| Component             | Purpose                   | Status      | Location                                        |
| --------------------- | ------------------------- | ----------- | ----------------------------------------------- |
| SelfDevWorkflowEngine | Orchestrates all 9 phases | Implemented | `workflows/self-development/engine.ts`          |
| PhaseExecutors        | Execute each phase        | Implemented | `workflows/self-development/phase-executors.ts` |
| GitClient             | Git CLI operations        | Implemented | `workflows/self-development/git-client.ts`      |
| GitHubClient          | GitHub CLI operations     | Implemented | `workflows/self-development/github-client.ts`   |
| ShellExecutor         | Shell command execution   | Implemented | `workflows/self-development/shell-executor.ts`  |
| MetricsCalculator     | Workflow metrics          | Implemented | `workflows/self-development/metrics.ts`         |
| Types & Interfaces    | Type definitions          | Implemented | `workflows/self-development/types.ts`           |

### 7.2.1 Test Coverage

| Test File                | Tests  | Coverage                                   |
| ------------------------ | ------ | ------------------------------------------ |
| `engine.test.ts`         | 18     | Engine lifecycle, events, state management |
| `shell-executor.test.ts` | 12     | Shell execution, verification checks       |
| `git-client.test.ts`     | 22     | All git operations with mocked CLI         |
| `github-client.test.ts`  | 14     | All gh operations with mocked CLI          |
| `metrics.test.ts`        | 23     | Calculation, validation, reporting         |
| **Total**                | **89** | Self-development module coverage           |

### 7.3 Implementation Order

1. **Phase 1:** Implement SelfDevWorkflowEngine skeleton ✅ COMPLETE
2. **Phase 2:** Wire up existing protocols ✅ COMPLETE (async executors ready)
3. **Phase 3:** Add GitHub integration (gh CLI) ✅ COMPLETE
4. **Phase 4:** Implement human checkpoints 🔄 IN PROGRESS
5. **Phase 5:** Add metrics and observability ✅ COMPLETE
6. **Phase 6:** Testing and hardening ✅ COMPLETE (89 tests)

### 7.4 Improvement Validation (Required)

**All self-development changes MUST be validated improvements, not random changes.**

Before executing any code changes, baseline metrics are captured. After execution, the same metrics are measured and compared. Changes that cause regressions are automatically blocked.

#### Metrics Captured

| Metric            | Command              | Validation Rule   |
| ----------------- | -------------------- | ----------------- |
| Test Coverage     | `pnpm test:coverage` | Must not decrease |
| Test Count        | `pnpm test`          | Must not decrease |
| Lint Errors       | `pnpm lint`          | Must not increase |
| Type Errors       | `pnpm typecheck`     | Must not increase |
| Bundle Size       | `du -sb dist/`       | Max 5% increase   |
| Security Findings | `pnpm audit`         | Must not increase |

#### Validation Flow

```
1. BASELINE: Capture metrics before changes
2. EXECUTE: Apply code changes in sandbox
3. MEASURE: Capture metrics after changes
4. COMPARE: Check against validation thresholds
5. BLOCK/PROCEED: Regressions block merge, improvements proceed
```

#### Improvement Report

Every PR includes an improvement validation report:

```markdown
## Improvement Validation Report

| Metric        | Before | After | Delta | Status      |
| ------------- | ------ | ----- | ----- | ----------- |
| Test Coverage | 82.1%  | 84.2% | +2.1% | ✅ IMPROVED |
| Test Count    | 312    | 320   | +8    | ✅ IMPROVED |
| Lint Errors   | 0      | 0     | 0     | ✅ PASS     |
| Type Errors   | 0      | 0     | 0     | ✅ PASS     |
| Bundle Size   | 1.2MB  | 1.2MB | 0%    | ✅ PASS     |
| Security      | 0      | 0     | 0     | ✅ PASS     |

**Overall: VALIDATED IMPROVEMENT**
```

#### Regression Handling

If regressions are detected:

1. Execution halts before PR creation
2. Detailed regression report is generated
3. Rollback to checkpoint is automatic
4. Human is notified of regression details
5. Issue is flagged for manual resolution

---

## 8. Rate Limiting (Optional)

**Rate limiting is DISABLED by default.** Enable via configuration if needed.

The workflow trusts automated security gates (Docker sandbox, security scans, test verification) to prevent harmful changes. Rate limiting is available as an optional safety layer for specific deployment scenarios.

### 8.1 Configuration

```typescript
interface RateLimitConfig {
  enabled: boolean; // Default: false
  maxCyclesPerDay?: number; // Default: unlimited
  maxRetriesPerPhase?: number; // Default: 5
  cooldownAfterFailureMs?: number; // Default: 60000 (1 minute)
  maxFilesPerRun?: number; // Default: unlimited
  maxLinesPerRun?: number; // Default: unlimited
}

// Default configuration (rate limiting disabled)
const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  enabled: false,
  maxRetriesPerPhase: 5,
  cooldownAfterFailureMs: 60000,
};
```

### 8.2 Optional Limits (when enabled)

| Limit                  | Default   | Description                     |
| ---------------------- | --------- | ------------------------------- |
| Max cycles per 24h     | Unlimited | Set to limit daily runs         |
| Max retries per phase  | 5         | Prevent infinite retry loops    |
| Cooldown after failure | 1 minute  | Brief pause before retry        |
| Max files per run      | Unlimited | Set to limit blast radius       |
| Max lines per run      | Unlimited | Set to prevent massive rewrites |

### 8.3 When to Enable Rate Limiting

Consider enabling rate limiting if:

- Running in shared/production environment
- Multiple humans may trigger workflows
- Want additional guardrails beyond security gates
- Testing new protocol implementations

**Note:** Security is enforced by automated gates regardless of rate limiting. Rate limiting is purely for operational control.

---

## 9. Rollback Specification

**Detailed rollback procedures for automated commits:**

### 9.1 Pre-Run Checkpoint

Before Phase 7 (Implement) begins:

```bash
# Create checkpoint tag
git tag -a "self-dev/run-$(date +%Y%m%d-%H%M%S)/before" -m "Before self-dev run #{{runId}}"

# Record HEAD for instant rollback
echo "{{currentHead}}" > .self-dev/last-safe-head
```

### 9.2 Automatic Rollback Triggers

| Trigger                             | Action                            | Notification |
| ----------------------------------- | --------------------------------- | ------------ |
| Phase 8 (Verify) fails              | Auto-rollback to checkpoint       | Human alert  |
| Security check finds critical issue | Auto-rollback + block future runs | Human alert  |
| Container OOM/timeout               | Auto-rollback                     | Human alert  |
| Build failure after 3 retries       | Auto-rollback                     | Human alert  |

### 9.3 Rollback Procedure

```bash
# 1. Identify the checkpoint
CHECKPOINT=$(git tag -l "self-dev/run-*/before" | tail -1)

# 2. Reset to checkpoint
git reset --hard $CHECKPOINT

# 3. Clean up generated files
git clean -fd

# 4. Delete the failed branch
git branch -D feat/{{issueNumber}}-self-dev-{{timestamp}}

# 5. Log the rollback
echo "$(date): Rolled back to $CHECKPOINT due to: {{reason}}" >> .self-dev/rollback.log
```

### 9.4 Manual Rollback Commands

If human intervention is needed:

```bash
# List all self-dev checkpoints
git tag -l "self-dev/run-*/before"

# Rollback to specific checkpoint
git reset --hard self-dev/run-20260108-143022/before

# View what changed since checkpoint
git diff self-dev/run-20260108-143022/before HEAD

# Recover a mistakenly rolled-back file
git checkout HEAD~1 -- path/to/file.ts
```

---

## 10. Operational Runbook

### 10.1 Starting a Self-Development Run

**Prerequisites Checklist:**

- [ ] CLI adapters v2.3.0 stable (2-week soak complete)
- [ ] Docker available and running
- [ ] No pending workflow runs
- [ ] Rate limits not exceeded
- [ ] Human available for checkpoints

**Start Command:**

```bash
# Manual trigger (recommended)
nexus-agents self-dev --issue 123 --verbose

# Or via workflow
nexus-agents workflow run self-development --input.issue=123
```

### 10.2 Monitoring Active Runs

```bash
# Check current status
nexus-agents self-dev status

# View logs in real-time
tail -f .self-dev/logs/run-{{runId}}.log

# Check phase progress
nexus-agents self-dev phase --run={{runId}}
```

### 10.3 Human Checkpoint Procedures

**Phase 6 (Plan Approval):**

1. Review the plan summary presented
2. Check success criteria are measurable
3. Verify file list is reasonable
4. Respond: `yes`, `no`, or `revise`

**Phase 6.5 (Code Review):**

1. Review ALL generated code files
2. Complete security checklist
3. Verify code matches plan intent
4. Respond: `yes`, `no`, or `revise`

**Phase 9 (PR Merge):**

1. Review PR in GitHub
2. Run CI checks pass
3. Squash merge when satisfied

### 10.4 Intervention Procedures

**Pausing a Run:**

```bash
nexus-agents self-dev pause --run={{runId}}
```

**Aborting a Run:**

```bash
nexus-agents self-dev abort --run={{runId}} --reason="Manual abort by user"
```

**Forcing Rollback:**

```bash
nexus-agents self-dev rollback --run={{runId}} --to=checkpoint
```

### 10.5 Troubleshooting

| Symptom                    | Likely Cause                     | Resolution                    |
| -------------------------- | -------------------------------- | ----------------------------- |
| Workflow stuck at Phase 6  | Waiting for human                | Respond to checkpoint prompt  |
| Container keeps timing out | Generated code has infinite loop | Review code, fix manually     |
| Security check blocking    | Code has dangerous patterns      | Review findings, fix manually |
| Build keeps failing        | Dependency issue                 | Run `pnpm install` manually   |

---

## 11. PR Strategy (Milestone-Based)

Since there is a single developer, PRs serve as **milestone markers** for tracking progress and enabling rollback, not as blocking review gates.

### 11.1 PR Types

| Type             | Trigger                     | Auto-Merge | Description                                   |
| ---------------- | --------------------------- | ---------- | --------------------------------------------- |
| **Feature PR**   | Single issue implementation | Yes        | Auto-merged after all tests pass              |
| **Milestone PR** | Multiple issues complete    | Yes        | Groups related changes for easy tracking      |
| **Breaking PR**  | API changes                 | Notify     | Sends notification, auto-merges if tests pass |

### 11.2 Auto-Merge Rules

PRs auto-merge when:

1. All verification gates pass (typecheck, lint, test, build, security scan)
2. No security findings at CRITICAL level
3. Docker sandbox execution completed successfully

```typescript
interface AutoMergeConfig {
  enabled: true;
  requireAllChecks: true;
  allowedOnMain: true; // Single developer mode
  notifyOnMerge: true;
  deleteSourceBranch: true;
}
```

### 11.3 Milestone Grouping

Related changes are grouped into milestone PRs for easier tracking:

```
feat/self-dev-milestone-2026-01-08
├── Issue #142: Graph memory
├── Issue #143: Adaptive memory
└── Issue #144: Context pruning
```

Benefits:

- Single rollback point for related changes
- Cleaner git history
- Easier progress tracking

---

## 12. Notification System

Human receives notifications but is **never a blocker** after plan approval.

### 12.1 Notification Types

| Event                 | Channel       | Priority | Action Required      |
| --------------------- | ------------- | -------- | -------------------- |
| Plan ready for review | Console + Log | **High** | Approve/Reject plan  |
| Execution started     | Log           | Low      | None (informational) |
| Phase completed       | Log           | Low      | None (informational) |
| Security finding      | Console + Log | Medium   | Review finding       |
| Verification failed   | Console + Log | Medium   | Review failure       |
| PR created            | Console + Log | Low      | None (auto-merge)    |
| PR merged             | Console + Log | Low      | None (informational) |
| Rollback triggered    | Console + Log | **High** | Review rollback      |

### 12.2 Notification Format

```typescript
interface Notification {
  timestamp: string;
  runId: string;
  event: NotificationEvent;
  priority: 'low' | 'medium' | 'high';
  message: string;
  details?: Record<string, unknown>;
  actionRequired: boolean;
}

// Example notification
{
  "timestamp": "2026-01-08T14:30:22.123Z",
  "runId": "self-dev-20260108-143022",
  "event": "pr_merged",
  "priority": "low",
  "message": "PR #156 merged: feat(memory): implement adaptive priority scoring",
  "details": {
    "prNumber": 156,
    "issuesClosed": [143],
    "filesChanged": 8,
    "linesAdded": 412,
    "linesRemoved": 23
  },
  "actionRequired": false
}
```

### 12.3 Summary Reports

After each workflow run, a summary is logged:

```
═══════════════════════════════════════════════════════════════
  SELF-DEVELOPMENT RUN COMPLETE
═══════════════════════════════════════════════════════════════
  Run ID:     self-dev-20260108-143022
  Issue:      #143 - Implement adaptive memory
  Duration:   12m 34s

  PHASES:
  ✓ Analyze     (passed)
  ✓ Research    (passed)
  ✓ Plan        (passed, 2 iterations)
  ✓ Refine      (passed, 3 iterations)
  ✓ Vote        (4/5 approved)
  ✓ Review      (human approved)
  ✓ Generate    (passed)
  ✓ Implement   (passed, Docker sandbox)
  ✓ Security    (0 findings)
  ✓ Verify      (all tests pass)
  ✓ Commit      (PR #156 created)
  ✓ Merge       (auto-merged)

  FILES CHANGED: 8
  LINES: +412 / -23
  TEST COVERAGE: 84.2%

  Checkpoint: self-dev-checkpoint-143-20260108143022
═══════════════════════════════════════════════════════════════
```

---

## 13. Audit Trail

### 13.1 Log Format

All self-dev actions are logged to `.self-dev/logs/` with structured format:

```typescript
interface AuditLogEntry {
  timestamp: string;           // ISO 8601 format
  runId: string;               // Unique run identifier
  phase: number;               // Current phase (1-9)
  action: string;              // What happened
  actor: 'system' | 'agent' | 'human';
  details: Record<string, unknown>;
  duration?: number;           // Milliseconds
}

// Example entry
{
  "timestamp": "2026-01-08T14:30:22.123Z",
  "runId": "self-dev-20260108-143022",
  "phase": 7,
  "action": "docker_execution_started",
  "actor": "system",
  "details": {
    "container": "nexus-self-dev-abc123",
    "command": "pnpm typecheck && pnpm lint && pnpm test",
    "resourceLimits": { "memory": "512m", "cpus": "1.0" }
  }
}
```

### 13.2 Log Retention

| Log Type          | Retention | Location                 |
| ----------------- | --------- | ------------------------ |
| Run logs          | 90 days   | `.self-dev/logs/`        |
| Audit trail       | 1 year    | `.self-dev/audit/`       |
| Rollback logs     | Permanent | `.self-dev/rollback.log` |
| Security findings | Permanent | `.self-dev/security/`    |

### 13.3 Audit Queries

```bash
# View all runs for an issue
grep "issue.*123" .self-dev/audit/*.jsonl

# Find all security findings
jq 'select(.action | contains("security"))' .self-dev/audit/*.jsonl

# Find all human decisions
jq 'select(.actor == "human")' .self-dev/audit/*.jsonl

# Find all rollbacks
cat .self-dev/rollback.log
```

### 11.4 Compliance

The audit trail supports:

- **Traceability**: Every change can be traced to a decision
- **Accountability**: Human approvals are recorded with timestamps
- **Reproducibility**: Run configurations are logged for replay
- **Forensics**: Security incidents can be investigated

---

## 12. Approval

This specification requires multi-agent consensus before implementation:

| Agent     | Vote    | Notes |
| --------- | ------- | ----- |
| Architect | PENDING |       |
| Security  | PENDING |       |
| DevEx     | PENDING |       |
| AI/ML     | PENDING |       |
| PM        | PENDING |       |

**Threshold:** Supermajority (4/5) required for approval.

**Prerequisites verified:** All items in Prerequisites section must be completed before implementation begins.

---

_Specification created: 2026-01-08 (ET)_
_Revision: 2.0.0 - Added security safeguards and PM requirements_
_Protocol versions: TRINITY v1, Reflexion v1, Consensus v1_
_Target: nexus-agents v3.0.0 (blocked on v2.3.0 CLI stability)_
