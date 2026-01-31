# Agent Skills and Capability Management

**Hub:** Research on skill loading, assignment, and dependency management in multi-agent systems.

---

## Quick Navigation

| Document                                                                   | Purpose                                             | Audience                |
| -------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------- |
| **[SKILL_ASSIGNMENT_RESEARCH.md](./SKILL_ASSIGNMENT_RESEARCH.md)**         | Comprehensive research on skill assignment patterns | Architects, Researchers |
| **[Expert Selector](../../../architecture/AGENT_SYSTEM.md#expert-system)** | Current implementation (AGENT_SYSTEM.md)            | Developers              |
| **[Custom Experts Config](../../../../CLAUDE.md#expert-system)**           | How to define custom experts                        | Users                   |

---

## Research Summary

This topic directory contains research on how multi-agent systems assign capabilities to agents. Key research areas:

### 1. Static vs Dynamic Assignment

- **Static:** Built-in expert pool (`DEFAULT_EXPERTS`)
- **Dynamic:** Custom experts from `nexus-agents.yaml`
- **Current:** Hybrid approach combining both

### 2. Task-Driven Discovery

nexus-agents analyzes tasks to determine required capabilities, then selects best-matching experts:

```
Task → Analyze → Score Experts → Select Primary + Alternatives
```

See: `packages/nexus-agents/src/agents/experts/expert-selector.ts`

### 3. Role-Based Organization

Five built-in roles with specialized domains:

- `code` - Code generation and refactoring
- `security` - Vulnerability analysis
- `architecture` - System design
- `testing` - Test development
- `documentation` - Technical writing

### 4. Skill Dependency Management

Complex skills build on simpler ones. Research shows:

- Skills form directed acyclic graphs (DAGs)
- Prerequisites must be satisfied
- Circular dependencies cause failures

**Recommended pattern:** CASCADE framework for explicit dependency tracking.

---

## Key Findings

### nexus-agents Strengths

✓ Task-aware expert selection
✓ Configurable capability matching
✓ Support for custom experts
✓ Multi-factor scoring (capability + domain + weight)
✓ Collaboration pattern recommendations

### Improvement Opportunities

⚠ No formal skill dependency tracking
⚠ Exact capability matching (no semantic similarity)
⚠ Limited feedback on capability gaps
⚠ Flat role structure (no hierarchy)

---

## Related Research

### arXiv Papers

| Paper                             | Finding                                              | Relevance                       |
| --------------------------------- | ---------------------------------------------------- | ------------------------------- |
| CASCADE (2512.23880)              | Skill dependency management via meta-skills          | P1 recommendation               |
| ATLAS (2601.03872)                | Cluster-based skill routing with learned preferences | Alternative to current approach |
| MCP-Zero (2506.01056)             | Active capability gap identification                 | Gap detection feature           |
| EvoRoute (2601.02695)             | Pareto-optimal dynamic routing                       | Learning-based enhancement      |
| Role Representations (2312.04819) | Role hierarchy for better coordination               | Role hierarchy feature          |

---

## Implementation Recommendations

See full recommendations in **[SKILL_ASSIGNMENT_RESEARCH.md](./SKILL_ASSIGNMENT_RESEARCH.md)** Part 3.

### Priority 1: Skill Dependency Graph

**Status:** Not started
**Complexity:** Medium
**Value:** High

Add formal tracking of skill prerequisites and composite skills. Enables:

- Dependency resolution
- Circular dependency detection
- Prerequisite verification

**File:** `packages/nexus-agents/src/agents/experts/skill-dependencies.ts`

### Priority 2: Semantic Capability Matching

**Status:** Not started
**Complexity:** Medium
**Value:** Medium

Handle semantic similarity in capability names. Enables:

- Non-standard terminology matching
- Better expert selection
- More flexible task descriptions

**File:** Update `packages/nexus-agents/src/agents/experts/expert-selector.ts`

### Priority 3: Capability Gap Detection

**Status:** Not started
**Complexity:** Low
**Value:** Medium

Report missing capabilities and suggest solutions. Enables:

- Clear feedback on limitations
- Actionable guidance for users
- Monitoring of unmet needs

**File:** Update `packages/nexus-agents/src/agents/experts/expert-selector.ts`

### Priority 4: Role Hierarchy

**Status:** Not started
**Complexity:** Medium
**Value:** Low

Support role levels (junior/senior/lead). Enables:

- Better team composition
- Skill progression modeling
- Seniority-aware selection

**File:** Update `packages/nexus-agents/src/agents/experts/expert-selector-types.ts`

### Priority 5: Capability Documentation

**Status:** Not started
**Complexity:** Low
**Value:** Low

Document all capabilities with examples. Enables:

- Better discovery
- Clearer custom expert definition
- Knowledge base for capabilities

**File:** `docs/research/registry/capabilities.yaml`

---

## For Developers

### Quick Links

- **Expert Selector Code:** `/packages/nexus-agents/src/agents/experts/expert-selector.ts`
- **Custom Expert Loader:** `/packages/nexus-agents/src/cli/custom-expert-loader.ts`
- **Expert Definitions:** `/packages/nexus-agents/src/agents/experts/expert-defaults.ts`
- **Type Definitions:** `/packages/nexus-agents/src/agents/experts/expert-selector-types.ts`

### Key Functions

```typescript
// Main selection function
export function selectExperts(
  task: Task,
  registry: ExpertRegistry,
  options?: SelectionOptions
): Result<SelectionResult, SelectionError>;

// Quick selection with default registry
export function quickSelect(
  task: Task,
  options?: SelectionOptions
): Result<SelectionResult, SelectionError>;

// Load custom experts from config
export function loadCustomExperts(configPath?: string): CustomExpertLoadResult;
```

### Testing

Run tests with:

```bash
pnpm test -- expert-selector.test.ts
pnpm test -- custom-expert-loader.test.ts
pnpm test -- expert-list.test.ts
```

---

## For Users

### Defining Custom Experts

Edit `nexus-agents.yaml`:

```yaml
experts:
  builtin: true
  custom:
    rust_expert:
      name: 'Rust Expert'
      primaryDomain: code
      secondaryDomains: [security, architecture]
      capabilities:
        - code_generation
        - ownership_analysis
        - performance_optimization
      weight: 0.95
      available: true
```

### Viewing Available Experts

```bash
nexus-agents expert list
nexus-agents expert list --format json
nexus-agents expert list --format yaml
```

### Task-Specific Expert Selection

Tasks automatically select appropriate experts based on:

1. Domain analysis
2. Required capabilities
3. Complexity assessment
4. Your preference weights

No explicit configuration needed - describe your task naturally.

---

## Future Directions

Potential enhancements (beyond current roadmap):

1. **Learned Routing:** Machine learning models for expert selection
2. **Semantic Embeddings:** Vector similarity for capabilities
3. **Skill Trading:** Agents teaching skills to each other
4. **Capability Versioning:** Track capability evolution
5. **Cross-Domain Transfer:** Knowledge transfer between domains

---

## Status

**Last Updated:** 2026-01-22 (ET)
**Research Status:** Complete
**Implementation Status:** Pending prioritization vote
**Next Step:** Review SKILL_ASSIGNMENT_RESEARCH.md, vote on P1-P5 priorities
