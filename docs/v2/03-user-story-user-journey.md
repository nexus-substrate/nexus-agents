# 03 — User Story & User Journey

---

## User Story

> As a developer using Claude Code, I want to describe a complex software task in natural language and have the system clarify ambiguities, propose a plan, execute it across multiple AI models, validate the results, and produce documented artifacts — so that I can complete work that would take hours manually in minutes, with confidence in the result.

---

## User Journey: Software Factory

### Stage 1: Intake

```
Developer: "Add authentication to the API using JWT tokens with refresh flow"

System: Analyzes request...
  - Task type: code_implementation
  - Complexity: complex
  - Ambiguity score: 0.72 (above threshold)
  - Required capabilities: code_expert, security_expert
```

**What happens internally:**

- MCP tool receives natural language input
- SharedTaskAnalyzer produces TaskAnalysisResult
- Ambiguity score exceeds threshold → clarification needed

### Stage 2: Elicitation (Clarification)

```
System: "I have some questions before proceeding:
  1. Which files or modules should this change affect?
  2. Should this be production-ready or a prototype?
  3. Do you want password-based auth, OAuth, or both?
  4. Should refresh tokens be stored in cookies or localStorage?"

Developer: "Production-ready. Password-based only.
  Affects src/api/ and src/middleware/. Refresh tokens in httpOnly cookies."
```

**What happens internally:**

- Capability gap detector confirms tools/experts are available
- Developer answers resolve ambiguities
- TaskContract updated with constraints: quality=production, scope=[src/api/, src/middleware/]

### Stage 3: Plan Proposal

```
System: "Here's my proposed plan:

  1. [security_expert] Review JWT implementation patterns and identify
     security requirements (OWASP JWT best practices)
  2. [code_expert] Implement JWT token generation + validation middleware
  3. [code_expert] Implement refresh token flow with httpOnly cookie storage
  4. [security_expert] Security review of implementation
  5. [testing_expert] Generate test suite for auth flows
  6. [code_expert] Fix any issues from review

  Estimated: 6 stages, ~3 model calls
  Policy gate: Security review must pass before tests

  Approve this plan? [y/n/modify]"

Developer: "y"
```

**What happens internally:**

- PlanContract generated with stages, dependencies, policy gates
- Plan presented for approval (explicit consent)
- Policy engine validates: no high-risk actions without approval ✓

### Stage 4: Execution

```
System: "Executing plan...

  [1/6] ✓ Security review complete — 4 requirements identified
        (JWT RS256, token expiry ≤15min, refresh rotation, CSRF protection)
  [2/6] ✓ JWT middleware implemented — src/middleware/auth.ts (142 lines)
  [3/6] ✓ Refresh flow implemented — src/api/auth.ts (98 lines)
  [4/6] ◉ Security review in progress...
  [4/6] ✗ Security review found 2 issues:
        - Missing CSRF token validation on refresh endpoint
        - Token expiry set to 60min (should be ≤15min)
  [4/6] → Policy gate: Issues must be resolved before proceeding
  [4a]  ✓ Fixed CSRF validation — added csrf middleware
  [4b]  ✓ Fixed token expiry — changed to 15min
  [4/6] ✓ Security re-review passed
  [5/6] ✓ Tests generated — 12 test cases covering auth flows
  [6/6] ✓ All tests passing

  ✓ Plan complete. 6 artifacts produced."
```

**What happens internally:**

- Pipeline runner executes stages in dependency order
- Graph super-steps run independent stages in parallel where possible
- Policy gate after security review blocks execution until issues resolved
- Bounded iteration: security review → fix → re-review limited to 2 cycles
- Each stage emits events (stage.started, stage.completed, artifact.created)
- Outcome recorded for routing feedback

### Stage 5: Closeout

```
System: "Summary:
  - Created: src/middleware/auth.ts, src/api/auth.ts, src/api/__tests__/auth.test.ts
  - Modified: src/api/router.ts (added auth middleware)
  - Security: JWT RS256, 15min expiry, refresh rotation, CSRF protection
  - Tests: 12 cases, all passing
  - Artifacts stored with provenance chain

  Shall I commit these changes?"
```

**What happens internally:**

- Validation stage checks all acceptance criteria
- Artifact store records all outputs with provenance
- TaskContract status → done
- Outcome → OutcomeStore for feedback loop

---

## Journey Variants

### Simple Task (No Clarification Needed)

```
Developer: "Fix the typo on line 42 of README.md — 'recieve' should be 'receive'"

System: [Ambiguity score: 0.1, Complexity: simple]
  → Sequential pattern, single stage, no plan approval needed
  → Fix applied, done.
```

### Architecture Decision (Consensus Required)

```
Developer: "Should we use Redis or PostgreSQL for session storage?"

System: [Task type: architecture, requires consensus]
  → Consensus vote with 5 agent perspectives
  → Each perspective argues with evidence
  → Result: "Redis recommended (4-1), rationale: ..."
```

### Ambiguous Request (High Clarification)

```
Developer: "Make the app faster"

System: [Ambiguity score: 0.95]
  → "This request is very broad. I need to understand:
     1. Which part of the app is slow?
     2. What's the current performance baseline?
     3. What's the target performance?
     4. Are there specific user-facing symptoms?"
```

---

## Key UX Principles

1. **Never execute without a plan.** Complex tasks always show a plan first.
2. **Ask, don't guess.** Ambiguous requests get clarification, not assumptions.
3. **Show progress, not internals.** Users see stage completion, not agent coordination details.
4. **Fail clearly.** When a stage fails, explain what failed and why. Offer options.
5. **Respect consent.** High-risk actions (repo-wide changes, security-sensitive ops) require explicit approval at the policy gate.
