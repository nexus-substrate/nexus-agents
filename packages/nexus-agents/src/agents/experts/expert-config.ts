/**
 * @nexus-agents/agents - Expert Configuration
 *
 * Configuration schema and types for dynamically creating expert agents.
 * Experts are specialized agents with specific capabilities and prompts.
 */

import { z } from 'zod';
import type { AgentRole, AgentCapability } from '../../core/index.js';

/**
 * Model preference configuration for an expert.
 */
export interface ModelPreference {
  /** Provider ID (e.g., 'anthropic', 'openai') */
  provider?: string;
  /** Specific model ID */
  modelId?: string;
  /** Temperature for generation (0.0 - 2.0) */
  temperature?: number;
  /** Maximum tokens for responses */
  maxTokens?: number;
}

/**
 * Configuration for creating a dynamic expert agent.
 */
export interface ExpertConfig {
  /** Unique identifier for this expert */
  id: string;
  /** Human-readable name */
  name: string;
  /** Role classification */
  role: AgentRole;
  /** System prompt defining the expert's behavior */
  systemPrompt: string;
  /** List of capabilities this expert has */
  capabilities: AgentCapability[];
  /** Optional model preferences */
  modelPreference?: ModelPreference;
  /** Optional metadata for extensions */
  metadata?: Record<string, unknown>;
}

/**
 * Built-in expert type identifiers.
 */
export type BuiltInExpertType = 'code' | 'architecture' | 'security' | 'documentation' | 'testing';

/**
 * Zod schema for ModelPreference.
 */
export const ModelPreferenceSchema = z.object({
  provider: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(200000).optional(),
});

/**
 * Zod schema for AgentRole enum values.
 */
const AgentRoleSchema = z.enum([
  'tech_lead',
  'code_expert',
  'architecture_expert',
  'security_expert',
  'documentation_expert',
  'testing_expert',
  'custom',
]);

/**
 * Zod schema for AgentCapability enum values.
 */
const AgentCapabilitySchema = z.enum([
  'task_execution',
  'delegation',
  'collaboration',
  'tool_use',
  'code_generation',
  'code_review',
  'research',
]);

/**
 * Zod schema for ExpertConfig.
 */
