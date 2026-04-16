/**
 * nexus-agents/agents - ArchitectureExpert Helpers
 *
 * Helper functions for the ArchitectureExpert agent including
 * pattern identification and heuristic analysis utilities.
 */

import type {
  ArchitectureAnalysisResult,
  ArchitecturePattern,
  ArchitectureDecision,
  SystemComponent,
} from './expert-types.js';
import type { Task } from '../../core/index.js';

// ============================================================================
// Pattern Definitions
// ============================================================================

interface PatternMatch {
  pattern: RegExp;
  name: string;
  category: string;
  pros: string[];
  cons: string[];
}

/**
 * Architecture pattern matchers for heuristic detection.
 */
export const ARCHITECTURE_PATTERNS: PatternMatch[] = [
  {
    pattern: /microservice|distributed|service.?oriented/i,
    name: 'Microservices',
    category: 'Architectural',
    pros: ['Independent deployment', 'Technology flexibility', 'Scalability'],
    cons: ['Complexity', 'Network latency', 'Distributed data management'],
  },
  {
    pattern: /event|message|pub.?sub|async/i,
    name: 'Event-Driven',
    category: 'Architectural',
    pros: ['Loose coupling', 'Scalability', 'Resilience'],
    cons: ['Eventual consistency', 'Debugging complexity', 'Event ordering'],
  },
  {
    pattern: /layer|tier|mvc|presentation/i,
    name: 'Layered Architecture',
    category: 'Architectural',
    pros: ['Separation of concerns', 'Maintainability', 'Testability'],
    cons: ['Performance overhead', 'Rigidity', 'Monolithic tendency'],
  },
  {
    pattern: /domain|ddd|aggregate|bounded/i,
    name: 'Domain-Driven Design',
    category: 'Architectural',
    pros: ['Business alignment', 'Clear boundaries', 'Ubiquitous language'],
    cons: ['Learning curve', 'Overhead for simple domains', 'Initial cost'],
  },
  {
    pattern: /repository|factory|singleton/i,
    name: 'Repository Pattern',
    category: 'Structural',
    pros: ['Data access abstraction', 'Testability', 'Separation of concerns'],
    cons: ['Additional abstraction layer', 'Potential over-engineering'],
  },
];

// ============================================================================
// Component Definitions
// ============================================================================

interface ComponentPattern {
  pattern: RegExp;
  name: string;
  type: string;
  responsibilities: string[];
}

/**
 * Component pattern matchers for heuristic detection.
 */
export const COMPONENT_PATTERNS: ComponentPattern[] = [
  {
    pattern: /api|rest|endpoint/i,
    name: 'API Layer',
    type: 'Service',
    responsibilities: ['Request handling', 'Input validation', 'Response formatting'],
  },
  {
    pattern: /database|storage|persistence/i,
    name: 'Data Layer',
    type: 'Module',
    responsibilities: ['Data persistence', 'Query execution', 'Transaction management'],
  },
  {
    pattern: /auth|security|permission/i,
    name: 'Security Module',
    type: 'Module',
    responsibilities: ['Authentication', 'Authorization', 'Security enforcement'],
  },
  {
    pattern: /business|domain|core/i,
    name: 'Business Logic',
    type: 'Layer',
    responsibilities: ['Business rules', 'Domain operations', 'Workflow management'],
  },
];

// ============================================================================
// Pattern Identification
// ============================================================================

/**
 * Identifies patterns using heuristic analysis.
 */
export function identifyHeuristicPatterns(description: string): ArchitecturePattern[] {
  const patterns: ArchitecturePattern[] = [];
  const desc = description.toLowerCase();

  for (const match of ARCHITECTURE_PATTERNS) {
    if (match.pattern.test(desc)) {
      patterns.push({
        name: match.name,
        category: match.category,
        applicability: 0.7,
        tradeoffs: { pros: match.pros, cons: match.cons },
      });
    }
  }

  return patterns.slice(0, 5);
}

/**
 * Identifies system components from description.
 */
export function identifyHeuristicComponents(description: string): SystemComponent[] {
  const components: SystemComponent[] = [];
  const desc = description.toLowerCase();

  for (const cp of COMPONENT_PATTERNS) {
    if (cp.pattern.test(desc)) {
      components.push({
        name: cp.name,
        type: cp.type,
        responsibilities: cp.responsibilities,
        dependencies: [],
      });
    }
  }

  return components;
}

// ============================================================================
// ADR Generation
// ============================================================================

/**
 * Generates heuristic ADRs based on identified patterns.
 */
export function generateHeuristicADRs(
  task: Task,
  patterns: ArchitecturePattern[]
): ArchitectureDecision[] {
  if (patterns.length === 0) return [];

  const primaryPattern = patterns[0];
  if (primaryPattern === undefined) return [];

  return [
    {
      id: 'ADR-001',
      title: `Adopt ${primaryPattern.name} Pattern`,
      context: `Based on the requirements in task ${task.id}`,
      decision: `Use ${primaryPattern.name} as the primary architectural pattern`,
      consequences: [
        ...primaryPattern.tradeoffs.pros.map((p) => `Pro: ${p}`),
        ...primaryPattern.tradeoffs.cons.map((c) => `Con: ${c}`),
      ],
      status: 'proposed',
    },
  ];
}

