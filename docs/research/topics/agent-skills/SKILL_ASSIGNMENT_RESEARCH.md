# Agent Skill Loading and Assignment: Research & Recommendations

**Date:** 2026-01-22 (ET)
**Classification:** Research Summary
**Status:** Complete
**Primary Focus:** Static vs Dynamic Skill Assignment Patterns in Multi-Agent Systems

---

## Executive Summary

This research synthesizes recent (2024-2026) academic findings on agent skill loading and assignment with analysis of nexus-agents' current implementation. Key finding: **nexus-agents successfully uses task-driven dynamic routing**, but can improve through explicit skill dependency graphs and semantic capability matching.

### Key Recommendations

1. **Implement skill dependency tracking** (CASCADE pattern) - High value, moderate effort
2. **Enhance semantic capability routing** (MCP-Zero pattern) - Aligns with current expert selector
3. **Add explicit skill discovery protocol** - Supports runtime agent adaptation
4. **Formalize role-based skill grouping** - Better organization for 10+ custom experts

---

## Part 1: Research Findings

### 1.1 Static vs Dynamic Skill Assignment Tradeoffs

#### Static Assignment (Compile-Time)

**Pattern:** Skills predefined in agent configuration, fixed at initialization.

| Aspect             | Benefit                                | Drawback                               |
| ------------------ | -------------------------------------- | -------------------------------------- |
| **Predictability** | Deterministic behavior                 | Cannot adapt to novel tasks            |
| **Performance**    | No discovery overhead                  | Wastes capabilities on simple tasks    |
| **Debugging**      | Clear audit trail                      | Limited to pre-configured combinations |
| **Scale**          | Efficient for small pools (<5 experts) | Configuration explosion at scale       |

**Current nexus-agents usage:** Built-in experts registry (`DEFAULT_EXPERTS` in expert-selector.ts)

```typescript
// Static pool (5 built-in experts)
const experts = [
  { id: 'code', domain: 'code', capabilities: [...] },
  { id: 'security', domain: 'security', capabilities: [...] },
  { id: 'architecture', domain: 'architecture', capabilities: [...] },
  { id: 'testing', domain: 'testing', capabilities: [...] },
  { id: 'documentation', domain: 'documentation', capabilities: [...] }
];
```

#### Dynamic Assignment (Runtime)

**Pattern:** Skills selected/loaded at task time based on requirements.

| Aspect            | Benefit                           | Drawback                         |
| ----------------- | --------------------------------- | -------------------------------- |
| **Adaptability**  | Handles novel domain combinations | Potential latency from discovery |
| **Scalability**   | Supports unlimited expert pool    | Complex state management         |
| **Customization** | Task-specific expert selection    | Validation overhead              |
| **Efficiency**    | Only loads required capabilities  | May select suboptimal experts    |

**Current nexus-agents usage:** Custom expert loading from `nexus-agents.yaml`

```typescript
// Dynamic pool with validation
const customResult = loadCustomExperts(configPath);
// Runtime Zod validation ensures type safety
```

#### Hybrid Recommendation (Current nexus-agents Architecture)

**Optimal approach:** Static pool for built-ins + Dynamic customization layer

- **Tier 1 (Static):** Built-in expert registry, always available
- **Tier 2 (Dynamic):** Custom experts loaded from config at startup
- **Tier 3 (Discovery):** Runtime capability matching via semantic routing

**Benefit:** Reliability of static with extensibility of dynamic.

---

### 1.2 Role-Based Skill Assignment Patterns

#### Pattern: Hierarchical Role Organization

```typescript
// Current nexus-agents structure
type AgentRole = 'code' | 'security' | 'architecture' | 'testing' | 'documentation';

// Expert definition includes:
interface ExpertDefinition {
  id: string;
  role: AgentRole; // Primary responsibility
  primaryDomain: TaskDomain; // Main competency
  secondaryDomains: TaskDomain[]; // Secondary areas
  capabilities: string[]; // Specific skills
}
```

