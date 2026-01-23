# Implementation Patterns for Skill Assignment Enhancements

**Date:** 2026-01-22 (ET)
**Purpose:** Code patterns and templates for implementing P1-P5 recommendations

---

## Pattern 1: Skill Dependency Graph (P1)

### Type Definition Pattern

```typescript
// File: packages/nexus-agents/src/agents/experts/skill-dependencies.ts

import { z } from 'zod';
import type { Result } from '../../core/index.js';
import { ok, err } from '../../core/index.js';

// Schema for runtime validation
const SkillDependencySchema = z.object({
  skillId: z.string(),
  prerequisites: z.array(z.string()),
  weight: z.number().min(0).max(1),
  description: z.string().optional(),
});

const DependencyGraphSchema = z.object({
  skills: z.map(z.string(), SkillDependencySchema),
});

export type SkillDependency = z.infer<typeof SkillDependencySchema>;
export type DependencyGraph = z.infer<typeof DependencyGraphSchema>;

// Error type
export class DependencyError extends Error {
  constructor(
    message: string,
    public readonly skillId?: string
  ) {
    super(message);
    this.name = 'DependencyError';
  }
}
```

### Validation Pattern

```typescript
/**
 * Validates dependency graph has no cycles.
 * Uses depth-first search to detect cycles.
 */
export function validateNoCycles(graph: DependencyGraph): Result<void, DependencyError> {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(skillId: string): boolean {
    visited.add(skillId);
    recursionStack.add(skillId);

    const skill = graph.skills.get(skillId);
    if (!skill) {
      return false; // Skill not in graph, no cycle possible
    }

    for (const prereq of skill.prerequisites) {
      if (!visited.has(prereq) && hasCycle(prereq)) {
        return true;
      } else if (recursionStack.has(prereq)) {
        return true; // Cycle detected
      }
    }

    recursionStack.delete(skillId);
    return false;
  }

  for (const skillId of graph.skills.keys()) {
    if (!visited.has(skillId) && hasCycle(skillId)) {
      return err(new DependencyError(`Circular dependency detected involving ${skillId}`, skillId));
    }
  }

  return ok(undefined);
}
```

### Resolution Pattern

```typescript
/**
 * Resolves skill and all prerequisites in dependency order.
 * Returns skills ordered from prerequisites to dependent.
 */
export function resolveSkillChain(
  skillId: string,
  graph: DependencyGraph
): Result<string[], DependencyError> {
  const resolved: string[] = [];
  const visiting = new Set<string>();

  function visit(id: string): Result<void, DependencyError> {
    if (visiting.has(id)) {
      return err(new DependencyError(`Circular dependency at ${id}`, id));
    }
    if (resolved.includes(id)) {
      return ok(undefined); // Already resolved
    }

    visiting.add(id);

    const skill = graph.skills.get(id);
    if (!skill) {
      return err(new DependencyError(`Skill not found: ${id}`, id));
    }

    // Recursively resolve prerequisites
    for (const prereq of skill.prerequisites) {
      const result = visit(prereq);
      if (!result.ok) return result;
    }

    resolved.push(id);
    visiting.delete(id);
    return ok(undefined);
  }

  const result = visit(skillId);
  return result.ok ? ok(resolved) : err(result.error);
}
```

### Integration Pattern

```typescript
// In expert-selector.ts, after selectExperts():

interface SelectionResult {
  // ... existing fields
  skillChain?: string[]; // NEW: Ordered skill dependencies
  skillGaps?: string[]; // NEW: Missing prerequisites
}

export function selectExperts(
  task: Task,
  registry: ExpertRegistry,
  options?: SelectionOptions,
  depGraph?: DependencyGraph // NEW parameter
): Result<SelectionResult, SelectionError> {
  // ... existing selection logic ...

  // NEW: Add skill chain resolution
  if (depGraph && analysis.requiredCapabilities.length > 0) {
    const chainResult = resolveSkillChain(
      analysis.requiredCapabilities[0], // Use first required capability
      depGraph
    );

    if (chainResult.ok) {
      result.skillChain = chainResult.value;
    } else if (!chainResult.ok) {
      result.skillGaps = analysis.requiredCapabilities; // Mark as gaps
    }
  }

  return ok(result);
}
```

