/**
 * nexus-agents/agents - Expert Types and Schemas
 *
 * Shared type definitions and Zod schemas for expert agents.
 * Experts are domain-specialized agents that handle specific task types.
 */

import { z } from 'zod';
import type { AgentCapability, AgentRole } from '../../core/index.js';

/**
 * Expert domain categories.
 */
export type ExpertDomain = 'code' | 'security' | 'architecture' | 'testing' | 'documentation';

/**
 * Expert-specific configuration options.
 */
export interface ExpertOptions {
  /** Custom system prompt override */
  systemPromptOverride?: string;
  /** Temperature for completions (domain-specific default if not set) */
  temperature?: number;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Enable domain-specific heuristics */
  enableHeuristics?: boolean;
  /** Custom capability extensions */
  additionalCapabilities?: AgentCapability[];
}

/**
 * Output format for expert task results.
 */
export interface ExpertOutput {
  /** Primary result content */
  content: string;
  /** Structured data if applicable */
  structuredData?: Record<string, unknown> | undefined;
  /** Recommendations or suggestions */
  recommendations?: string[] | undefined;
  /** Warnings or issues found */
  warnings?: string[] | undefined;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Code analysis result from CodeExpert.
 */
export interface CodeAnalysisResult extends ExpertOutput {
  /** Type of code operation performed */
  operationType: 'generation' | 'refactoring' | 'optimization' | 'debugging';
  /** Files affected */
  affectedFiles?: string[] | undefined;
  /** Code changes or suggestions */
  codeChanges?: CodeChange[] | undefined;
}

/**
 * Represents a single code change.
 */
export interface CodeChange {
  /** File path */
  file: string;
  /** Line number or range */
  lineRange?: { start: number; end: number };
  /** Original code */
  original?: string;
  /** Modified code */
  modified: string;
  /** Description of change */
  description: string;
}

/**
 * Security analysis result from SecurityExpert.
 */
export interface SecurityAnalysisResult extends ExpertOutput {
  /** Vulnerabilities found */
  vulnerabilities: Vulnerability[];
  /** Security score (0-100) */
  securityScore: number;
  /** Compliance status */
  compliance?: ComplianceStatus;
}

/**
 * Represents a security vulnerability.
 */
export interface Vulnerability {
  /** Unique vulnerability ID */
  id: string;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Vulnerability type (OWASP category) */
  type: string;
  /** Description of the vulnerability */
  description: string;
  /** Affected location */
  location?: string;
  /** Remediation steps */
  remediation: string;
  /** CWE reference if applicable */
  cweId?: string;
}

/**
 * Compliance check status.
 */
export interface ComplianceStatus {
  /** Compliance framework */
  framework: string;
  /** Overall status */
  status: 'compliant' | 'partial' | 'non-compliant';
  /** Specific findings */
  findings: string[];
}

/**
 * Architecture analysis result from ArchitectureExpert.
 */
export interface ArchitectureAnalysisResult extends ExpertOutput {
  /** Analysis type */
  analysisType: 'design' | 'review' | 'pattern_selection';
  /** Identified patterns */
  patterns?: ArchitecturePattern[] | undefined;
  /** Design decisions */
  decisions?: ArchitectureDecision[] | undefined;
  /** System components */
  components?: SystemComponent[] | undefined;
}

/**
 * Architecture pattern identification.
 */
export interface ArchitecturePattern {
  /** Pattern name */
  name: string;
  /** Pattern category */
  category: string;
  /** Applicability score (0-1) */
  applicability: number;
  /** Trade-offs */
  tradeoffs: { pros: string[]; cons: string[] };
}

/**
 * Architecture decision record.
 */
export interface ArchitectureDecision {
  /** Decision ID */
  id: string;
  /** Decision title */
  title: string;
  /** Context */
  context: string;
  /** Decision made */
  decision: string;
  /** Consequences */
  consequences: string[];
  /** Status */
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
}

/**
 * System component in architecture.
 */
export interface SystemComponent {
  /** Component name */
  name: string;
  /** Component type */
  type: string;
  /** Responsibilities */
  responsibilities: string[];
  /** Dependencies */
  dependencies: string[];
}

/**
 * Testing analysis result from TestingExpert.
 */
export interface TestingAnalysisResult extends ExpertOutput {
  /** Operation type */
  operationType: 'generation' | 'coverage_analysis' | 'quality_assessment';
  /** Generated tests */
  tests?: GeneratedTest[] | undefined;
  /** Coverage metrics */
  coverage?: CoverageMetrics | undefined;
  /** Test quality assessment */
  quality?: TestQuality | undefined;
}

/**
 * Generated test case.
 */
export interface GeneratedTest {
  /** Test name */
  name: string;
  /** Test type */
  type: 'unit' | 'integration' | 'e2e';
  /** Test code */
  code: string;
  /** Target function/component */
  target: string;
  /** Test scenarios covered */
  scenarios: string[];
}

/**
 * Code coverage metrics.
 */
export interface CoverageMetrics {
  /** Line coverage percentage */
  line: number;
  /** Branch coverage percentage */
  branch: number;
  /** Function coverage percentage */
  function: number;
  /** Statement coverage percentage */
  statement: number;
  /** Uncovered areas */
  uncoveredAreas?: string[];
}

/**
 * Test quality assessment.
 */
export interface TestQuality {
  /** Overall score (0-100) */
  score: number;
  /** Test isolation */
  isolation: 'good' | 'fair' | 'poor';
  /** Assertion quality */
  assertionQuality: 'good' | 'fair' | 'poor';
  /** Issues found */
  issues: string[];
}

/**
 * Documentation result from DocumentationExpert.
 */
export interface DocumentationResult extends ExpertOutput {
  /** Documentation type */
  documentationType: 'api' | 'readme' | 'guide' | 'reference';
  /** Generated documentation sections */
  sections?: DocumentationSection[] | undefined;
  /** API documentation */
  apiDocs?: ApiDocumentation | undefined;
}

/**
 * Documentation section.
 */
export interface DocumentationSection {
  /** Section title */
  title: string;
  /** Section content */
  content: string;
  /** Subsections */
  subsections?: DocumentationSection[];
}

/**
 * API documentation structure.
 */
export interface ApiDocumentation {
  /** API endpoints or functions */
  endpoints: ApiEndpoint[];
  /** Data types */
  types: ApiType[];
}

/**
 * API endpoint documentation.
 */
export interface ApiEndpoint {
  /** Endpoint name */
  name: string;
  /** Description */
  description: string;
  /** Parameters */
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
  }>;
  /** Return type */
  returns: { type: string; description: string };
  /** Example usage */
  example?: string;
}