**Research Finding (arXiv:2312.04819 - Attention-Guided Contrastive Role Representations):**

Multi-agent systems benefit from "behavior heterogeneity" through specialized roles. The study shows:

- Agents with distinct role representations coordinate more effectively
- Knowledge transfer occurs across roles via shared capability layers
- Teams maintain "skillful coordination" when roles have clear boundaries

**nexus-agents Implementation:**

- ✓ Clear role boundaries (code, security, architecture, testing, docs)
- ✓ Secondary domain support for cross-domain expertise
- ✓ Capability matching within roles
- ⚠ Could formalize role hierarchies (e.g., "senior code reviewer" > "junior coder")

#### Recommended Enhancement: Role Hierarchy

```yaml
# Proposed nexus-agents.yaml extension
roles:
  code:
    hierarchy: [junior, senior, lead]
    required_capabilities: [code_generation, refactoring]
    secondary_domains: [testing, security]

  security:
    hierarchy: [analyst, auditor, architect]
    required_capabilities: [vulnerability_analysis, threat_modeling]
    secondary_domains: [architecture, code]
```

---

### 1.3 Task-Driven Skill Discovery

#### Current Implementation: Task Analysis → Skill Selection

nexus-agents' `expert-selector.ts` implements a sophisticated task-driven approach:

```
Task Input
  ↓
analyzeTask() → TaskAnalysisResult
  ├─ domain detection
  ├─ required capabilities extraction
  ├─ complexity assessment
  ├─ secondary domains identification
  ↓
scoreExperts()
  ├─ calculateCapabilityScore (matches requirements)
  ├─ calculateDomainScore (domain alignment)
  ├─ calculateFinalScore (weighted combination)
  ↓
selectExperts() → SelectionResult
  ├─ primary expert selection
  ├─ alternative suggestions
  └─ collaboration pattern recommendation
```

#### Research Alignment: MCP-Zero Pattern (arXiv:2506.01056)

**Key Finding:** Rather than passive tool selection from predefined sets, agents benefit from "active capability gap identification."

MCP-Zero approach:

1. Agent analyzes task requirements
2. Agent identifies capability gaps
3. Agent searches for matching tools/skills
4. Agent requests missing capabilities

**nexus-agents Alignment:**

- ✓ Analyzes task requirements in detail
- ✓ Scores experts against requirements
- ⚠ Doesn't explicitly identify "gaps" (missing capabilities)
- ⚠ No fallback mechanism for truly novel tasks

#### Recommended Enhancement: Capability Gap Detection

```typescript
interface CapabilityGap {
  required: string[]; // Capabilities needed
  available: string[]; // What experts can provide
  gap: string[]; // Unmet requirements
  severity: 'critical' | 'medium' | 'low';
  suggestions: string[]; // How to address gap
}

// Implement gap detection
function identifyCapabilityGaps(
  analysis: TaskAnalysisResult,
  experts: ExpertDefinition[]
): CapabilityGap {
  const available = new Set(experts.flatMap((e) => e.capabilities));
  const gap = analysis.requiredCapabilities.filter((cap) => !available.has(cap));
  return { gap /* ... */ };
}
```

---

### 1.4 Skill Dependency Management

#### Research: CASCADE Framework (arXiv:2512.23880)

**Problem:** Agents need to "master complex external tools and codify knowledge" while maintaining reusable skill libraries.

**Solution:** Two meta-skills for dependency management:

1. **Continuous Learning:**
   - Web search for new capabilities
   - Code extraction from examples
   - Integration with existing skills

2. **Self-Reflection:**
   - Introspection of tool relationships
   - Knowledge graph exploration
   - Dependency mapping

**Key Insight:** Skills should form a directed acyclic graph (DAG) where:

- Prerequisite skills must be available
- Complex skills build on simpler ones
- Circular dependencies are prevented

