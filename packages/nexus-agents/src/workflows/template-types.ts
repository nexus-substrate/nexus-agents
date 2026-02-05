/**
 * nexus-agents/workflows - Template Types
 *
 * Type definitions and Zod schemas for workflow templates.
 */

import { z } from 'zod';
import type { WorkflowDefinition, WorkflowTemplate } from '../core/index.js';

/**
 * Template category for organization.
 */
export type TemplateCategory = 'development' | 'review' | 'documentation' | 'testing' | 'custom';

/**
 * Extended template metadata for registry.
 * Implements IRegistryItem for unified registry API (ADR-0012).
 */
export interface TemplateMetadata extends WorkflowTemplate {
  /** Unique identifier (alias for name, required by IRegistryItem) */
  readonly id: string;
  /** Template category */
  category: TemplateCategory;
  /** Keywords for search */
  keywords: string[];
  /** Whether this is a built-in template */
  builtIn: boolean;
  /** Template author */
  author?: string;
  /** Last updated timestamp */
  updatedAt?: string;
}

/**
 * Template registry interface.
 */
export interface ITemplateRegistry {
  /**
   * Get all built-in templates.
   * @returns Array of built-in template metadata
   */
  getBuiltIn(): TemplateMetadata[];

  /**
   * Get all registered templates (built-in + custom).
   * @returns Array of all template metadata
   */
  getAll(): TemplateMetadata[];

  /**
   * Get a workflow definition by template ID.
   * @param id - Template name/ID
   * @returns WorkflowDefinition or undefined if not found
   */
  getById(id: string): WorkflowDefinition | undefined;

  /**
   * Register a custom workflow template.
   * @param workflow - Workflow definition to register
   * @param metadata - Optional additional metadata
   */
  register(workflow: WorkflowDefinition, metadata?: Partial<TemplateMetadata>): void;

  /**
   * Unregister a custom template by ID.
   * @param id - Template ID to unregister
   * @returns True if template was removed
   */
  unregister(id: string): boolean;

  /**
   * Load templates from a directory.
   * @param directoryPath - Path to directory containing YAML templates
   * @returns Number of templates loaded
   */
  loadFromDirectory(directoryPath: string): Promise<number>;

  /**
   * Search templates by keyword.
   * @param query - Search query
   * @returns Matching template metadata
   */
  search(query: string): TemplateMetadata[];

  /**
   * Get templates by category.
   * @param category - Category to filter by
   * @returns Templates in the category
   */
  getByCategory(category: TemplateCategory): TemplateMetadata[];
}

// ============================================================================
// Zod Schemas for YAML Template Validation
// ============================================================================

/**
 * Input definition schema.
 */
export const InputDefinitionSchema = z.object({
  name: z.string().min(1, 'Input name is required'),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string().optional(),
  required: z.boolean().optional().default(false),
  default: z.unknown().optional(),
});

/**
 * Agent role schema.
 * Must match AgentRole type in core/types/agent.ts.
 */
export const AgentRoleSchema = z.enum([
  'tech_lead',
  'code_expert',
  'architecture_expert',
  'security_expert',
  'documentation_expert',
  'testing_expert',
  'devops_expert',
  'research_expert',
  'thinker', // TRINITY: High-level reasoning (arXiv:2512.04695)
  'worker', // TRINITY: Task execution
  'verifier', // TRINITY: Output validation
  'custom',
]);

/**
 * Workflow step schema.
 */
export const WorkflowStepSchema = z.object({
  id: z.string().min(1, 'Step ID is required'),
  agent: AgentRoleSchema,
  action: z.string().min(1, 'Action is required'),
  description: z.string().optional(),
  inputs: z.record(z.unknown()).default({}),
  dependsOn: z.array(z.string()).optional(),
  parallel: z.boolean().optional().default(false),
  retries: z.number().int().min(0).max(5).optional(),
  timeout: z.number().positive().optional(),
  condition: z.string().optional(),
});

/**
 * Workflow definition schema for YAML parsing.
 * Validates and transforms YAML content into WorkflowDefinition.
 */
export const WorkflowDefinitionSchema = z
  .object({
    name: z.string().min(1, 'Workflow name is required'),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
    description: z.string().optional(),
    inputs: z.array(InputDefinitionSchema).default([]),
    steps: z.array(WorkflowStepSchema).min(1, 'At least one step is required'),
    timeout: z.number().positive().optional(),
  })
  .transform((data) => ({
    name: data.name,
    version: data.version,
    description: data.description,
    inputs: data.inputs.map((input) => ({
      name: input.name,
      type: input.type,
      description: input.description,
      required: input.required,
      default: input.default,
    })),
    steps: data.steps.map((step) => ({
      id: step.id,
      agent: step.agent,
      action: step.action,
      inputs: step.inputs,
      dependsOn: step.dependsOn,
      parallel: step.parallel,
      retries: step.retries,
      timeout: step.timeout,
      condition: step.condition,
    })),
    timeout: data.timeout,
  }));

/**
 * Template category schema.
 */
export const TemplateCategorySchema = z.enum([
  'development',
  'review',
  'documentation',
  'testing',
  'custom',
]);

/**
 * Template metadata schema.
 */
export const TemplateMetadataSchema = z.object({
  name: z.string().min(1),
  version: z.string(),
  description: z.string().optional(),
  path: z.string(),
  category: TemplateCategorySchema,
  keywords: z.array(z.string()).default([]),
  builtIn: z.boolean().default(false),
  author: z.string().optional(),
  updatedAt: z.string().optional(),
});

/**
 * Built-in template names.
 */
export const BUILT_IN_TEMPLATES = [
  'code-review',
  'feature-implementation',
  'bug-fix',
  'documentation-update',
  'refactoring',
  'research-review',
  'security-audit',
  'standards-review',
  'test-generation',
] as const;

export type BuiltInTemplateName = (typeof BUILT_IN_TEMPLATES)[number];

/**
 * Category mapping for built-in templates.
 */
export const TEMPLATE_CATEGORIES: Record<BuiltInTemplateName, TemplateCategory> = {
  'code-review': 'review',
  'feature-implementation': 'development',
  'bug-fix': 'development',
  'documentation-update': 'documentation',
  refactoring: 'development',
  'research-review': 'review',
  'security-audit': 'review',
  'standards-review': 'review',
  'test-generation': 'testing',
};

/**
 * Keywords for built-in templates.
 */
export const TEMPLATE_KEYWORDS: Record<BuiltInTemplateName, string[]> = {
  'code-review': ['review', 'quality', 'security', 'analysis', 'code'],
  'feature-implementation': ['feature', 'implement', 'develop', 'create', 'build'],
  'bug-fix': ['bug', 'fix', 'debug', 'error', 'issue', 'patch'],
  'documentation-update': ['docs', 'documentation', 'readme', 'api', 'update'],
  refactoring: ['refactor', 'clean', 'improve', 'restructure', 'simplify'],
  'research-review': ['research', 'paper', 'arxiv', 'discover', 'catalog', 'registry'],
  'security-audit': ['security', 'audit', 'vulnerability', 'owasp', 'scan'],
  'standards-review': ['standards', 'lint', 'typecheck', 'fitness', 'compliance', 'quality'],
  'test-generation': ['test', 'generate', 'coverage', 'unit', 'integration'],
};
