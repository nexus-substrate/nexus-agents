---
title: 'Self-Development Phases 1-6'
description: 'Phases 1-6 of the self-development workflow: from issue analysis through human review approval'
tier: 2
keywords: [self-development, phases, trinity, reflexion, consensus, analyze, research, plan]
---

# Self-Development Phases 1-6

Covers Phases 1-6 of the self-development meta-workflow: **Analyze**, **Research**, **Plan**, **Refine**, **Vote**, and **Review**. These phases take open GitHub issues through prioritization, context gathering, TRINITY-based planning, multi-persona refinement, consensus voting, and human approval before any code is generated.

For the full workflow overview and later phases, see [SELF_DEVELOPMENT_WORKFLOW.md](./SELF_DEVELOPMENT_WORKFLOW.md).

---

## Phase 1: ANALYZE

**Objective:** Analyze open GitHub issues and prioritize for implementation.

**Protocol:** AdaptiveProtocolSelector + Input Sanitization

### Security Gate: Issue Origin Verification

Only issues from authorized sources are processed. The repository owner must be the author and the issue must carry the `self-development-approved` label.

```typescript
const AUTHORIZED_AUTHORS = ['williamzujkowski'];

function verifyIssueOrigin(issue: GitHubIssue): boolean {
  if (!AUTHORIZED_AUTHORS.includes(issue.author)) return false;
  if (!issue.labels.includes('self-development-approved')) return false;
  return true;
}
```

### Security Gate: Input Sanitization

Issue content is validated via Zod schema. Titles and bodies are checked against `DANGEROUS_PATTERNS` (backticks, `$(...)`, pipes, redirects, `eval`, `exec`, `sudo`, `rm -rf`, `curl | exec`) and stripped of HTML tags.

```typescript
const IssueContentSchema = z.object({
  title: z
    .string()
    .max(200)
    .refine((val) => !DANGEROUS_PATTERNS.some((p) => p.test(val))),
  body: z
    .string()
    .max(10000)
    .refine((val) => !DANGEROUS_PATTERNS.some((p) => p.test(val))),
  labels: z.array(z.string()),
  author: z.string(),
});
```

### Inputs

```typescript
interface AnalyzeInput {
  repository: string;
  labels?: string[];
  excludeLabels?: string[];
  maxIssues?: number; // default: 20
  requireOwnerApproval: true;
}
```

### Process

1. Fetch open issues via `gh issue list`
2. Verify issue origin (reject unauthorized authors)
3. Sanitize issue content (strip dangerous patterns)
4. Spawn analysis agents to evaluate complexity (1-5), dependencies, alignment, and risk
5. Aggregate and rank by priority score

### Issue Selection Protocol v2

**Hard Gates:**

| Gate               | Rule                         | Rationale                          |
| ------------------ | ---------------------------- | ---------------------------------- |
| dependencies_clear | All blocking issues resolved | Cannot implement blocked work      |
| feasibility        | >= 2 (scale 1-5)             | Minimum viability threshold        |
| risk_for_auto      | <= 2 (scale 1-5)             | Autonomous work requires low risk  |
| security_sensitive | false OR human_approved      | Security changes need human review |

**Queue Router:**

| Condition                   | Queue           | Action                          |
| --------------------------- | --------------- | ------------------------------- |
| Has `security` label        | Security Review | Human approval required         |
| Has `breaking-change` label | Human Review    | Supermajority + user approval   |
| risk >= 3                   | Human Review    | Cannot auto-select              |
| Otherwise                   | Autonomous      | May proceed with WIS evaluation |

**Priority Score** (weights sum to 1.0, score range [0.0, 0.95]):

```typescript
const WEIGHTS = {
  alignment: 0.3,
  urgency: 0.2,
  feasibility: 0.2,
  learning_value: 0.15,
  recent_context: 0.1,
  risk_penalty: -0.05,
} as const;
```

