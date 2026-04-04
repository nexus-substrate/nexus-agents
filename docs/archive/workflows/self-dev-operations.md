---
title: 'Self-Development Operations'
description: 'Error handling, configuration, metrics, and operational runbook for the self-development workflow'
tier: 2
keywords:
  - self-development
  - operations
  - error-handling
  - configuration
  - metrics
  - rollback
  - runbook
  - audit
---

# Self-Development Operations

Operational concerns for the self-development workflow. For the full workflow specification, see [SELF_DEVELOPMENT_WORKFLOW.md](./SELF_DEVELOPMENT_WORKFLOW.md).

---

## Error Handling

### Phase-Level Retry

```typescript
interface RetryConfig {
  maxRetries: number; // Default: 2
  backoffMs: number[]; // Default: [5000, 15000]
  retryableErrors: string[]; // Default: ['TIMEOUT', 'RATE_LIMITED', 'TRANSIENT_ERROR']
}
```

### Escalation Path

```
Phase Failure → Retry 1 (5s backoff) → Retry 2 (15s backoff) → Human Intervention
```

Non-retryable errors (e.g., `SECURITY_VIOLATION`, `INVALID_INPUT`) skip retries and escalate immediately.

### Recovery Checkpoints

```typescript
interface WorkflowCheckpoint {
  phase: number;
  timestamp: string; // ISO 8601, America/New_York
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  status: 'completed' | 'failed' | 'skipped';
}
```

Checkpoints are persisted after each phase completes, enabling resume-from-failure without re-running earlier phases.

---

## Configuration

### Default Config

```yaml
# self-development-workflow.yaml
workflow:
  name: self-development
  phases:
    analyze:
      enabled: true
      timeout: 120s
    research:
      enabled: true
      timeout: 300s
    plan:
      enabled: true
      timeout: 180s
    refine:
      enabled: true
      timeout: 120s
    vote:
      enabled: true
      timeout: 600s
      threshold: supermajority
    review:
      enabled: true
      timeout: 300s
      requireHumanApproval: true
    implement:
      enabled: true
      timeout: 900s
    verify:
      enabled: true
      timeout: 600s
    commit:
      enabled: true
      timeout: 60s

  voting:
    defaultThreshold: supermajority
    agentCount: 5
    architectureThreshold: supermajority
    breakingChangeThreshold: unanimous
    securityThreshold: supermajority
```

### Protocol Selection Matrix

| Phase     | Protocol      | Rationale                                  |
| --------- | ------------- | ------------------------------------------ |
| Analyze   | Single-agent  | Deterministic task decomposition           |
| Research  | Multi-agent   | Parallel source exploration                |
| Plan      | Single-agent  | Coherent plan requires single context      |
| Refine    | Consensus     | Multiple perspectives improve plan quality |
| Vote      | Consensus     | Formal approval gate                       |
| Review    | Human-in-loop | Safety checkpoint before implementation    |
| Implement | Single-agent  | Atomic code changes need single context    |
| Verify    | Multi-agent   | Parallel test + lint + typecheck           |
| Commit    | Single-agent  | Deterministic git operations               |

---

## Metrics & Observability

### WorkflowMetrics

```typescript
interface WorkflowMetrics {
  timing: {
    totalDurationMs: number;
    phaseDurationsMs: Record<string, number>;
    humanWaitMs: number;
  };
  iterations: {
    refinementCycles: number;
    retryCount: number;
    rollbackCount: number;
  };
  quality: {
    testCoverage: number;
    lintErrors: number;
    typeErrors: number;
    securityFindings: number;
  };
  consensus: {
    votesFor: number;
    votesAgainst: number;
    abstentions: number;
    threshold: string;
    passed: boolean;
  };
  human: {
    approvalsRequested: number;
    revisionsRequested: number;
    interventions: number;
  };
}
```

### Success Criteria

| Metric                 | Target | Measurement                          |
| ---------------------- | ------ | ------------------------------------ |
| Completion rate        | > 90%  | Workflows reaching commit phase      |
| First-pass approval    | > 70%  | Passing human review without changes |
| Avg human revisions    | < 1.5  | Revision requests per workflow run   |
| Test coverage          | >= 80% | Statement coverage of changed files  |
| Verification pass rate | 100%   | Build + test + lint + typecheck      |