#### nexus-agents Dependency Graph Pattern

```yaml
# Proposed docs/research/registry/skill-dependencies.yaml
skill_dependencies:
  code_generation:
    prerequisites: [] # Base skill, no prerequisites
    composite_skills:
      - refactoring # Builds on code generation
      - optimization # Builds on code generation

  code_review:
    prerequisites:
      - code_generation # Must understand code first
    composite_skills:
      - security_review # Code review + security knowledge
      - performance_review # Code review + performance knowledge

  full_code_audit:
    prerequisites:
      - code_review
      - security_review
      - performance_review
```

#### Recommended Implementation: Dependency Resolution

```typescript
interface SkillDependency {
  skillId: string;
  prerequisites: string[];
  weight: number; // 0-1, importance of prerequisite
}

function resolveSkillDependencies(
  skillId: string,
  registry: ExpertRegistry
): Result<string[], DependencyError> {
  const visited = new Set<string>();
  const resolved: string[] = [];

  function dfs(id: string): Result<void, DependencyError> {
    if (visited.has(id)) {
      return err(new DependencyError(`Circular dependency: ${id}`));
    }
    visited.add(id);

    const deps = registry.getDependencies(id);
    for (const dep of deps) {
      const result = dfs(dep.skillId);
      if (!result.ok) return result;
      resolved.push(dep.skillId);
    }
    resolved.push(id);
    return ok(undefined);
  }

  const result = dfs(skillId);
  return result.ok ? ok(resolved) : err(result.error);
}
```

---

### 1.5 Comparison with Other Agent Frameworks

#### Framework Comparison Matrix

| Framework                       | Skill Loading             | Assignment            | Dependency                 | Semantic Discovery      |
| ------------------------------- | ------------------------- | --------------------- | -------------------------- | ----------------------- |
| **nexus-agents**                | Hybrid (static + dynamic) | Task-driven           | Manual config              | Task analyzer + scoring |
| **AutoGen (v0.2+)**             | Dynamic registry          | Function availability | Via function signatures    | Keyword matching        |
| **LangChain Agents**            | Chain-based tools         | LLM decision          | Implicit (tool call graph) | Description-based       |
| **ATLAS (arXiv:2601.03872)**    | Cluster-based             | Multi-step routing    | RL-learned preferences     | Vector similarity       |
| **EvoRoute (arXiv:2601.02695)** | Dynamic pool              | Pareto optimization   | Cost + accuracy tradeoff   | Experience learning     |

**nexus-agents Strengths:**

- ✓ Explicit task analysis before selection
- ✓ Configurable capability weights
- ✓ Collaboration pattern recommendations
- ✓ Supports both built-in and custom experts

**Gaps vs SOTA:**

