---
title: 'Self-Development Validation & Implementation'
description: 'Improvement validation protocol and WIS (Value-Weighted Impact Score) framework for the self-development workflow'
tier: 2
keywords: [self-development, validation, improvement, wis, implementation, coverage, quality-gates]
---

# Self-Development Validation & Implementation

> Extracted from [SELF_DEVELOPMENT_WORKFLOW.md](./SELF_DEVELOPMENT_WORKFLOW.md). This document covers implementation details, validation gates, and the Value-Weighting (WIS) framework.

## Implementation Notes

### Required Components

| Component                | Location                | Status      |
| ------------------------ | ----------------------- | ----------- |
| TrinityCoordinator       | `agents/collaboration/` | Implemented |
| ConsensusProtocol        | `agents/collaboration/` | Implemented |
| ReflexionProtocol        | `agents/collaboration/` | Implemented |
| SelfDebugProtocol        | `agents/collaboration/` | Implemented |
| SelfRefineProtocol       | `agents/collaboration/` | Implemented |
| AdaptiveProtocolSelector | `agents/collaboration/` | Implemented |

### New Components

| Component             | Location                               | Status      |
| --------------------- | -------------------------------------- | ----------- |
| SelfDevWorkflowEngine | `workflows/self-development/engine.ts` | Implemented |
| PhaseExecutors        | `workflows/self-development/`          | Implemented |
| GitClient             | `workflows/self-development/`          | Implemented |
| GitHubClient          | `workflows/self-development/`          | Implemented |
| ShellExecutor         | `workflows/self-development/`          | Implemented |
| MetricsCalculator     | `workflows/self-development/`          | Implemented |
| Types                 | `workflows/self-development/`          | Implemented |

### Test Coverage

| Test File                | Tests  |
| ------------------------ | ------ |
| `engine.test.ts`         | 18     |
| `shell-executor.test.ts` | 12     |
| `git-client.test.ts`     | 22     |
| `github-client.test.ts`  | 14     |
| `metrics.test.ts`        | 23     |
| **Total**                | **89** |

### Implementation Order

1. Types and interfaces — ✅ COMPLETE
2. ShellExecutor and GitClient — ✅ COMPLETE
3. GitHubClient — ✅ COMPLETE
4. MetricsCalculator — ✅ COMPLETE
5. PhaseExecutors — ✅ COMPLETE
6. SelfDevWorkflowEngine — ✅ COMPLETE

## Improvement Validation Protocol

All changes MUST be validated improvements. Baseline metrics are captured before execution and compared after. No change merges without passing the gate hierarchy below.

### Tier 1: Hard Gates (PR Cannot Merge)

| Gate                  | Command / Check       | Threshold          |
| --------------------- | --------------------- | ------------------ |
| Tests                 | `pnpm test`           | All pass           |
| TypeCheck             | `pnpm typecheck`      | Zero errors        |
| Lint                  | `pnpm lint`           | Zero errors        |
| Security              | Security scan         | Zero critical/high |
| Cyclomatic Complexity | Per-function analysis | ≤10                |
| Cognitive Complexity  | Per-function analysis | ≤12                |
| Circular Dependencies | Dependency analysis   | Zero cycles        |

### Tier 1b: Tiered Coverage

| Path                    | Minimum Coverage |
| ----------------------- | ---------------- |
| `security/**`           | 100%             |
| `mcp/tools/**`          | 100%             |
| `agents/**`             | 85%              |
| `adapters/**`           | 85%              |
| `workflows/**`          | 85%              |
| `utils/**`, `config/**` | 75%              |

### Tier 2: Soft Gates

| Gate                  | Trigger     | Action                   |
| --------------------- | ----------- | ------------------------ |
| Coverage Decrease >2% | Delta check | Explanation required     |
| Bundle Size >5%       | Size check  | Justification required   |
| New Public API        | Export diff | Issue reference required |

Acceptable justifications:

- Removing dead code that was artificially inflating coverage
- Adding a dependency that increases bundle size but replaces custom code
- Public API addition tracked in a roadmap issue

### Tier 3: Value Tracking (>150 LOC)

Changes exceeding 150 lines of production code require:

- A WIS score calculation (see below)
- Documented impact assessment
- Reviewer sign-off on value justification

**Exemptions:** Trivial fixes (<10 LOC), generated code (schemas, configs), test-only files.

### Removed Metrics

| Former Metric       | Rationale for Removal                               |
| ------------------- | --------------------------------------------------- |
| Test count decrease | Meaningless — consolidating tests improves quality  |
| Lint error increase | Changed to hard zero gate; increase is impossible   |
| Tech debt ratio     | Undefined measurement; replaced by complexity gates |

### Validation Flow

```
1. BASELINE  → Capture metrics (coverage, complexity, bundle size, test count)
2. EXECUTE   → Apply changes on feature branch
3. MEASURE   → Re-capture all metrics post-change
4. COMPARE   → Diff baseline vs post-change for each tier
5. REPORT    → Generate improvement report (template below)
```

### Improvement Report Template

```markdown
## Improvement Report

### Tier 1: Hard Gates

- [ ] Tests: PASS / FAIL
- [ ] TypeCheck: PASS / FAIL
- [ ] Lint: PASS / FAIL
- [ ] Security: PASS / FAIL
- [ ] Cyclomatic Complexity: max=N (≤10)
- [ ] Cognitive Complexity: max=N (≤12)
- [ ] Circular Dependencies: 0

### Tier 1b: Coverage

- security/\*\*: N% (≥100%)
- mcp/tools/\*\*: N% (≥100%)
- agents/\*\*: N% (≥85%)
- adapters/\*\*: N% (≥85%)
- workflows/\*\*: N% (≥85%)
- utils+config/\*\*: N% (≥75%)

### Tier 2: Soft Gates

- Coverage delta: +/-N%
- Bundle size delta: +/-N%
- New public APIs: [list or none]
```

