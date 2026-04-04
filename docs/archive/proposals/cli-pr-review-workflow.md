# Proposal: CLI-Based PR Review Workflow

**Issue:** PR reviews using Claude API are incurring costs when CLI subscriptions are already paid for
**Goal:** Leverage Claude Max, Gemini CLI, and Codex CLI for PR reviews at zero marginal cost

## Current State

### API-Based Workflows (Costing Money)

1. **claude-review.yml** - Uses `anthropics/claude-code-action@v1`
   - Runs on every PR open/sync
   - Uses ANTHROPIC_API_KEY (pay-per-token)
   - Estimated: $0.27/PR (Sonnet), $1.35/PR (Opus)

2. **nexus-review.yml** - Uses nexus-agents multi-agent review
   - Uses ANTHROPIC_API_KEY and/or OPENAI_API_KEY
   - Multi-agent consensus adds overhead

### The OAuth Challenge

CLI tools (Claude, Gemini, Codex) use OAuth for authentication:

- Requires interactive browser login
- GitHub Actions runners are ephemeral - can't persist OAuth tokens
- No secure way to pass OAuth credentials to runners

## Proposed Options

### Option A: Self-Hosted Runner

**Summary:** Run a persistent machine with authenticated CLI tools

**Pros:**

- Automated (runs on every PR)
- Uses existing CLI subscriptions
- Full control over environment

**Cons:**

- Infrastructure overhead (machine must be always-on)
- Security responsibility (self-managed)
- Single point of failure

**Implementation:**

```yaml
# .github/workflows/cli-review.yml
jobs:
  review:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - run: claude -p "Review this PR..." | gh pr comment
```

---

### Option B: Local Developer Workflow (Recommended)

**Summary:** Developers run CLI review locally before merging

**Pros:**

- Zero infrastructure
- Uses developer's authenticated CLIs
- No API costs
- Developers control when to review
- Can use any/all CLI tools they have

**Cons:**

- Not automated (requires discipline)
- Must enforce via branch protection

**Implementation:**

1. Create `scripts/pr-review.sh` - wrapper for CLI review
2. Add `.github/workflows/check-review-label.yml` - verifies review happened
3. Update branch protection - require "cli-reviewed" label

```bash
# scripts/pr-review.sh
#!/bin/bash
PR_NUMBER=$1
gh pr diff $PR_NUMBER | claude -p "Review this diff for..."
gh pr edit $PR_NUMBER --add-label "cli-reviewed"
```

---

### Option C: Manual Comment Trigger

**Summary:** Developer triggers review by commenting `/review` on PR

**Pros:**

- Explicit control over when review runs
- Can run multiple times if needed
- No accidental cost from draft PRs

**Cons:**

- Still requires self-hosted runner OR local execution
- Extra step in workflow

---

### Option D: Webhook to Local Service

**Summary:** PR events trigger webhook to local service with CLI tools

**Pros:**

- Automated like GitHub Actions
- Uses local CLI authentication

**Cons:**

- Most complex setup
- Requires persistent local service
- Network exposure considerations

---

## Recommendation: Option B (Local Developer Workflow)

### Why Option B?

1. **Zero infrastructure** - No servers to maintain
2. **Zero cost** - Uses already-paid CLI subscriptions
3. **Full flexibility** - Developer chooses Claude, Gemini, or Codex
4. **Multi-model review** - Can run all three for thorough coverage
5. **Simple enforcement** - Branch protection + label check

### Proposed Workflow

```
Developer creates PR
    │
    ▼
CI runs (lint, test, build) ──► Must pass
    │
    ▼
Developer runs: pnpm review <PR#>
    │
    ├──► Claude CLI: Security + Architecture
    ├──► Gemini CLI: Large file analysis (if >100KB)
    └──► Codex CLI: Code quality + tests
    │
    ▼
Results posted as PR comment
Label "cli-reviewed" added
    │
    ▼
Branch protection verifies label
    │
    ▼
Merge enabled
```

### Files to Create/Modify

1. **scripts/review-pr.ts** - Main review script
2. **scripts/post-review.sh** - Posts results to GitHub
3. **.github/workflows/verify-review.yml** - Checks for label
4. **Disable/modify** claude-review.yml and nexus-review.yml
5. **Update branch protection** - Require "cli-reviewed" label

### Branch Protection Rules

```
Required status checks:
  - ci-success (existing)
  - review-verified (new)

Required labels before merge:
  - cli-reviewed

Dismiss stale reviews:
  - When new commits pushed (re-review required)
```

## Cost Comparison

| Approach               | Setup Cost   | Per-PR Cost | Monthly (50 PRs) |
| ---------------------- | ------------ | ----------- | ---------------- |
| Current API            | $0           | $0.27-1.35  | $13.50-67.50     |
| Option A (Self-hosted) | Machine cost | $0          | Machine cost     |
| **Option B (Local)**   | **$0**       | **$0**      | **$0**           |
| Option D (Webhook)     | Setup time   | $0          | Maintenance      |

## Migration Plan

### Phase 1: Create Local Review Tool

- Add `scripts/review-pr.ts` with CLI integration
- Test with Claude CLI locally

### Phase 2: Add Verification Workflow

- Create `verify-review.yml`
- Test label checking

### Phase 3: Update Branch Protection

- Add "cli-reviewed" label requirement
- Keep CI checks as-is

### Phase 4: Deprecate API Workflows

- Disable claude-review.yml (or make manual-trigger only)
- Keep nexus-review.yml for fallback (optional)

---

## Vote Request

**Proposal:** Implement Option B (Local Developer Workflow)

**Key decisions needed:**

1. Should we require review from multiple CLI tools or any one?
2. Should API workflows be disabled entirely or kept as fallback?
3. Should "cli-reviewed" label be auto-added or require manual confirmation?