---

## Rate Limiting

> **DISABLED by default.** The workflow trusts automated security gates (pre-commit hooks, CI checks, consensus voting) rather than imposing artificial rate limits.

```typescript
interface RateLimitConfig {
  enabled: boolean; // Default: false
  maxRunsPerHour: number; // Default: 10
  maxRunsPerDay: number; // Default: 50
  cooldownAfterFailureMs: number; // Default: 300000 (5 min)
}
```

### Optional Limits

| Limit                  | Default | Description                      |
| ---------------------- | ------- | -------------------------------- |
| `maxRunsPerHour`       | 10      | Prevent runaway automation loops |
| `maxRunsPerDay`        | 50      | Daily budget cap                 |
| `cooldownAfterFailure` | 5 min   | Pause after consecutive failures |
| `maxConcurrentRuns`    | 1       | Serialized execution             |

### When to Enable

- Running unattended for extended periods
- Operating against rate-limited external APIs
- During incident response (prevent cascading changes)

---

## Rollback Specification

### Pre-Run Checkpoint

Before any implementation begins:

```bash
git tag "self-dev-checkpoint-$(date +%s)" HEAD
CHECKPOINT_SHA=$(git rev-parse HEAD)
```

### Automatic Rollback Triggers

| Trigger                         | Action                                            |
| ------------------------------- | ------------------------------------------------- |
| Phase 8 (verify) failure        | Reset to checkpoint, log failure                  |
| Critical security finding       | Immediate rollback, notify human                  |
| OOM / timeout in implementation | Reset to checkpoint, retry with lower parallelism |
| Build failure after 3 retries   | Rollback, escalate to human                       |

### Rollback Procedure

```bash
# Identify checkpoint
CHECKPOINT=$(git tag -l 'self-dev-checkpoint-*' --sort=-creatordate | head -1)

# Reset
git reset --hard "$CHECKPOINT"

# Clean generated artifacts
git clean -fd

# Delete feature branch if created
git branch -D "feat/self-dev-${ISSUE_ID}" 2>/dev/null || true

# Log rollback
echo '{"event":"rollback","checkpoint":"'"$CHECKPOINT"'","reason":"...","timestamp":"'"$(TZ='America/New_York' date -Iseconds)"'"}' >> .self-dev-rollbacks.jsonl
```

### Manual Rollback Commands

```bash
nexus-agents self-dev --rollback                    # Rollback last run
nexus-agents self-dev --rollback --checkpoint TAG   # Rollback to specific tag
nexus-agents self-dev --rollback --dry-run          # Preview rollback
```

---

## Operational Runbook

### Starting

Prerequisites:

- [ ] Clean working tree (`git status` shows no changes)
- [ ] On `main` branch or designated feature branch
- [ ] Required API keys configured (see CLAUDE.md environment table)
- [ ] `pnpm install` and `pnpm build` pass

```bash
nexus-agents self-dev --issue 123
nexus-agents self-dev --issue 123 --dry-run    # Preview without executing
nexus-agents self-dev --issue 123 --skip-vote  # Skip consensus (sprint tasks only)
```

### Monitoring

```bash
nexus-agents self-dev --status                 # Current phase and progress
nexus-agents self-dev --logs                   # Streaming workflow logs
nexus-agents self-dev --logs --phase 5         # Logs for specific phase
nexus-agents self-dev --metrics                # Current metrics snapshot
```

### Human Checkpoint Procedures

**Phase 6 (Review):** Review the implementation plan. Approve, request revisions, or reject.

**Phase 6.5 (Security Review):** Triggered only when security-related changes are detected. Review findings before proceeding.

**Phase 9 (Commit):** Final approval before commit. Review diff, test results, and consensus outcome.

### Intervention

```bash
nexus-agents self-dev --pause                  # Pause after current phase
nexus-agents self-dev --abort                  # Abort and rollback
nexus-agents self-dev --abort --keep-changes   # Abort without rollback
nexus-agents self-dev --force-rollback         # Immediate rollback
```

### Troubleshooting