### Outputs

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
  selectedIssue: number;
  selectionRationale: string;
}
```

---

## Phase 2: RESEARCH

**Objective:** Gather context, prior art, and relevant information for the selected issue.

**Protocol:** Parallel collaboration pattern

### Inputs

```typescript
interface ResearchInput {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  codebaseRoot: string;
}
```

### Research Agents (Parallel)

| Agent         | Focus Area                         | Tools               |
| ------------- | ---------------------------------- | ------------------- |
| CodebaseAgent | Existing implementations, patterns | Grep, Glob, Read    |
| ResearchAgent | arXiv papers, prior art            | WebSearch, WebFetch |
| DocsAgent     | Official documentation             | Read, WebFetch      |
| HistoryAgent  | Related PRs, closed issues         | gh CLI              |

### Process

1. Spawn 4 research agents in parallel, each exploring its focus area
2. Aggregate findings with deduplication
3. Identify relevant code patterns, research papers, breaking changes, and test patterns

### Outputs

```typescript
interface ResearchOutput {
  codebaseFindings: { relevantFiles: string[]; existingPatterns: string[]; interfaces: string[] };
  researchFindings: {
    papers: { arxivId: string; title: string; relevance: string }[];
    techniques: string[];
  };
  docFindings: { officialDocs: string[]; bestPractices: string[] };
  historyFindings: { relatedIssues: number[]; relatedPRs: number[]; previousAttempts: string[] };
  synthesizedContext: string;
}
```

---

## Phase 3: PLAN

**Objective:** Create detailed implementation plan using TRINITY protocol.

**Protocol:** TrinityCoordinator (Thinker/Worker/Verifier)

### Inputs

```typescript
interface PlanInput {
  issue: AnalyzeOutput['selectedIssue'];
  research: ResearchOutput;
}
```

### TRINITY Roles

| Role         | Responsibility                      | Output                             |
| ------------ | ----------------------------------- | ---------------------------------- |
| **Thinker**  | Analyze problem, define approach    | Problem analysis, success criteria |
| **Worker**   | Create detailed implementation plan | Step-by-step plan, file changes    |
| **Verifier** | Validate plan against criteria      | Pass/fail verdict, issues found    |

### Process

1. **Thinker:** Analyze issue and research context, define problem boundaries, establish success criteria, identify edge cases.
2. **Worker:** Create implementation plan (files, interfaces, test plan, migration steps). Address Thinker's success criteria.
3. **Verifier:** Check plan against criteria, validate feasibility, identify gaps. If FAIL: iterate with feedback.

```typescript
const trinityConfig: TrinityConfig = {
  maxIterations: 3,
  timeoutMs: 300000, // 5 minutes
  includeHistory: true,
};
```

### Outputs

```typescript
interface PlanOutput {
  problemAnalysis: string;
  successCriteria: string[];
  implementationPlan: {
    files: { path: string; action: 'create' | 'modify' | 'delete'; description: string }[];
    interfaces: string[];
    dependencies: string[];
    testPlan: string;
    migrationSteps?: string[];
  };
  verifierVerdict: 'pass' | 'fail';
  iterations: number;
}
```

**Threshold:** Verifier must pass (`verdict === 'pass'`).

---

## Phase 4: REFINE

**Objective:** Refine the plan using multi-persona criticism.

**Protocol:** ReflexionProtocol (multi-agent reflexion)

### Inputs

```typescript
interface RefineInput {
  plan: PlanOutput;
  research: ResearchOutput;
}
```

### Personas (Critics)

| Persona        | Focus                                  | Weight |
| -------------- | -------------------------------------- | ------ |
| **Architect**  | Design quality, patterns, modularity   | 0.25   |
| **Security**   | Security implications, vulnerabilities | 0.25   |
| **Tester**     | Testability, coverage, edge cases      | 0.20   |
| **DevEx**      | Usability, documentation, ergonomics   | 0.15   |
| **Maintainer** | Long-term maintenance, tech debt       | 0.15   |

### Process

Each persona critiques the plan; structured debate synthesizes critiques. If weighted severity > threshold, refine and iterate until convergence or max iterations.

```typescript
const reflexionConfig: ReflexionConfig = {
  maxIterations: 3,
  severityThreshold: 0.3,
  personas: SELF_DEV_PERSONAS,
  iterationTimeoutMs: 120000,
  requireConsensus: false,
};
```

### Outputs

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

**Threshold:** `finalSeverity < 0.3` or max iterations reached.

---

## Phase 5: VOTE

**Objective:** Achieve multi-agent consensus on the refined plan.

**Protocol:** ConsensusProtocol

### Inputs

```typescript
interface VoteInput {
  issue: AnalyzeOutput['selectedIssue'];
  plan: RefineOutput['refinedPlan'];
  critiques: RefineOutput['critiques'];
}
```

### Voting Agents

| Agent              | Expertise            | Veto Power                 |
| ------------------ | -------------------- | -------------------------- |
| **ArchitectAgent** | System design        | Yes (architecture changes) |
| **SecurityAgent**  | Security review      | Yes (security concerns)    |
| **QAAgent**        | Quality assurance    | No                         |
| **DevExAgent**     | Developer experience | No                         |
| **PMAgent**        | Project alignment    | No                         |

Vote options: `APPROVE`, `REJECT`, `ABSTAIN`.

### Consensus Thresholds

| Change Type         | Required Votes                   | Veto Override     |
| ------------------- | -------------------------------- | ----------------- |
| Bug fix             | Simple majority (>50%)           | No veto override  |
| Enhancement         | Supermajority (>=4/5)            | No veto override  |
| Architecture change | Unanimous (5/5)                  | N/A               |
| Security-related    | Supermajority + Security APPROVE | Security can veto |
| Breaking change     | Supermajority + user approval    | Requires Phase 6  |

### Outputs

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

---

## Phase 6: REVIEW (Human Checkpoint)

**Objective:** Obtain human approval before implementation.

**Protocol:** Human-in-the-loop

### Inputs

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

### Presentation Format

```markdown
## Self-Development Request: Issue #{{issueNumber}}

### Summary

{{plan.problemAnalysis}}

### Proposed Changes

{{plan.implementationPlan.files}}

### Agent Consensus

- Approve: {{voteResult.approvalCount}}/5 | Reject: {{voteResult.rejectCount}}/5
- Conditions: {{voteResult.votes.conditions}}

### Impact Assessment

- Files: {{estimatedImpact.filesChanged}} | Lines: +{{linesAdded}} / -{{linesRemoved}} | Risk: {{riskLevel}}

### Action Required

Do you approve this implementation? (yes/no/revise)
```

### Human Responses

- `yes` / `approve`: Proceed to implementation phases
- `no` / `reject`: Abort workflow, log reason
- `revise` / `changes`: Return to Phase 4 with feedback

### Outputs

```typescript
interface ReviewOutput {
  humanDecision: 'approved' | 'rejected' | 'revision_requested';
  feedback?: string;
  timestamp: string;
  reviewerId?: string;
}
```

**Threshold:** Human APPROVE required.