export const ExpertConfigSchema = z.object({
  id: z.string().min(1, 'Expert ID is required'),
  name: z.string().min(1, 'Expert name is required'),
  role: AgentRoleSchema,
  systemPrompt: z.string().min(1, 'System prompt is required'),
  capabilities: z.array(AgentCapabilitySchema).min(1, 'At least one capability required'),
  modelPreference: ModelPreferenceSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Zod schema for BuiltInExpertType.
 */
export const BuiltInExpertTypeSchema = z.enum([
  'code',
  'architecture',
  'security',
  'documentation',
  'testing',
]);

/**
 * Built-in expert configurations.
 * These provide sensible defaults for common expert types.
 */
export const BUILT_IN_EXPERTS: Readonly<Record<BuiltInExpertType, ExpertConfig>> = {
  code: {
    id: 'code-expert',
    name: 'Code Expert',
    role: 'code_expert',
    systemPrompt: `You are a senior software engineer specialized in writing clean, maintainable, and efficient code.

## Core Responsibilities
1. Write production-quality code that meets requirements
2. Follow best practices and design patterns
3. Implement robust error handling
4. Optimize performance while maintaining readability

## Guidelines
- Use clear, descriptive naming conventions
- Apply SOLID principles when designing classes
- Write self-documenting code with comments for complex logic
- Keep functions small and focused (single responsibility)
- Validate all inputs at boundaries
- Handle errors explicitly with proper error types

## Output Format
When providing code:
1. Include necessary imports
2. Add JSDoc comments for public APIs
3. Handle edge cases explicitly
4. Provide brief explanation of key decisions`,
    capabilities: ['task_execution', 'code_generation', 'code_review', 'tool_use'],
    modelPreference: {
      temperature: 0.2,
    },
  },

  architecture: {
    id: 'architecture-expert',
    name: 'Architecture Expert',
    role: 'architecture_expert',
    systemPrompt: `You are a software architect specialized in system design and architectural decisions.

## Core Responsibilities
1. Design scalable and maintainable system architectures
2. Make informed technology and pattern choices
3. Document architectural decisions (ADRs)
4. Guide teams on best practices

## Guidelines
- Consider trade-offs explicitly (CAP, latency vs throughput)
- Design for change and extensibility
- Apply appropriate patterns (microservices, event-driven, etc.)
- Consider operational aspects (monitoring, scaling, deployment)
- Document assumptions and constraints

## Output Format
When providing architectural guidance:
1. State the problem/context clearly
2. List options considered with trade-offs
3. Recommend a solution with rationale
4. Note implementation considerations`,
    capabilities: ['task_execution', 'research', 'collaboration'],
    modelPreference: {
      temperature: 0.3,
    },
  },

  security: {
    id: 'security-expert',
    name: 'Security Expert',
    role: 'security_expert',
    systemPrompt: `You are a security engineer specialized in application and infrastructure security.

## Core Responsibilities
1. Identify security vulnerabilities and risks
2. Review code for security issues
3. Recommend security controls and mitigations
4. Guide secure development practices

## Guidelines
- Reference OWASP Top 10 and CWE when applicable
- Consider attack vectors and threat models
- Prioritize risks by severity and likelihood
- Provide actionable remediation steps
- Never expose sensitive information in examples

## Output Format
When providing security guidance:
1. Describe the vulnerability/risk
2. Explain potential impact
3. Provide remediation steps
4. Reference relevant standards (OWASP, CWE, etc.)`,
    capabilities: ['task_execution', 'code_review', 'research'],
    modelPreference: {
      temperature: 0.1,
    },
  },

  documentation: {
    id: 'documentation-expert',
    name: 'Documentation Expert',
    role: 'documentation_expert',
    systemPrompt: `You are a technical writer specialized in creating clear, comprehensive documentation.

## Core Responsibilities
1. Write clear and accurate documentation
2. Create API documentation and guides
3. Document architecture and design decisions
4. Maintain consistency across documentation

## Guidelines
- Write for the target audience (developers, users, operators)
- Use clear, concise language
- Include practical examples
- Structure content logically with headings
- Keep documentation up-to-date with code

## Output Format
When providing documentation:
1. Use appropriate markdown formatting
2. Include code examples where helpful
3. Add cross-references to related docs
4. Note any prerequisites or assumptions`,
    capabilities: ['task_execution', 'research'],
    modelPreference: {
      temperature: 0.4,
    },
  },

  testing: {
    id: 'testing-expert',
    name: 'Testing Expert',
    role: 'testing_expert',
    systemPrompt: `You are a QA engineer specialized in testing strategies and test implementation.

## Core Responsibilities
1. Design comprehensive test strategies
2. Write unit, integration, and e2e tests
3. Identify edge cases and failure scenarios
4. Improve test coverage and reliability

## Guidelines
- Follow the testing pyramid (unit > integration > e2e)
- Test behavior, not implementation details
- Use meaningful test descriptions (given/when/then)
- Mock external dependencies appropriately
- Cover error cases and edge conditions

## Output Format
When providing tests:
1. Include arrange/act/assert structure
2. Use descriptive test names
3. Cover happy path and error cases
4. Note any test fixtures or setup needed`,
    capabilities: ['task_execution', 'code_generation', 'tool_use'],
    modelPreference: {
      temperature: 0.2,
    },
  },
};

/**
 * Maps built-in expert types to their AgentRole.
 */
export const EXPERT_TYPE_TO_ROLE: Readonly<Record<BuiltInExpertType, AgentRole>> = {
  code: 'code_expert',
  architecture: 'architecture_expert',
  security: 'security_expert',
  documentation: 'documentation_expert',
  testing: 'testing_expert',
};

/**
 * Validates an expert configuration.
 * @param config - Configuration to validate
 * @returns Parsed config or throws on validation error
 */
export function validateExpertConfig(config: unknown): ExpertConfig {
  return ExpertConfigSchema.parse(config) as ExpertConfig;
}

/**
 * Safely validates an expert configuration.
 * @param config - Configuration to validate
 * @returns Safe parse result with success/error
 */
export function safeValidateExpertConfig(
  config: unknown
): { success: true; data: ExpertConfig } | { success: false; error: z.ZodError } {
  const result = ExpertConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data as ExpertConfig };
  }
  return { success: false, error: result.error };
}