| Symptom               | Likely Cause              | Resolution                                  |
| --------------------- | ------------------------- | ------------------------------------------- |
| Stuck at Phase 6      | Awaiting human approval   | Check notifications, approve or reject      |
| Container timeout     | Long-running tests        | Increase `verify.timeout`, check test suite |
| Security blocking     | New dependency or pattern | Review finding, add allowlist or fix code   |
| Build failing         | Type errors from changes  | Check `--logs --phase 7`, fix type issues   |
| Consensus not reached | Agents disagree           | Review vote reasoning, refine proposal      |

---

## PR Strategy (Milestone-Based)

### PR Types

| Type      | Scope                | Merge Strategy | Human Action    |
| --------- | -------------------- | -------------- | --------------- |
| Feature   | Single issue/feature | Auto-merge     | None (CI gate)  |
| Milestone | Grouped related work | Auto-merge     | None (CI gate)  |
| Breaking  | API/behavior changes | Manual merge   | Notify + review |

### AutoMergeConfig

```typescript
interface AutoMergeConfig {
  enabled: boolean; // Default: true
  requiredChecks: string[]; // Default: ['ci', 'typecheck', 'lint', 'test']
  requiredApprovals: number; // Default: 0 (self-dev PRs)
  breakingChangePolicy: 'notify' | 'block'; // Default: 'notify'
}
```

### Milestone Grouping

Related issues are batched into a single PR when they share a milestone:

```
Milestone: "Routing Reliability v2"
├── #1530 Error reclassification
├── #1531 Transient retry defaults
└── #1533 Parse error retry
→ Single PR: "feat(routing): routing reliability v2 (#1530, #1531, #1533)"
```

---

## Notification System

### Notification Types

| Event               | Channel      | Priority | Action Required |
| ------------------- | ------------ | -------- | --------------- |
| Workflow started    | Log          | Low      | No              |
| Human review needed | Log + stdout | High     | Yes             |
| Consensus failed    | Log + stdout | High     | Yes             |
| Security finding    | Log + stdout | Critical | Yes             |
| Workflow completed  | Log + stdout | Medium   | No              |
| Rollback triggered  | Log + stdout | High     | Review          |

### Notification Interface

```typescript
interface Notification {
  event: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  actionRequired: boolean;
  context: Record<string, unknown>;
}
```

### Summary Reports

```
┌─────────────────────────────────────────┐
│ Self-Dev Workflow Summary               │
├─────────────────────────────────────────┤
│ Issue:    #123 - Add adaptive timeout   │
│ Status:   COMPLETED                     │
│ Duration: 12m 34s                       │
│ Phases:   9/9 passed                    │
│ Votes:    4/5 approve (supermajority)   │
│ Coverage: 87% (+3%)                     │
│ PR:       #456 (auto-merged)            │
└─────────────────────────────────────────┘
```

---

## Audit Trail

### AuditLogEntry

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: string;
  workflowRunId: string;
  phase: number;
  action: string;
  actor: 'agent' | 'human' | 'system';
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  decision: string;
  reasoning: string;
}
```

### Log Retention

| Log Type          | Retention | Location                    |
| ----------------- | --------- | --------------------------- |
| Workflow runs     | 90 days   | `.self-dev/runs/`           |
| Audit entries     | 1 year    | `.self-dev/audit/`          |
| Rollback records  | 1 year    | `.self-dev-rollbacks.jsonl` |
| Metrics snapshots | 30 days   | `.self-dev/metrics/`        |

### Audit Queries

```bash
# Recent workflow runs
jq -s 'sort_by(.timestamp) | reverse | .[0:10]' .self-dev/audit/*.jsonl

# Failed phases in last 7 days
jq 'select(.decision == "failed" and (.timestamp | fromdateiso8601) > (now - 604800))' .self-dev/audit/*.jsonl

# Human intervention frequency
jq 'select(.actor == "human")' .self-dev/audit/*.jsonl | jq -s 'group_by(.action) | map({action: .[0].action, count: length})'
```

### Compliance

- All agent decisions include reasoning traces
- Human approvals are logged with timestamp and reviewer identity
- Rollbacks preserve the original audit trail (append-only log)
- Security findings are cross-referenced with `.security-discoveries.jsonl`