### Configuration Pattern

```yaml
# File: docs/research/registry/skill-dependencies.yaml

skills:
  code_generation:
    prerequisites: []
    weight: 1.0
    description: 'Generate code from specifications'

  code_refactoring:
    prerequisites: [code_generation]
    weight: 0.9
    description: 'Improve existing code'

  performance_optimization:
    prerequisites: [code_refactoring]
    weight: 0.8
    description: 'Optimize code for performance'

  security_review:
    prerequisites: [code_generation]
    weight: 1.0
    description: 'Review code for security issues'

  comprehensive_audit:
    prerequisites: [code_refactoring, security_review]
    weight: 1.0
    description: 'Complete code audit'
```

---

## Pattern 2: Semantic Capability Matching (P2)

### Similarity Calculation Pattern

```typescript
// File: packages/nexus-agents/src/agents/experts/capability-similarity.ts

/**
 * Levenshtein distance between two strings.
 * 0 = identical, 1 = completely different
 */
function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= s2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= s1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s2.length; i++) {
    for (let j = 1; j <= s1.length; j++) {
      if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return matrix[s2.length][s1.length] / maxLen;
}

/**
 * Calculate similarity score (0-1, where 1 = identical).
 */
export function calculateSimilarity(
  cap1: string,
  cap2: string,
  cache?: Map<string, number>
): number {
  const cacheKey = `${cap1}|${cap2}`;
  if (cache?.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  // Exact match
  if (cap1.toLowerCase() === cap2.toLowerCase()) {
    return 1.0;
  }

  // Substring match
  if (
    cap1.toLowerCase().includes(cap2.toLowerCase()) ||
    cap2.toLowerCase().includes(cap1.toLowerCase())
  ) {
    return 0.85;
  }

  // Levenshtein similarity
  const distance = levenshteinDistance(cap1, cap2);
  const similarity = 1 - distance;

  cache?.set(cacheKey, similarity);
  return similarity;
}
```

### Matching Pattern

```typescript
// Updated expert-selector.ts

interface SemanticMatch {
  required: string;
  expert: string;
  similarity: number;
}

function calculateSemanticCapabilityScore(
  expert: ExpertDefinition,
  requiredCapabilities: string[],
  similarityThreshold: number = 0.75,
  cache?: Map<string, number>
): { score: number; matches: SemanticMatch[] } {
  const matches: SemanticMatch[] = [];

  for (const required of requiredCapabilities) {
    for (const expertCap of expert.capabilities) {
      const similarity = calculateSimilarity(required, expertCap, cache);

      if (similarity >= similarityThreshold) {
        matches.push({
          required,
          expert: expertCap,
          similarity,
        });
        break; // Use first match for this capability
      }
    }
  }

  const score = requiredCapabilities.length > 0 ? matches.length / requiredCapabilities.length : 0;

  return { score, matches };
}

// Updated scoreExpert function:
function scoreExpertWithSemantic(
  expert: ExpertDefinition,
  analysis: TaskAnalysisResult,
  semanticThreshold: number = 0.75,
  options?: SelectionOptions
): ExpertMatch {
  const { score: exactScore, matched: exactMatches } = calculateCapabilityScore(
    expert,
    analysis.requiredCapabilities,
    options?.capabilityWeights
  );

  const { score: semanticScore, matches: semanticMatches } = calculateSemanticCapabilityScore(
    expert,
    analysis.requiredCapabilities,
    semanticThreshold
  );

  // Use semantic matches if they improve score
  const bestMatches =
    semanticScore > exactScore ? semanticMatches.map((m) => m.expert) : exactMatches;

  const bestScore = Math.max(exactScore, semanticScore);

  const domainScore = calculateDomainScore(
    expert,
    analysis.domain,
    analysis.secondaryDomains,
    options?.preferredDomains
  );

  // Updated weights: add semantic factor
  const finalScore =
    bestScore * 0.35 + // Capability score (reduced from 0.4)
    semanticScore * 0.1 + // Semantic bonus (new)
    domainScore * 0.4 +
    expert.weight * 0.15; // Expert weight (reduced from 0.2)

  return {
    expertId: expert.id,
    score: finalScore,
    matchedCapabilities: bestMatches,
    reasoning: generateReasoning(expert, analysis, bestMatches, domainScore),
    scoreBreakdown: {
      capabilityScore: bestScore,
      domainScore,
      semanticScore,
      weightScore: expert.weight,
      finalScore,
    },
  };
}
```

