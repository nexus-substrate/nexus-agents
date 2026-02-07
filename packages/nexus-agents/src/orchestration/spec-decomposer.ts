/**
 * Spec Decomposer — breaks parsed specs into dependency DAGs.
 *
 * Accepts a ParsedSpec and produces a TaskDag where each requirement
 * maps to a subtask node and acceptance criteria map to test nodes.
 *
 * @module orchestration/spec-decomposer
 * (Source: Issue #848 — Phase 2 of AI Software Factory Epic #843)
 */

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { ParsedSpec } from './spec-parser-types.js';
import type {
  TaskDag,
  SubtaskNode,
  DagEdge,
  DecomposeError,
  SubtaskType,
  ComplexityLevel,
} from './spec-decomposer-types.js';

/** Keywords that indicate config-type work. */
const CONFIG_KEYWORDS =
  /\b(config|configure|setup|set up|environment|env var|connection string)\b/i;

/** Keywords that indicate documentation work. */
const DOCS_KEYWORDS = /\b(document|documentation|docs|readme|usage guide|write guide|api docs)\b/i;

/** Keywords that indicate refactoring work. */
const REFACTOR_KEYWORDS = /\b(refactor|restructure|reorganize|clean up|simplify|extract)\b/i;

/** Keywords that suggest higher complexity. */
const COMPLEX_KEYWORDS = /\b(distributed|concurrent|async|parallel|security|auth|encrypt|scale)\b/i;

/** Keywords that suggest expert-level complexity. */
const EXPERT_KEYWORDS =
  /\b(distributed system|consensus|fault.tolerant|zero.knowledge|cryptograph)\b/i;

/**
 * Decomposes a parsed spec into a dependency DAG of typed subtasks.
 */
export function decomposeSpec(spec: ParsedSpec): Result<TaskDag, DecomposeError> {
  if (spec.requirements.length === 0) {
    return err({ message: 'Cannot decompose spec with no requirements' });
  }

  const codeNodes = spec.requirements.map((req, i) => createCodeNode(req, i));
  const testNodes = spec.acceptanceCriteria.map((ac, i) => createTestNode(ac, i, codeNodes));
  const allNodes = [...codeNodes, ...testNodes];
  const edges = buildEdges(allNodes);
  const roots = findRoots(allNodes);
  const totalComplexity = computeMaxComplexity(allNodes);

  return ok({
    nodes: allNodes,
    edges,
    roots,
    totalComplexity,
    specTitle: spec.title,
  });
}

/** Creates a subtask node from a requirement string. */
function createCodeNode(requirement: string, index: number): SubtaskNode {
  const type = classifyType(requirement);
  const complexity = estimateComplexity(requirement);
  return {
    id: `${type}-${String(index)}`,
    description: requirement,
    type,
    complexity,
    capabilities: deriveCapabilities(type, complexity),
    dependsOn: [],
    sourceRequirement: requirement,
  };
}

/** Creates a test subtask from an acceptance criterion. */
function createTestNode(
  criterion: string,
  index: number,
  codeNodes: readonly SubtaskNode[]
): SubtaskNode {
  // Test nodes depend on all code nodes (conservative: tests run after impl)
  const codeIds = codeNodes.map((n) => n.id);
  return {
    id: `test-${String(index)}`,
    description: `Test: ${criterion}`,
    type: 'test',
    complexity: 'simple',
    capabilities: ['test_generation'],
    dependsOn: codeIds,
    sourceRequirement: criterion,
  };
}

/** Classifies a requirement into a subtask type. */
function classifyType(requirement: string): SubtaskType {
  if (CONFIG_KEYWORDS.test(requirement)) return 'config';
  if (DOCS_KEYWORDS.test(requirement)) return 'docs';
  if (REFACTOR_KEYWORDS.test(requirement)) return 'refactor';
  return 'code';
}

/** Estimates complexity from requirement text. */
function estimateComplexity(requirement: string): ComplexityLevel {
  if (EXPERT_KEYWORDS.test(requirement)) return 'expert';
  if (COMPLEX_KEYWORDS.test(requirement)) return 'complex';
  if (requirement.length > 80) return 'moderate';
  return 'simple';
}

/** Derives required capabilities from subtask type and complexity. */
function deriveCapabilities(type: SubtaskType, complexity: ComplexityLevel): string[] {
  const caps: string[] = [];
  if (type === 'code' || type === 'refactor') caps.push('code_generation');
  if (type === 'test') caps.push('test_generation');
  if (type === 'docs') caps.push('documentation');
  if (type === 'config') caps.push('configuration');
  if (complexity === 'complex' || complexity === 'expert') caps.push('reasoning');
  return caps;
}

/** Builds directed edges from node dependency declarations. */
function buildEdges(nodes: readonly SubtaskNode[]): DagEdge[] {
  const edges: DagEdge[] = [];
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      edges.push({ from: dep, to: node.id });
    }
  }
  return edges;
}

/** Finds root nodes (no dependencies). */
function findRoots(nodes: readonly SubtaskNode[]): string[] {
  return nodes.filter((n) => n.dependsOn.length === 0).map((n) => n.id);
}

/** Computes the max complexity across all nodes. */
function computeMaxComplexity(nodes: readonly SubtaskNode[]): ComplexityLevel {
  const order: ComplexityLevel[] = ['simple', 'moderate', 'complex', 'expert'];
  let maxIndex = 0;
  for (const node of nodes) {
    const idx = order.indexOf(node.complexity);
    if (idx > maxIndex) maxIndex = idx;
  }
  return order[maxIndex] ?? 'simple';
}