/**
 * API type documentation.
 */
export interface ApiType {
  /** Type name */
  name: string;
  /** Description */
  description: string;
  /** Properties */
  properties: Array<{
    name: string;
    type: string;
    description: string;
    optional: boolean;
  }>;
}

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Expert domain schema.
 */
export const ExpertDomainSchema = z.enum([
  'code',
  'security',
  'architecture',
  'testing',
  'documentation',
]);

/**
 * Expert options schema.
 */
export const ExpertOptionsSchema = z.object({
  systemPromptOverride: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().positive().optional(),
  enableHeuristics: z.boolean().optional(),
  additionalCapabilities: z.array(z.string()).optional(),
});

/**
 * Expert output schema.
 */
export const ExpertOutputSchema = z.object({
  content: z.string(),
  structuredData: z.record(z.unknown()).optional(),
  recommendations: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
});

/**
 * Vulnerability severity schema.
 */
export const VulnerabilitySeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);

/**
 * Vulnerability schema.
 */
export const VulnerabilitySchema = z.object({
  id: z.string().min(1),
  severity: VulnerabilitySeveritySchema,
  type: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
  remediation: z.string().min(1),
  cweId: z.string().optional(),
});

/**
 * Code change schema.
 */
export const CodeChangeSchema = z.object({
  file: z.string().min(1),
  lineRange: z
    .object({
      start: z.number().positive(),
      end: z.number().positive(),
    })
    .optional(),
  original: z.string().optional(),
  modified: z.string(),
  description: z.string().min(1),
});

/**
 * Generated test schema.
 */
export const GeneratedTestSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['unit', 'integration', 'e2e']),
  code: z.string().min(1),
  target: z.string().min(1),
  scenarios: z.array(z.string()),
});

/**
 * Coverage metrics schema.
 */
export const CoverageMetricsSchema = z.object({
  line: z.number().min(0).max(100),
  branch: z.number().min(0).max(100),
  function: z.number().min(0).max(100),
  statement: z.number().min(0).max(100),
  uncoveredAreas: z.array(z.string()).optional(),
});

/**
 * Default temperatures for each expert domain.
 */
export const EXPERT_DEFAULT_TEMPERATURES: Record<ExpertDomain, number> = {
  code: 0.2,
  security: 0.3,
  architecture: 0.5,
  testing: 0.3,
  documentation: 0.4,
};

/**
 * Default capabilities for each expert role.
 */
export const EXPERT_DEFAULT_CAPABILITIES: Record<AgentRole, readonly AgentCapability[]> = {
  code_expert: ['task_execution', 'code_generation', 'code_review', 'tool_use'],
  security_expert: ['task_execution', 'code_review', 'research'],
  architecture_expert: ['task_execution', 'research', 'collaboration'],
  testing_expert: ['task_execution', 'code_generation', 'tool_use'],
  documentation_expert: ['task_execution', 'research'],
  tech_lead: ['task_execution', 'delegation', 'collaboration', 'research'],
  custom: ['task_execution'],
  // TRINITY roles (arXiv:2512.04695)
  thinker: ['task_execution', 'research', 'collaboration'],
  worker: ['task_execution', 'code_generation', 'tool_use'],
  verifier: ['task_execution', 'code_review', 'research'],
};