---

## Pattern 3: Capability Gap Detection (P3)

### Gap Analysis Pattern

```typescript
// File: packages/nexus-agents/src/agents/experts/capability-gap-detector.ts

export interface CapabilityGap {
  required: string[];
  available: string[];
  unmet: string[];
  severity: 'critical' | 'medium' | 'low';
  suggestions: GapSuggestions;
}

export interface GapSuggestions {
  customExpert?: string;
  alternative?: string;
  decompose?: string[];
}

export function detectCapabilityGaps(
  taskAnalysis: TaskAnalysisResult,
  experts: ExpertDefinition[],
  matches: ExpertMatch[]
): CapabilityGap {
  // Collect all available capabilities
  const available = new Set<string>();
  for (const expert of experts) {
    expert.capabilities.forEach((cap) => available.add(cap));
  }

  // Find unmet capabilities
  const unmet = taskAnalysis.requiredCapabilities.filter((cap) => !available.has(cap));

  // Matched capabilities from selection
  const matched = new Set<string>();
  for (const match of matches) {
    match.matchedCapabilities.forEach((cap) => matched.add(cap));
  }

  // Determine severity
  const severity = unmet.length >= 3 ? 'critical' : unmet.length >= 1 ? 'medium' : 'low';

  // Generate suggestions
  const suggestions = generateGapSuggestions(taskAnalysis, unmet, matched);

  return {
    required: taskAnalysis.requiredCapabilities,
    available: Array.from(available),
    unmet,
    severity,
    suggestions,
  };
}

function generateGapSuggestions(
  task: TaskAnalysisResult,
  gaps: string[],
  matched: Set<string>
): GapSuggestions {
  const suggestions: GapSuggestions = {};

  if (gaps.length > 0) {
    suggestions.customExpert = `Create custom expert with capabilities: ${gaps.join(', ')}`;
  }

  if (matched.size >= 0.5 * task.requiredCapabilities.length) {
    suggestions.alternative =
      'Try rephrasing task requirements using these capabilities: ' +
      Array.from(matched).join(', ');
  }

  if (gaps.length <= 2) {
    suggestions.decompose = [
      `Break "${task.description}" into smaller tasks`,
      `Focus on one capability at a time`,
    ];
  }

  return suggestions;
}

// Integration into SelectionResult:
interface SelectionResult {
  primary: ExpertMatch;
  alternatives: ExpertMatch[];
  requiresCollaboration: boolean;
  confidence: number;
  // NEW:
  capabilityGaps?: CapabilityGap;
  gapsSeverity?: 'critical' | 'medium' | 'low';
}
```

### Reporting Pattern

```typescript
// Display gaps to user

function formatCapabilityGaps(gaps: CapabilityGap): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`Capability Gaps (${gaps.severity.toUpperCase()}):`);
  lines.push('');

  if (gaps.unmet.length > 0) {
    lines.push(`Unmet requirements (${gaps.unmet.length}):`);
    for (const gap of gaps.unmet) {
      lines.push(`  • ${gap}`);
    }
    lines.push('');
  }

  if (gaps.suggestions.customExpert) {
    lines.push('Suggestion 1: Create Custom Expert');
    lines.push(`  ${gaps.suggestions.customExpert}`);
    lines.push('');
  }

  if (gaps.suggestions.alternative) {
    lines.push('Suggestion 2: Rephrase Requirements');
    lines.push(`  ${gaps.suggestions.alternative}`);
    lines.push('');
  }

  if (gaps.suggestions.decompose) {
    lines.push('Suggestion 3: Decompose Task');
    for (const step of gaps.suggestions.decompose) {
      lines.push(`  • ${step}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