### Regression Handling

**Hard gate failure:** Halt pipeline → report failure details → rollback changes → notify maintainer.

**Soft gate failure:** PR created with `needs justification` label. Merge blocked until justification is added and reviewed.

## Value-Weighting Framework (WIS v2)

Dogfooded 2026-01-09. Approved unanimously by consensus vote.

### Category Weights

| Category           | Weight |
| ------------------ | ------ |
| Security           | 1.5    |
| Quality            | 1.2    |
| Performance        | 1.2    |
| DevEx              | 1.2    |
| Model Routing      | 1.1    |
| Capability         | 1.0    |
| Context Management | 1.0    |
| Coordination       | 0.95   |
| Efficiency         | 1.0    |
| Error Recovery     | 0.85   |
| Breaking Change    | 0.75   |

### Effort Calculation

```
Effort = (Hours + 6) × (1 + Complexity_Factor + Uncertainty_Factor)
```

The 6-hour floor accounts for context switching, review overhead, and CI time that every change incurs regardless of size.

| Complexity Level | Factor |
| ---------------- | ------ |
| Simple           | 0.0    |
| Moderate         | 0.3    |
| Complex          | 0.6    |
| Very Complex     | 1.0    |

| Uncertainty Level | Factor |
| ----------------- | ------ |
| Low               | 0.0    |
| Medium            | 0.2    |
| High              | 0.5    |

### Value Calculation

```
Value = Σ(Weight × Impact) × Reach × Urgency
```

**Impact Score** (per category, 0-10):

- 0 = No effect
- 1-3 = Minor improvement
- 4-6 = Moderate improvement
- 7-9 = Significant improvement
- 10 = Transformative

**Reach Multiplier** (0.5-2.0):

- 0.5 = Single module
- 1.0 = One subsystem
- 1.5 = Multiple subsystems
- 2.0 = Entire codebase

**Urgency Modifier** (0.8-1.5):

- 0.8 = Low priority, no deadline
- 1.0 = Normal priority
- 1.2 = Upcoming release dependency
- 1.5 = Blocking issue or security fix

### WIS Ratio and Thresholds

```
WIS = Value / Effort
```

| WIS Range | Decision |
| --------- | -------- |
| <0.5      | REJECT   |
| 0.5-0.8   | DEFER    |
| 0.8-1.5   | CONSIDER |
| 1.5-3.0   | APPROVE  |
| >3.0      | EXPEDITE |

### Worked Examples

**1. Security fix — Input sanitization bypass**

- Categories: Security (Impact 9 × Weight 1.5 = 13.5), Quality (7 × 1.2 = 8.4)
- Value = (13.5 + 8.4) × Reach 1.5 × Urgency 1.5 = **49.28**
- Effort = (4 + 6) × (1 + 0.3 + 0.2) = **15.0**
- **WIS = 3.04 → EXPEDITE**

**2. Caching layer — Speculative performance optimization**

- Categories: Performance (5 × 1.2 = 6.0), Efficiency (4 × 1.0 = 4.0)
- Value = (6.0 + 4.0) × Reach 1.0 × Urgency 0.8 = **8.0**
- Effort = (12 + 6) × (1 + 0.6 + 0.5) = **27.72**
- **WIS = 0.29 → REJECT**

**3. Refactor — Breaking API change for cleaner types**

- Categories: Quality (6 × 1.2 = 7.2), Breaking Change (8 × 0.75 = 6.0)
- Value = (7.2 + 6.0) × Reach 1.5 × Urgency 0.8 = **15.84**
- Effort = (16 + 6) × (1 + 0.6 + 0.5) = **40.04**
- **WIS = 0.39 → REJECT**

**4. CLI error messages — Better user-facing errors**

- Categories: DevEx (6 × 1.2 = 7.2), Quality (3 × 1.2 = 3.6)
- Value = (7.2 + 3.6) × Reach 1.0 × Urgency 1.0 = **10.8**
- Effort = (20 + 6) × (1 + 0.0 + 0.2) = **31.2**
- **WIS = 0.34 → DEFER**

### Quick Estimation

For changes under 4 hours, skip full WIS calculation:

- Fixes a bug or security issue → **APPROVE**
- Breaks an existing API → **Full WIS required**
- Adds tests or documentation → **APPROVE**
- Pure refactoring (no behavior change) → **CONSIDER**

## Future Extensions

- **Continuous Self-Development** — Scheduled runs, automatic issue triage, priority queue ordering by WIS score.
- **Learning from History** — Track WIS prediction accuracy over time, learn from rejected proposals to refine weights.
- **Multi-Issue Parallelism** — Execute independent improvements concurrently with conflict detection.
- **External CLI Integration** — Route implementation phases to Gemini/Codex via adaptive routing for cost-optimal execution.

### Research Integration

| arXiv Paper | Mapped Phase | Integration Point        |
| ----------- | ------------ | ------------------------ |
| TRINITY     | Plan         | TrinityCoordinator       |
| Reflexion   | Refine       | ReflexionProtocol        |
| Self-Refine | Implement    | SelfRefineProtocol       |
| Self-Debug  | Implement    | SelfDebugProtocol        |
| Adaptive    | Analyze      | AdaptiveProtocolSelector |