- ⚠ No learned routing (vs EvoRoute's RL)
- ⚠ No semantic embeddings (vs ATLAS's vector similarity)
- ⚠ No explicit dependency DAG (vs CASCADE)

---

## Part 2: Nexus-Agents Current Architecture Analysis

### 2.1 Expert Selector Design

#### File: `/packages/nexus-agents/src/agents/experts/expert-selector.ts`

**Architecture:**

```
┌─────────────────────────────────────────────────┐
│ selectExperts(task, registry, options)          │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ 1. validateOptions(options)              │   │
│  │    - Zod schema validation               │   │
│  │    - Rejects invalid min/max scores      │   │
│  └──────────────────────────────────────────┘   │
│                 ↓                                │
│  ┌──────────────────────────────────────────┐   │
│  │ 2. analyzeTask(task)                     │   │
│  │    - Domain detection                    │   │
│  │    - Capability requirement extraction   │   │
│  │    - Complexity assessment               │   │
│  │    - Confidence scoring                  │   │
│  └──────────────────────────────────────────┘   │
│                 ↓                                │
│  ┌──────────────────────────────────────────┐   │
│  │ 3. getFilteredExperts(registry)          │   │
│  │    - Apply excludeExperts filter         │   │
│  │    - Only available experts              │   │
│  └──────────────────────────────────────────┘   │
│                 ↓                                │
│  ┌──────────────────────────────────────────┐   │
│  │ 4. scoreAndSortExperts(experts, analysis)│   │
│  │    - calculateCapabilityScore (40%)      │   │
│  │    - calculateDomainScore (40%)          │   │
│  │    - applyExpertWeight (20%)             │   │
│  │    - Sort by final score DESC            │   │
│  └──────────────────────────────────────────┘   │
│                 ↓                                │
│  ┌──────────────────────────────────────────┐   │
│  │ 5. filterByMinScore(matches)             │   │
│  │    - Apply min_score threshold           │   │
│  │    - Return empty or all if no match     │   │
│  └──────────────────────────────────────────┘   │
│                 ↓                                │
│  ┌──────────────────────────────────────────┐   │
│  │ 6. shouldCollaborate(analysis)           │   │
│  │    - High complexity detection           │   │
│  │    - Multi-domain analysis               │   │
│  │    - Suggest collaboration pattern       │   │
│  └──────────────────────────────────────────┘   │
│                 ↓                                │
│  ┌──────────────────────────────────────────┐   │
│  │ 7. buildSelectionResult()                │   │
│  │    - Primary expert                      │   │
│  │    - Alternatives (up to maxAlternatives)│   │
│  │    - Collaboration recommendation        │   │
│  │    - Confidence calculation              │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Scoring Algorithm (Line 167-194):**

```typescript
finalScore = (capabilityScore × 0.4) + (domainScore × 0.4) + (expertWeight × 0.2)
```

**Weights:**

- `CAPABILITY_WEIGHT = 0.4` - What skills match
- `DOMAIN_WEIGHT = 0.4` - Domain expertise alignment
- `EXPERT_WEIGHT = 0.2` - Expert weight (configurable per expert)

**Strengths:**

- ✓ Multi-factor scoring prevents dominance of single factor
- ✓ Configurable capability weights allow task-specific tuning
- ✓ Expert weight parameter enables importance ranking
- ✓ Domain scoring includes secondary domains

**Opportunities:**

- ⚠ Linear scoring (TOPSIS multi-criteria would be more sophisticated)
- ⚠ No learned weights (vs EvoRoute's adaptive routing)
- ⚠ Capability matching is binary (has/doesn't have, no partial credit)

---

### 2.2 Custom Expert Loading

#### File: `/packages/nexus-agents/src/cli/custom-expert-loader.ts`

**Pattern:** Runtime configuration-based expert discovery

```
nexus-agents.yaml (user config)
  ├─ experts.custom.rust_expert
  ├─ experts.custom.security_auditor
  └─ ...
  ↓
loadCustomExperts(configPath)
  ├─ resolveConfigPath() - Security validation
  ├─ readConfigContent() - File I/O with error handling
  ├─ parseYaml() - YAML parsing
  ├─ extractRawExpertConfig() - Type extraction
  └─ processCustomExperts() - Zod validation + processing
  ↓
CustomExpertLoadResult
  ├─ experts: ExpertDefinition[]
  ├─ errors: CustomExpertError[]
  └─ configPath: string | undefined
```

**Validation (expert-expert-validation.ts):**

```typescript
const CustomExpertSchema = z.object({
  name: z.string().max(64),
  description: z.string().max(1024),
  primaryDomain: z.enum([
    'code',
    'security',
    'architecture',
    'testing',
    'documentation',
    'general',
  ]),
  secondaryDomains: z.array(z.string()).optional(),
  capabilities: z.array(z.string()),
  weight: z.number().min(0).max(1).optional(),
  available: z.boolean().optional(),
  // ... additional fields
});
```

**Security Model:**

- ✓ Path traversal prevention (resolveConfigPath validates root)
- ✓ Zod runtime validation at boundary
- ✓ No execution of arbitrary code
- ⚠ YAML parsing could be exploited if config untrusted (not critical in this context)

**Configuration Example:**

```yaml
experts:
  builtin: true
  custom:
    rust_expert:
      name: 'Rust Expert'
      description: 'Specializes in memory-safe systems programming'
      primaryDomain: code
      secondaryDomains: [security, architecture]
      capabilities:
        - code_generation
        - ownership_analysis
        - performance_optimization
      weight: 0.95
      available: true
```

---

### 2.3 Expert List Command

#### File: `/packages/nexus-agents/src/cli/expert-list.ts`

**Purpose:** Query available experts (built-in + custom)

**Output Formats:**

- `table` - Human-readable table with ANSI colors
- `json` - Structured JSON (CI/CD friendly)
- `yaml` - YAML format (config-like output)

**Data Flow:**

```
expertListCommand(options)
  ├─ runExpertList(options)
  │  ├─ Load built-in experts (DEFAULT_EXPERTS)
  │  ├─ Load custom experts (loadCustomExperts)
  │  ├─ Collect validation errors
  │  └─ Return ExpertListResult
  │
  └─ printExpertListResult(result, options)
     ├─ Format output (table/json/yaml)
     ├─ Display validation errors if any
     └─ Exit code (0 = success, 1 = errors found)
```

**Example Output:**

```
Built-in Experts:
┌──────────────┬────────────────────────────────────┬──────────┐
│ Name         │ Domain                             │ Tier     │
├──────────────┼────────────────────────────────────┼──────────┤
│ code         │ Code generation and refactoring    │ balanced │
│ security     │ Security analysis and hardening    │ powerful │
│ architecture │ System design patterns             │ powerful │
│ testing      │ Test development                   │ balanced │
│ documentation│ Technical documentation            │ balanced │
└──────────────┴────────────────────────────────────┴──────────┘
```

---

## Part 3: Recommendations for Nexus-Agents

### 3.1 Priority 1: Skill Dependency Graph (P1 - High Impact, Medium Effort)

**Problem:** No formal way to express that one skill builds on another.

**Example Use Case:**

```
Task: "Conduct comprehensive security audit"
┌─────────────────────────────┐
│ security_audit (requires)   │
├─────────────────────────────┤
│ ├─ code_review              │ (security_expert + code_expert)
│ ├─ vulnerability_analysis   │ (security_expert)
│ ├─ threat_modeling          │ (security_expert + architecture_expert)
│ └─ compliance_check         │ (security_expert)
└─────────────────────────────┘
```

**Implementation:**

1. **Create `/packages/nexus-agents/src/agents/experts/skill-dependencies.ts`**

```typescript
interface SkillDependency {
  skillId: string;
  prerequisites: string[];
  weight: number; // Importance: 0-1
}

interface DependencyGraph {
  dependencies: Map<string, SkillDependency>;
  validate(): Result<void, GraphError>;
  resolve(skillId: string): Result<string[], GraphError>;
}
```

2. **Add to expert-selector-types.ts:**

```typescript
interface ExpertDefinition {
  // ... existing fields
  requiredSkills?: string[]; // Skills this expert must have
  teachesSkills?: string[]; // Skills this expert can teach
  skillPrerequisites?: string[]; // Skills that must be loaded first
}
```

3. **Create registry entry:**

```yaml
# docs/research/registry/skill-dependencies.yaml
skills:
  code_generation:
    prerequisites: []
    taught_by: [code_expert]
    enables: [code_review, refactoring, optimization]

  security_audit:
    prerequisites: [code_generation, vulnerability_analysis]
    taught_by: [security_expert]
    enables: []
    composite: true
```

**Integration with Expert Selector:**

```typescript
// In selectExperts, before returning result:
if (analysis.requiredCapabilities.includes('composite_skill')) {
  const deps = resolveDependencies('security_audit');
  result.suggestedExpertSequence = deps; // Return prerequisite experts
  result.requiresCollaboration = true;
}
```

---

### 3.2 Priority 2: Semantic Capability Matching (P2 - Medium Impact, Medium Effort)

**Problem:** Current matching is exact (has capability or doesn't). Should handle semantic similarity.

**Research:** MCP-Zero's "Hierarchical Semantic Routing" uses embeddings for capability matching.

**Example:**

```
Task requires: ["error_handling", "exception_management"]
Expert has: ["try_catch_patterns", "defensive_coding"]

Current: No match ✗
Proposed: Semantic similarity check ✓ (0.85 match)
```

**Implementation:**

1. **Add semantic matching to expert-selector.ts:**

```typescript
interface SemanticMatch {
  capability: string;
  expertCapability: string;
  similarity: number; // 0-1
}

function calculateSemanticCapabilityScore(
  expert: ExpertDefinition,
  requiredCapabilities: string[],
  semanticCache?: Map<string, number>
): { score: number; matched: SemanticMatch[] } {
  const matched: SemanticMatch[] = [];

  for (const required of requiredCapabilities) {
    for (const expert_cap of expert.capabilities) {
      const similarity = calculateSimilarity(required, expert_cap, semanticCache);

      // Threshold: 0.75+ is considered a match
      if (similarity >= 0.75) {
        matched.push({
          capability: required,
          expertCapability: expert_cap,
          similarity,
        });
      }
    }
  }

  const score = matched.length / requiredCapabilities.length;
  return { score, matched };
}

// Similarity calculation options:
function calculateSimilarity(cap1: string, cap2: string, cache?: Map<string, number>): number {
  // Option 1: Levenshtein distance (lightweight, no external deps)
  // Option 2: BM25 similarity (better for phrases)
  // Option 3: OpenAI embeddings (most accurate, requires API)

  // Start with Levenshtein for MVP
  return levenshteinSimilarity(cap1, cap2);
}
```

2. **Update scoring weights:**

```typescript
// Current weights
CAPABILITY_WEIGHT = 0.4;  // Exact match
SEMANTIC_WEIGHT = 0.1;    // Semantic match (new)
DOMAIN_WEIGHT = 0.4;
EXPERT_WEIGHT = 0.1;      // Adjusted

finalScore = (capabilityScore × 0.4) +
             (semanticScore × 0.1) +
             (domainScore × 0.4) +
             (expertWeight × 0.1);
```

**Benefit:** Better expert selection for tasks with non-standard terminology.

---

### 3.3 Priority 3: Capability Gap Detection (P3 - Medium Impact, Low Effort)

**Problem:** When no expert matches, unclear what's missing.

**Solution:** Explicit gap reporting.

**Implementation:**

```typescript
interface CapabilityGap {
  required: string[]; // Task needs these
  available: string[]; // Experts provide these
  gap: string[]; // Unmet requirements
  severity: 'critical' | 'medium' | 'low';
  suggestions: {
    create_custom_expert?: string;
    use_alternative?: string;
    decompose_task?: string;
  };
}

function analyzeCapabilityGaps(
  analysis: TaskAnalysisResult,
  matches: ExpertMatch[]
): CapabilityGap {
  const available = new Set(matches.flatMap((m) => m.matchedCapabilities));
  const gap = analysis.requiredCapabilities.filter((cap) => !available.has(cap));

  return {
    required: analysis.requiredCapabilities,
    available: Array.from(available),
    gap,
    severity: gap.length >= 3 ? 'critical' : 'medium',
    suggestions: {
      create_custom_expert: `Create custom expert with capabilities: ${gap.join(', ')}`,
      use_alternative: 'Try rephrasing task to use standard terminology',
      decompose_task: 'Break task into smaller steps with standard capability names',
    },
  };
}

// Add to SelectionResult
interface SelectionResult {
  // ... existing fields
  capabilityGaps?: CapabilityGap; // New field
}
```

**User Experience:**

```
Task: "Implement AI safety alignment protocol"
Analysis: Required capabilities not found in expert pool

Capability Gap:
├─ Required: [alignment_protocol, safety_verification, interpretability_analysis]
├─ Gap: [alignment_protocol, interpretability_analysis] (2 missing)
├─ Severity: medium
└─ Suggestions:
   ├─ Create custom expert for alignment and interpretability
   ├─ Rephrase as "Implement safety verification system"
   └─ Break into: (1) Implement safety mechanisms + (2) Add interpretability checks
```

---

### 3.4 Priority 4: Role Hierarchy Formalization (P4 - Low Impact, Medium Effort)

**Problem:** Current flat role structure doesn't capture seniority/specialization.

**Example:**

```
code_expert (current flat)
  ├─ Junior Code Expert (setup, simple refactoring)
  ├─ Senior Code Expert (complex algorithms, design patterns)
  └─ Lead Code Architect (system design, API decisions)
```

**Implementation:**

1. **Update ExpertDefinition:**

```typescript
interface ExpertDefinition {
  // ... existing
  role: AgentRole;
  roleHierarchy?: {
    level: 'junior' | 'senior' | 'lead' | 'architect';
    experience: number; // 1-10 scale
    specializations?: string[];
  };
}
```

2. **Role selection in expert-selector:**

```typescript
function selectByRole(
  registry: ExpertRegistry,
  role: AgentRole,
  minLevel: 'junior' | 'senior' | 'lead' = 'junior'
): ExpertDefinition[] {
  const all = registry.getByRole(role);
  const levels = { junior: 1, senior: 2, lead: 3, architect: 4 };

  return all.filter(
    (e) =>
      e.roleHierarchy?.level === minLevel ||
      levels[e.roleHierarchy?.level || 'junior'] >= levels[minLevel]
  );
}

// Usage in selectExperts:
const prioritizeLevel = options?.minimumLevel ?? 'junior';
const candidates = selectByRole(registry, analysis.domain, prioritizeLevel);
```

3. **Configuration format:**

```yaml
experts:
  custom:
    senior_code_expert:
      name: 'Senior Code Expert'
      primaryDomain: code
      roleHierarchy:
        level: senior
        experience: 7
        specializations: [performance_optimization, architecture_review]
      weight: 0.95
```

---

### 3.5 Priority 5: Documentation - Skills Mapping (P5 - Low Impact, Low Effort)

**Current State:** Expert capabilities are strings without documentation.

**Proposal:** Create capability registry.

**File:** `/docs/research/registry/capabilities.yaml`

```yaml
capabilities:
  code_generation:
    description: 'Write and generate code from specifications'
    domains: [code, architecture]
    taught_by: [code_expert]
    examples:
      - 'Write a function to calculate Fibonacci numbers'
      - 'Generate boilerplate for a REST API'
    related: [code_refactoring, code_explanation]

  vulnerability_analysis:
    description: 'Identify security vulnerabilities in code'
    domains: [security, code]
    taught_by: [security_expert]
    depends_on: [code_analysis]
    examples:
      - 'Find SQL injection vulnerabilities'
      - 'Analyze for authentication bypasses'
    owasp_categories: [A01_BrokenAccessControl, A03_Injection]
```

**Benefit:** Clearer capability discovery, better documentation for custom experts.

---

## Part 4: Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

- [ ] P1: Implement skill dependency graph
  - Create `skill-dependencies.ts` module
  - Add Zod schema for dependency validation
  - Write circular dependency detection tests
  - Integration tests with expert selector

### Phase 2: Enhancement (Weeks 3-4)

- [ ] P2: Add semantic capability matching
  - Implement Levenshtein similarity
  - Update scoring algorithm
  - Test with non-standard terminology

- [ ] P3: Capability gap detection
  - Add gap analysis to selection result
  - Generate helpful suggestions
  - Log gaps for monitoring

### Phase 3: Polish (Weeks 5-6)

- [ ] P4: Role hierarchy formalization
  - Extend ExpertDefinition type
  - Update expert list command
  - Add validation tests

### Phase 4: Documentation (Week 7)

- [ ] P5: Document all capabilities
  - Create `capabilities.yaml` registry
  - Update AGENT_SYSTEM.md
  - Add examples to CLAUDE.md

---

## Part 5: Decision Matrix

For evaluating which recommendations to implement:

| Recommendation        | Effort | Value | Risk | Blocks | Start  |
| --------------------- | ------ | ----- | ---- | ------ | ------ |
| P1: Dependency Graph  | M      | H     | L    | P2, P3 | Week 1 |
| P2: Semantic Matching | M      | M     | L    | -      | Week 3 |
| P3: Gap Detection     | L      | M     | L    | -      | Week 3 |
| P4: Role Hierarchy    | M      | L     | M    | -      | Week 5 |
| P5: Capability Docs   | L      | L     | None | -      | Week 5 |

**Critical Path:** P1 → P2+P3 → P4 → P5

**MVP (Minimum Viable):** P1 + P3

---

## Part 6: Evaluation Criteria

Success metrics for implementations:

### P1: Dependency Graph

- [ ] All complex skills have dependency graph
- [ ] No circular dependencies detected
- [ ] Dependency resolution completes in <100ms
- [ ] Tests cover: valid DAG, cycles, missing skills

### P2: Semantic Matching

- [ ] 80%+ similarity detected for synonymous capabilities
- [ ] False positive rate <5%
- [ ] Performance <50ms for 100-expert pool
- [ ] Improves selection for non-standard terminology

### P3: Gap Detection

- [ ] Gap reporting in 100% of low-confidence selections
- [ ] Suggestions are actionable
- [ ] Zero false negatives (real gaps caught)

### P4: Role Hierarchy

- [ ] Queries by role+level complete in <50ms
- [ ] Custom experts support hierarchy
- [ ] Backward compatible with flat roles

### P5: Capability Docs

- [ ] All built-in capabilities documented
- [ ] Examples for each capability
- [ ] Domain mappings complete

---

## Part 7: Related Research

### Papers Referenced

1. **CASCADE** (arXiv:2512.23880) - Skill dependency management and acquisition
2. **ATLAS** (arXiv:2601.03872) - Cluster-based skill routing
3. **EvoRoute** (arXiv:2601.02695) - Pareto-optimal dynamic routing
4. **MCP-Zero** (arXiv:2506.01056) - Active capability gap identification
5. **Attention-Guided Contrastive Roles** (arXiv:2312.04819) - Role representation learning
6. **Tool-to-Agent Retrieval** (arXiv:2511.01854) - Semantic tool-agent matching
7. **VistaWise** (arXiv:2508.18722) - Cross-modal knowledge graphs for dependencies
8. **Agent-as-a-Service** (arXiv:2505.08446) - Service discovery for agent capabilities

### Additional Reading

- **nexus-agents AGENT_SYSTEM.md** - Current architecture
- **nexus-agents CLAUDE.md** - Project context and standards
- **CODING_STANDARDS.md** - Implementation patterns

---

## Conclusion

nexus-agents has a **well-designed hybrid skill assignment system** combining static built-ins with dynamic customization. The research-backed recommendations (P1-P5) will enhance this foundation with:

1. **Explicit dependency management** - Prevent skill selection conflicts
2. **Semantic understanding** - Handle non-standard terminology
3. **Gap reporting** - Guide users toward missing capabilities
4. **Role clarity** - Support team structures at scale
5. **Capability documentation** - Enable better discovery

**Recommended starting point:** Implement P1 (Dependency Graph) to unblock P2 and P3, then proceed with priority-based roadmap.

---

**Research Completed:** 2026-01-22
**Researcher:** Claude Code (Research Agent)
**Next: Implementation Planning & Prioritization Vote**