```

---

## Pattern 4: Role Hierarchy (P4)

### Type Extension Pattern

```typescript
// File: packages/nexus-agents/src/agents/experts/expert-selector-types.ts

// Extend ExpertDefinition
export interface RoleHierarchy {
  level: 'junior' | 'senior' | 'lead' | 'architect';
  experience: number; // 1-10 scale
  specializations?: string[];
}

export interface ExpertDefinition {
  // ... existing fields
  roleHierarchy?: RoleHierarchy;
}
```

### Hierarchy-Aware Selection Pattern

```typescript
// In expert-selector.ts

const ROLE_LEVELS = {
  junior: 1,
  senior: 2,
  lead: 3,
  architect: 4,
} as const;

/**
 * Filters experts by role level.
 */
function filterByRoleLevel(
  experts: ExpertDefinition[],
  minLevel: keyof typeof ROLE_LEVELS = 'junior'
): ExpertDefinition[] {
  const minRank = ROLE_LEVELS[minLevel];
  return experts.filter(e => {
    if (!e.roleHierarchy) return true; // Assume base level
    return ROLE_LEVELS[e.roleHierarchy.level] >= minRank;
  });
}

/**
 * Scores expert based on role fit.
 */
function calculateRoleScore(
  expert: ExpertDefinition,
  analysis: TaskAnalysisResult
): number {
  if (!expert.roleHierarchy) return 0.5;

  // Higher-level experts get bonus for complex tasks
  const levelBonus = analysis.complexity === TaskComplexity.HIGH
    ? expert.roleHierarchy.level === 'architect' ? 0.2 : 0.1
    : 0;

  // Specialization bonus
  const specializationBonus = expert.roleHierarchy.specializations?.some(
    spec => analysis.secondaryDomains.includes(spec as TaskDomain)
  ) ? 0.15 : 0;

  // Experience bonus
  const experienceScore = Math.min(1, expert.roleHierarchy.experience / 10);

  return levelBonus + specializationBonus + (experienceScore * 0.25);
}

// Updated scoring:
function scoreExpert(
  expert: ExpertDefinition,
  analysis: TaskAnalysisResult,
  options?: SelectionOptions
): ExpertMatch {
  const capabilityScore = calculateCapabilityScore(...);
  const domainScore = calculateDomainScore(...);
  const roleScore = calculateRoleScore(expert, analysis); // NEW

  const finalScore =
    capabilityScore * 0.35 +
    domainScore * 0.35 +
    roleScore * 0.2 +          // Role hierarchy factor
    expert.weight * 0.1;

  return {
    expertId: expert.id,
    score: finalScore,
    // ... rest of result
  };
}
```

### Configuration Pattern

```yaml
# nexus-agents.yaml

experts:
  custom:
    senior_code_expert:
      name: 'Senior Code Expert'
      primaryDomain: code
      capabilities: [code_generation, code_review, architecture_design]
      weight: 0.95
      roleHierarchy:
        level: senior
        experience: 7
        specializations: [performance, security]

    junior_code_expert:
      name: 'Junior Code Expert'
      primaryDomain: code
      capabilities: [code_generation, unit_testing]
      weight: 0.6
      roleHierarchy:
        level: junior
        experience: 2
        specializations: []

    lead_security_expert:
      name: 'Security Architect'
      primaryDomain: security
      capabilities: [vulnerability_analysis, threat_modeling, architecture_review]
      weight: 1.0
      roleHierarchy:
        level: architect
        experience: 10
        specializations: [cloud_security, cryptography]
```

---

## Pattern 5: Capability Documentation (P5)

### Registry Schema Pattern

```yaml
# File: docs/research/registry/capabilities.yaml

