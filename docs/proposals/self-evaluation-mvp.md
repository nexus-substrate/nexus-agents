# Amended Proposal: Self-Evaluation Protocol MVP

**Status**: IMPLEMENTED — Self-eval module at src/cli/self-eval.ts (amended after initial vote rejection)
**Date**: 2026-01-07

---

## Changes from Original Proposal

Based on voting feedback, this MVP addresses:

| Concern       | Original           | Amended                      |
| ------------- | ------------------ | ---------------------------- |
| Scope         | 6 phases, 5 roles  | 3 phases, 3 roles            |
| Evidence      | Trust agent claims | Require metric citations     |
| Debate bounds | Unlimited          | Max 2 rounds, 5 min timeout  |
| Thresholds    | 66% for all        | Tiered by criticality        |
| Output        | Full evaluation    | Summary + details on demand  |
| Target        | All components     | Adapters module only (pilot) |

---

## MVP Scope

### Phase 1: Component Scan (Automated)

- Scan `src/adapters/` directory only
- Extract: file count, line count, test coverage, complexity metrics
- Output: JSON inventory with actual metrics (not LLM estimates)

### Phase 2: Focused Evaluation (3 Agents)

Three evaluators with bounded scope:

| Role                 | Focus                                      | Time Limit |
| -------------------- | ------------------------------------------ | ---------- |
| **Code Quality**     | Maintainability, complexity, test coverage | 30s        |
| **Architecture Fit** | Interface compliance, coupling             | 30s        |
| **Practical Value**  | Usage frequency, utility                   | 30s        |

Each agent produces:

```typescript
interface EvaluationResult {
  component: string;
  recommendation: 'retain' | 'refactor' | 'deprecate';
  confidence: number; // 0-1
  evidence: string[]; // Must reference actual metrics
  concerns: string[];
}
```

### Phase 3: Simple Aggregation

- Majority vote determines recommendation
- Dissenting views preserved in output
- **No debate phase in MVP** - collect data on disagreements instead

---

## Security Mitigations

### Tiered Voting Thresholds

| Component Criticality | Deprecation Threshold |
| --------------------- | --------------------- |
| Security-critical     | Unanimous (3/3)       |
| Core functionality    | Supermajority (3/3)   |
| Utilities             | Simple majority (2/3) |

### Evidence Requirements

- All claims must cite metrics from Phase 1
- Unsupported claims marked and discounted
- Evaluation includes `evidence_quality` score

### Bounded Execution

- 2-minute total timeout for full evaluation
- No recursive agent spawning
- Output size capped at 10KB

---

## Developer Experience

### Summary Mode (Default)

```
Component: claude-adapter.ts
Recommendation: RETAIN
Confidence: 0.87
Summary: Well-tested (92% coverage), clean interfaces, actively used.
[Expand for details]
```

### Detailed Mode (On Demand)

Full evaluation output available via `--verbose` flag.

### Audit Trail

```typescript
interface AuditEntry {
  timestamp: Date;
  agent: string;
  claim: string;
  evidence: string | null;
  verified: boolean;
}
```

---

## Success Criteria

1. **Accuracy**: Recommendations match human review ≥80% of the time
2. **Efficiency**: Full scan completes in <2 minutes
3. **Actionability**: Developers can understand output without training

---

## Implementation Effort

| Component             | Estimate     |
| --------------------- | ------------ |
| Component scanner     | 2-3 hours    |
| Evaluation agents (3) | 4-6 hours    |
| Aggregation logic     | 2-3 hours    |
| CLI integration       | 2-3 hours    |
| Tests                 | 4-6 hours    |
| **Total**             | ~15-20 hours |

---

## What We Learn

This MVP validates:

1. Can agents produce useful component evaluations?
2. Do recommendations align with human judgment?
3. Is the 3-agent model sufficient or do we need more roles?
4. What types of disagreements occur?

If successful, extend to full protocol. If not, we've limited investment.

---

## Comparison to Alternatives (PM Feedback)

| Alternative           | Limitation                             |
| --------------------- | -------------------------------------- |
| Static analysis only  | Misses architectural concerns, context |
| Periodic human review | Doesn't scale, inconsistent            |
| Unused code detection | Only finds dead code, not poor code    |

The MVP complements these tools - it adds reasoning about _why_ code should change, not just _what_ to change.
