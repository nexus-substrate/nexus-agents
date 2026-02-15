/**
 * nexus-agents/agents - Default Expert Registry
 *
 * Default expert definitions for the expert selector.
 */

import type { ExpertDefinition } from './expert-selector-types.js';

/**
 * Default expert definitions for built-in experts.
 */
export const DEFAULT_EXPERTS: ExpertDefinition[] = [
  {
    id: 'code-expert',
    role: 'code_expert',
    name: 'Code Expert',
    description: 'Specialized in code implementation, refactoring, and debugging',
    capabilities: ['task_execution', 'code_generation', 'code_review', 'tool_use', 'collaboration'],
    primaryDomain: 'code',
    secondaryDomains: ['testing'],
    weight: 1.0,
    available: true,
  },
  {
    id: 'security-expert',
    role: 'security_expert',
    name: 'Security Expert',
    description: 'Specialized in security analysis, vulnerability assessment, and audits',
    capabilities: ['task_execution', 'code_review', 'research'],
    primaryDomain: 'security',
    secondaryDomains: ['code'],
    weight: 1.0,
    available: true,
  },
  {
    id: 'architecture-expert',
    role: 'architecture_expert',
    name: 'Architecture Expert',
    description: 'Specialized in system design, patterns, and architectural decisions',
    capabilities: ['task_execution', 'research', 'collaboration'],
    primaryDomain: 'architecture',
    secondaryDomains: ['code', 'documentation'],
    weight: 1.0,
    available: true,
  },
  {
    id: 'documentation-expert',
    role: 'documentation_expert',
    name: 'Documentation Expert',
    description: 'Specialized in technical writing and API documentation',
    capabilities: ['task_execution', 'research', 'tool_use'],
    primaryDomain: 'documentation',
    secondaryDomains: [],
    weight: 0.9,
    available: true,
  },
  {
    id: 'testing-expert',
    role: 'testing_expert',
    name: 'Testing Expert',
    description: 'Specialized in test strategies, coverage, and quality assurance',
    capabilities: ['task_execution', 'code_generation', 'code_review', 'tool_use'],
    primaryDomain: 'testing',
    secondaryDomains: ['code'],
    weight: 1.0,
    available: true,
  },
  {
    id: 'devops-expert',
    role: 'devops_expert',
    name: 'DevOps/SRE Expert',
    description: 'Specialized in infrastructure, CI/CD, monitoring, and operational excellence',
    capabilities: ['task_execution', 'code_generation', 'tool_use', 'collaboration'],
    primaryDomain: 'infrastructure',
    secondaryDomains: ['code', 'security'],
    weight: 1.0,
    available: true,
  },
  {
    id: 'pm-expert',
    role: 'pm_expert',
    name: 'Product Manager Expert',
    description: 'Specialized in requirements analysis, user stories, and stakeholder alignment',
    capabilities: ['task_execution', 'collaboration', 'research'],
    primaryDomain: 'general',
    secondaryDomains: ['documentation'],
    weight: 0.9,
    available: true,
  },
  {
    id: 'ux-expert',
    role: 'ux_expert',
    name: 'UX Designer Expert',
    description: 'Specialized in user experience patterns, interaction design, and usability',
    capabilities: ['task_execution', 'collaboration', 'research'],
    primaryDomain: 'general',
    secondaryDomains: ['documentation', 'code'],
    weight: 0.9,
    available: true,
  },
  {
    id: 'infrastructure-expert',
    role: 'infrastructure_expert',
    name: 'Infrastructure Expert',
    description:
      'Specialized in physical server management, bare metal ops, OOB management, and hardware lifecycle',
    capabilities: ['task_execution', 'code_generation', 'tool_use', 'collaboration'],
    primaryDomain: 'infrastructure',
    secondaryDomains: ['security', 'code'],
    weight: 1.0,
    available: true,
  },
];