capabilities:
  code_generation:
    id: code_generation
    name: 'Code Generation'
    description: |
      Generate working code from specifications, requirements,
      or natural language descriptions. Includes implementation
      of algorithms, data structures, and business logic.
    domains: [code, architecture]
    taught_by: [code_expert, lead_architect]
    depends_on: []
    related: [code_refactoring, code_explanation]
    examples:
      - 'Write a function to calculate Fibonacci numbers'
      - 'Generate REST API boilerplate with TypeScript'
      - 'Implement quicksort algorithm with complexity analysis'
    owasp_related: []
    tier: [junior, senior, lead]

  vulnerability_analysis:
    id: vulnerability_analysis
    name: 'Vulnerability Analysis'
    description: |
      Identify and analyze security vulnerabilities in code.
      Includes scanning for known patterns, suggesting fixes,
      and assessing impact and exploitability.
    domains: [security, code]
    taught_by: [security_expert, lead_architect]
    depends_on: [code_generation, code_review]
    related: [threat_modeling, security_hardening]
    examples:
      - 'Find SQL injection vulnerabilities in query builder'
      - 'Identify cross-site scripting (XSS) issues'
      - 'Detect insecure deserialization patterns'
    owasp_related:
      - A01_BrokenAccessControl
      - A03_Injection
      - A05_BrokenAuthentication
    tier: [senior, lead]

  code_refactoring:
    id: code_refactoring
    name: 'Code Refactoring'
    description: |
      Improve code quality, readability, and maintainability
      without changing functionality. Includes extracting methods,
      simplifying logic, and applying design patterns.
    domains: [code]
    taught_by: [code_expert, senior_code_expert]
    depends_on: [code_generation]
    related: [code_explanation, code_optimization]
    examples:
      - 'Extract duplicate logic into shared function'
      - 'Apply builder pattern to reduce constructor complexity'
      - 'Simplify deeply nested conditionals'
    owasp_related: []
    tier: [junior, senior, lead]
```

### Discovery Pattern

```typescript
// File: packages/nexus-agents/src/agents/experts/capability-registry.ts

import { z } from 'zod';
import YAML from 'yaml';

const CapabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  domains: z.array(z.string()),
  taught_by: z.array(z.string()),
  depends_on: z.array(z.string()),
  related: z.array(z.string()),
  examples: z.array(z.string()),
  owasp_related: z.array(z.string()).optional(),
  tier: z.array(z.enum(['junior', 'senior', 'lead', 'architect'])).optional(),
});

export type Capability = z.infer<typeof CapabilitySchema>;

export class CapabilityRegistry {
  private capabilities: Map<string, Capability> = new Map();