// ============================================================================
// Analysis Type Inference
// ============================================================================

/**
 * Infers analysis type from task description.
 */
export function inferAnalysisType(description: string): ArchitectureAnalysisResult['analysisType'] {
  const desc = description.toLowerCase();

  if (desc.includes('pattern') || desc.includes('which approach')) {
    return 'pattern_selection';
  }
  if (desc.includes('review') || desc.includes('assess') || desc.includes('evaluate')) {
    return 'review';
  }
  return 'design';
}

// ============================================================================
// Recommendations & Warnings
// ============================================================================

/**
 * Generates recommendations based on analysis type.
 */
export function generateHeuristicRecommendations(
  analysisType: ArchitectureAnalysisResult['analysisType']
): string[] {
  const base = ['Document architecture decisions', 'Review with stakeholders'];

  switch (analysisType) {
    case 'design':
      return [...base, 'Create C4 diagrams', 'Define clear boundaries', 'Plan for evolution'];
    case 'review':
      return [...base, 'Identify technical debt', 'Assess scalability', 'Check security posture'];
    case 'pattern_selection':
      return [
        ...base,
        'Prototype before committing',
        'Consider team expertise',
        'Evaluate trade-offs',
      ];
    default:
      return base;
  }
}

/**
 * Detects architecture warnings from description.
 */
export function detectArchitectureWarnings(description: string): string[] {
  const warnings: string[] = [];
  const desc = description.toLowerCase();

  if (desc.includes('monolith') && desc.includes('microservice')) {
    warnings.push('Migration from monolith to microservices is complex - plan carefully');
  }
  if (desc.includes('legacy')) {
    warnings.push('Legacy system integration requires careful boundary definition');
  }
  if (desc.includes('real-time') || desc.includes('low latency')) {
    warnings.push('Real-time requirements need specialized architecture considerations');
  }
  if (desc.includes('scale') || desc.includes('million')) {
    warnings.push('High-scale requirements need early capacity planning');
  }

  return warnings;
}

// ============================================================================
// Result Parsing
// ============================================================================

/** Valid analysisType values. */
const VALID_ANALYSIS_TYPES = new Set<ArchitectureAnalysisResult['analysisType']>([
  'design',
  'review',
  'pattern_selection',
]);

function isValidAnalysisType(v: unknown): v is ArchitectureAnalysisResult['analysisType'] {
  return typeof v === 'string' && VALID_ANALYSIS_TYPES.has(v as ArchitectureAnalysisResult['analysisType']);
}

function isUnitRangeNum(v: unknown): v is number {
  return typeof v === 'number' && v >= 0 && v <= 1;
}

function isStrArr(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Populate optional array fields on the architecture result. */
function applyArchOptionals(result: ArchitectureAnalysisResult, p: Record<string, unknown>): void {
  if (Array.isArray(p['patterns'])) result.patterns = p['patterns'] as ArchitectureAnalysisResult['patterns'];
  if (Array.isArray(p['decisions'])) result.decisions = p['decisions'] as ArchitectureAnalysisResult['decisions'];
  if (Array.isArray(p['components'])) {
    result.components = p['components'] as ArchitectureAnalysisResult['components'];
  }
  if (isStrArr(p['recommendations'])) result.recommendations = p['recommendations'];
  if (isStrArr(p['warnings'])) result.warnings = p['warnings'];
}

/**
 * Parses architecture result from model response.
 *
 * Uses runtime type guards instead of `as Partial<T>` (#1913 Class A).
 */
export function parseArchitectureResult(
  text: string,
  defaultType: ArchitectureAnalysisResult['analysisType']
): ArchitectureAnalysisResult {
  try {
    const jsonText = extractJsonFromText(text);
    const rawParsed: unknown = JSON.parse(jsonText);
    if (typeof rawParsed !== 'object' || rawParsed === null || Array.isArray(rawParsed)) {
      throw new Error('Parsed value is not a plain object');
    }
    const p = rawParsed as Record<string, unknown>;

    const result: ArchitectureAnalysisResult = {
      content: typeof p['content'] === 'string' ? p['content'] : 'Architecture analysis completed',
      analysisType: isValidAnalysisType(p['analysisType']) ? p['analysisType'] : defaultType,
      confidence: isUnitRangeNum(p['confidence']) ? p['confidence'] : 0.7,
    };
    applyArchOptionals(result, p);
    return result;
  } catch {
    return { content: text, analysisType: defaultType, confidence: 0.5 };
  }
}

/**
 * Extracts JSON from text that may contain markdown code blocks.
 */
function extractJsonFromText(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return match?.[1]?.trim() ?? text.trim();
}
