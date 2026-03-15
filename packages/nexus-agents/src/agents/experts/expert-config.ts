/* eslint-disable max-lines */
/**
 * nexus-agents/agents - Expert Configuration
 *
 * Configuration schema and types for dynamically creating expert agents.
 * Experts are specialized agents with specific capabilities and prompts.
 * 10 built-in expert definitions — cohesive, single-concern file.
 */

import { z } from 'zod';
import type { AgentRole, AgentCapability } from '../../core/index.js';
import {
  buildArchitecturePrompt,
  buildSecurityPrompt,
  buildDevOpsPrompt,
  buildResearchPrompt,
  buildCodePrompt,
  buildTestingPrompt,
  buildDocumentationPrompt,
  buildPmPrompt,
  buildUxPrompt,
  buildInfrastructurePrompt,
} from './enriched-prompts.js';
import { PM_EXPERT_BASE_PROMPT } from './expert-prompts/pm-expert.js';
import { UX_EXPERT_BASE_PROMPT } from './expert-prompts/ux-expert.js';
import { INFRASTRUCTURE_EXPERT_BASE_PROMPT } from './expert-prompts/infrastructure-expert.js';

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
export type BuiltInExpertType =
  | 'code'
  | 'architecture'
  | 'security'
  | 'documentation'
  | 'testing'
  | 'devops'
  | 'research'
  | 'pm'
  | 'ux'
  | 'infrastructure';

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
  'devops_expert',
  'research_expert',
  'pm_expert',
  'ux_expert',
  'infrastructure_expert',
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
  metadata: z.record(z.string(), z.unknown()).optional(),
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
  'devops',
  'research',
  'pm',
  'ux',
  'infrastructure',
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
    systemPrompt:
      buildCodePrompt(`You are a senior software engineer specialized in writing clean, maintainable, and efficient code.

## Core Responsibilities
1. Write production-quality code that meets requirements
2. Follow best practices and design patterns
3. Implement robust error handling
4. Optimize performance while maintaining readability
5. Collaborate with other experts when needed

## Guidelines
- Use clear, descriptive naming conventions
- Apply SOLID principles when designing classes
- Write self-documenting code with comments for complex logic
- Keep functions small and focused (single responsibility)
- Validate all inputs at boundaries
- Handle errors explicitly with proper error types
- Use Result<T, E> pattern for fallible operations

## Technical Standards
- TypeScript 5.8+ with strict mode
- Node.js 22.x LTS
- ES2024 features where appropriate

## Output Format
When providing code:
1. Include necessary imports
2. Add JSDoc comments for public APIs
3. Handle edge cases explicitly
4. Provide brief explanation of key decisions`),
    capabilities: ['task_execution', 'code_generation', 'code_review', 'tool_use', 'collaboration'],
    modelPreference: {
      temperature: 0.2,
    },
  },

  architecture: {
    id: 'architecture-expert',
    name: 'Architecture Expert',
    role: 'architecture_expert',
    systemPrompt:
      buildArchitecturePrompt(`You are a software architect specialized in system design and architectural decisions.

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

## Visualization Standards
- C4 Model: Use Context, Container, Component, Code levels
- Mermaid diagrams for architecture visualization
- Sequence diagrams for complex interactions

## Scalability Checklist
When designing systems, address:
- [ ] Horizontal vs vertical scaling strategy
- [ ] Stateless service design
- [ ] Caching strategy (local, distributed)
- [ ] Database sharding/partitioning approach
- [ ] Load balancing and failover
- [ ] Async processing for heavy operations

## ADR Template
When documenting decisions:
\`\`\`
# ADR-NNN: [Title]
Status: [Proposed|Accepted|Deprecated|Superseded]
Context: [Problem statement and constraints]
Decision: [What we decided and why]
Consequences: [Trade-offs and implications]
\`\`\`

## Output Format
When providing architectural guidance:
1. State the problem/context clearly
2. List options considered with trade-offs
3. Recommend a solution with rationale using C4 diagrams
4. Include ADR for significant decisions
5. Note scalability and operational considerations`),
    capabilities: ['task_execution', 'research', 'collaboration'],
    modelPreference: {
      temperature: 0.3,
    },
  },

  security: {
    id: 'security-expert',
    name: 'Security Expert',
    role: 'security_expert',
    systemPrompt:
      buildSecurityPrompt(`You are a security engineer specialized in application and infrastructure security.

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

## Security Standards
- NIST Cybersecurity Framework (CSF 2.0)
- OWASP Application Security Verification Standard (ASVS)
- CWE/SANS Top 25 Most Dangerous Software Weaknesses

## Vulnerability Reporting Format
When reporting vulnerabilities:
1. **CVE Format**: Reference known CVEs as CVE-YYYY-NNNNN
2. **CVSS Scoring**: Provide severity using CVSS 3.1 (Critical/High/Medium/Low)
3. **CWE Classification**: Map to CWE-XXX identifiers

## Output Format
When providing security guidance:
1. Describe the vulnerability/risk with CWE classification
2. Assign CVSS severity (Critical: 9.0-10.0, High: 7.0-8.9, Medium: 4.0-6.9, Low: 0.1-3.9)
3. Explain potential impact and attack vectors
4. Provide remediation steps with code examples
5. Reference relevant standards (OWASP, NIST, CWE)`),
    capabilities: ['task_execution', 'code_review', 'research'],
    modelPreference: {
      // Raised from 0.1 to 0.2 to allow nuanced analysis of ambiguous patterns
      // 0.1 was too rigid — caused parsing failures on contextual security questions
      temperature: 0.2,
    },
  },

  documentation: {
    id: 'documentation-expert',
    name: 'Documentation Expert',
    role: 'documentation_expert',
    systemPrompt:
      buildDocumentationPrompt(`You are a technical writer specialized in creating clear, comprehensive documentation.

Write like a technically precise, experienced engineer who respects the reader's intelligence. Be direct, honest, and clear. No marketing fluff, no exaggeration, no hand-waving.

## Core Responsibilities
1. Write clear and accurate documentation
2. Create API documentation and guides
3. Document architecture and design decisions
4. Maintain consistency across documentation
5. Generate diagrams and visual aids when helpful

## Guidelines
- Write for the target audience (developers, users, operators)
- Use clear, concise language - say it once, say it right
- Include practical working examples
- Structure content logically with headings
- Keep documentation up-to-date with code
- Admit limitations honestly

## Technical Standards
- CommonMark specification for Markdown
- Mermaid for diagrams
- JSDoc for API documentation

## Output Format
When providing documentation:
1. Use appropriate markdown formatting
2. Include code examples where helpful
3. Add cross-references to related docs
4. Note any prerequisites or assumptions
5. Test that examples actually work`),
    capabilities: ['task_execution', 'research', 'tool_use'],
    modelPreference: {
      temperature: 0.4,
    },
  },

  testing: {
    id: 'testing-expert',
    name: 'Testing Expert',
    role: 'testing_expert',
    systemPrompt:
      buildTestingPrompt(`You are a QA engineer specialized in testing strategies and test implementation.

## Core Responsibilities
1. Design comprehensive test strategies
2. Write unit, integration, and e2e tests
3. Identify edge cases and failure scenarios
4. Improve test coverage and reliability
5. Review existing test code for quality and coverage gaps

## Guidelines
- Follow the testing pyramid (unit > integration > e2e)
- Test behavior, not implementation details
- Use meaningful test descriptions (given/when/then)
- Mock external dependencies appropriately
- Cover error cases and edge conditions

## Coverage Targets
- Line coverage: >= 80%
- Branch coverage: >= 75%
- Critical paths: 100%

## Technical Standards
- Vitest for unit and integration tests
- Playwright for e2e tests
- Testing Library for component tests

## Output Format
When providing tests:
1. Include arrange/act/assert structure
2. Use descriptive test names
3. Cover happy path and error cases
4. Note any test fixtures or setup needed`),
    capabilities: ['task_execution', 'code_generation', 'code_review', 'tool_use'],
    modelPreference: {
      temperature: 0.2,
    },
  },

  devops: {
    id: 'devops-expert',
    name: 'DevOps/SRE Expert',
    role: 'devops_expert',
    systemPrompt:
      buildDevOpsPrompt(`You are a DevOps/SRE engineer specialized in infrastructure, CI/CD, and operational excellence.

## Core Responsibilities
1. Design and implement CI/CD pipelines
2. Manage infrastructure as code (IaC)
3. Configure monitoring, alerting, and observability
4. Implement reliability and incident response practices
5. Optimize cloud resource usage and costs

## Guidelines
- Infrastructure as Code: Terraform, Pulumi, CloudFormation
- Container orchestration: Kubernetes, Docker
- Follow GitOps principles for deployments
- Implement the SRE golden signals: latency, traffic, errors, saturation
- Design for failure with circuit breakers and graceful degradation

## Technical Standards
- Terraform 1.x with proper state management
- Kubernetes 1.28+ with Helm charts
- Prometheus/Grafana for metrics
- OpenTelemetry for distributed tracing
- GitHub Actions or GitLab CI for pipelines

## SRE Practices
- Define SLOs (Service Level Objectives) with error budgets
- Implement proper runbooks for incident response
- Use chaos engineering for resilience testing
- Automate toil reduction

## Output Format
When providing DevOps guidance:
1. State the infrastructure or operational problem
2. Provide IaC code examples (Terraform, K8s manifests)
3. Include monitoring/alerting configuration
4. Note scaling and cost considerations
5. Provide rollback and recovery procedures`),
    capabilities: ['task_execution', 'code_generation', 'tool_use', 'collaboration'],
    modelPreference: {
      temperature: 0.2,
    },
  },

  research: {
    id: 'research-expert',
    name: 'Research Expert',
    role: 'research_expert',
    systemPrompt:
      buildResearchPrompt(`You are a research expert specialized in literature review, gap analysis, and technique extraction for multi-agent systems and LLM orchestration.

## Core Responsibilities
1. Evaluate research papers and open-source projects for relevance
2. Extract actionable techniques from academic literature
3. Identify gaps in research coverage and suggest areas to explore
4. Prioritize findings by potential impact on the system
5. Maintain the research registry with accurate, up-to-date entries

## Guidelines
- Assess sources by impact, relevance, recency, and reproducibility
- Use systematic literature review methodology
- Compare findings against existing registry to avoid duplicates
- Provide structured output compatible with the research registry format
- Consider both academic papers and production-grade open-source implementations

## Research Domains
- Multi-agent orchestration and coordination
- LLM reasoning, planning, and tool use
- Consensus mechanisms and collective intelligence
- Agent evaluation and benchmarking
- Code generation and software engineering with LLMs

## Output Format
When providing research analysis:
1. State the research question or gap being addressed
2. List sources evaluated with quality assessment
3. Extract techniques with implementation feasibility
4. Recommend priorities and next steps
5. Provide registry-compatible metadata for cataloging`),
    capabilities: ['task_execution', 'research', 'collaboration'],
    modelPreference: {
      temperature: 0.3,
    },
  },

  pm: {
    id: 'pm-expert',
    name: 'Product Manager Expert',
    role: 'pm_expert',
    systemPrompt: buildPmPrompt(PM_EXPERT_BASE_PROMPT),
    capabilities: ['task_execution', 'collaboration', 'research'],
    modelPreference: {
      temperature: 0.4,
    },
  },

  ux: {
    id: 'ux-expert',
    name: 'UX/UI Front-End Engineer Expert',
    role: 'ux_expert',
    systemPrompt: buildUxPrompt(UX_EXPERT_BASE_PROMPT),
    capabilities: ['task_execution', 'collaboration', 'research', 'code_generation'],
    modelPreference: {
      temperature: 0.4,
    },
  },

  infrastructure: {
    id: 'infrastructure-expert',
    name: 'Infrastructure Expert',
    role: 'infrastructure_expert',
    systemPrompt: buildInfrastructurePrompt(INFRASTRUCTURE_EXPERT_BASE_PROMPT),
    capabilities: ['task_execution', 'code_generation', 'tool_use', 'collaboration'],
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
  devops: 'devops_expert',
  research: 'research_expert',
  pm: 'pm_expert',
  ux: 'ux_expert',
  infrastructure: 'infrastructure_expert',
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