  loadFromYaml(content: string): Result<void, Error> {
    try {
      const parsed = YAML.parse(content);
      const { capabilities } = parsed;

      for (const [id, data] of Object.entries(capabilities)) {
        const result = CapabilitySchema.safeParse(data);
        if (!result.success) {
          return err(new Error(`Invalid capability ${id}: ${result.error.message}`));
        }
        this.capabilities.set(id, result.data);
      }
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  getByDomain(domain: string): Capability[] {
    return Array.from(this.capabilities.values()).filter((cap) => cap.domains.includes(domain));
  }

  getDependencies(id: string): Capability[] {
    const cap = this.get(id);
    if (!cap) return [];
    return cap.depends_on
      .map((depId) => this.get(depId))
      .filter((c): c is Capability => c !== undefined);
  }
}
```

---

## Integration Example: Complete Flow

```typescript
// All patterns integrated

async function selectExpertWithEnhancements(
  task: Task,
  registry: ExpertRegistry,
  depGraph: DependencyGraph,
  capRegistry: CapabilityRegistry
): Promise<SelectionResult> {
  // 1. Analyze task
  const analysis = analyzeTask(task);

  // 2. Select experts (with semantic matching - P2)
  const selection = selectExperts(task, registry, {
    minScore: 0.3,
    maxAlternatives: 3,
  });

  if (!selection.ok) {
    return err(selection.error);
  }

  const result = selection.value;

  // 3. Resolve skill dependencies (P1)
  if (depGraph) {
    const chainResult = resolveSkillChain(analysis.value.requiredCapabilities[0], depGraph);
    if (chainResult.ok) {
      result.skillChain = chainResult.value;
    }
  }

  // 4. Detect capability gaps (P3)
  const gaps = detectCapabilityGaps(analysis.value, registry.getAvailable(), [
    result.primary,
    ...result.alternatives,
  ]);
  if (gaps.unmet.length > 0) {
    result.capabilityGaps = gaps;
  }

  // 5. Look up capability documentation (P5)
  const docs = result.primary.matchedCapabilities
    .map((cap) => capRegistry.get(cap))
    .filter((c): c is Capability => c !== undefined);

  result.capabilityDocumentation = docs;

  return ok(result);
}
```

---

## Testing Patterns

### Unit Test Pattern

```typescript
describe('Capability Similarity', () => {
  it('should match exact capabilities', () => {
    const score = calculateSimilarity('code_generation', 'code_generation');
    expect(score).toBe(1.0);
  });

  it('should match semantically similar capabilities', () => {
    const score = calculateSimilarity('error_handling', 'exception_management');
    expect(score).toBeGreaterThan(0.75);
  });

  it('should not match unrelated capabilities', () => {
    const score = calculateSimilarity('code_generation', 'database_design');
    expect(score).toBeLessThan(0.5);
  });

  it('should use cache for performance', () => {
    const cache = new Map<string, number>();
    calculateSimilarity('cap1', 'cap2', cache);
    expect(cache.size).toBe(1);

    // Second call should use cache
    calculateSimilarity('cap1', 'cap2', cache);
    expect(cache.size).toBe(1); // No new entries
  });
});

describe('Dependency Resolution', () => {
  it('should resolve linear dependencies', () => {
    const graph = createTestGraph([
      { skillId: 'a', prerequisites: [] },
      { skillId: 'b', prerequisites: ['a'] },
      { skillId: 'c', prerequisites: ['b'] },
    ]);

    const result = resolveSkillChain('c', graph);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual(['a', 'b', 'c']);
  });

  it('should detect cycles', () => {
    const graph = createTestGraph([
      { skillId: 'a', prerequisites: ['b'] },
      { skillId: 'b', prerequisites: ['c'] },
      { skillId: 'c', prerequisites: ['a'] }, // Cycle!
    ]);

    const result = validateNoCycles(graph);
    expect(result.ok).toBe(false);
  });
});
```

---

## Implementation Checklist

**P1: Dependency Graph**

- [ ] Create `skill-dependencies.ts`
- [ ] Implement cycle detection
- [ ] Implement resolution algorithm
- [ ] Add Zod schemas
- [ ] Integration tests
- [ ] Update expert-selector to use chains
- [ ] Create `skill-dependencies.yaml`

**P2: Semantic Matching**

- [ ] Implement similarity calculation
- [ ] Add semantic scoring to expert-selector
- [ ] Update weights
- [ ] Add caching
- [ ] Performance tests (<100ms for 100 experts)
- [ ] False positive tests

**P3: Gap Detection**

- [ ] Create gap detector module
- [ ] Implement gap analysis
- [ ] Generate suggestions
- [ ] Add to SelectionResult
- [ ] User-facing formatting
- [ ] Integration tests

**P4: Role Hierarchy**

- [ ] Extend ExpertDefinition types
- [ ] Implement hierarchy filtering
- [ ] Add role-based scoring
- [ ] Update expert list command
- [ ] Configuration examples
- [ ] Tests for role selection

**P5: Capability Documentation**

- [ ] Create `capabilities.yaml`
- [ ] Document all 50+ capabilities
- [ ] Create CapabilityRegistry class
- [ ] Integration tests
- [ ] CLI command to view capabilities
- [ ] Link documentation to expert list

---

**Implementation Guide Complete**

Each pattern is ready to implement. Start with P1 (dependency graph) as it unblocks P2 and P3.
