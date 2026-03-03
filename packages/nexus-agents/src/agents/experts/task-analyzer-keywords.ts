/**
 * nexus-agents/agents - Task Analyzer Keywords
 *
 * Keyword patterns and constants for task analysis.
 */

import type { TaskDomain } from './task-analyzer-types.js';

// ============================================================================
// Domain Keywords
// ============================================================================

/**
 * Keyword patterns for domain detection.
 * Each domain has primary (high weight) and secondary (lower weight) keywords.
 */
export const DOMAIN_KEYWORDS: Record<TaskDomain, { primary: string[]; secondary: string[] }> = {
  code: {
    primary: [
      'implement',
      'code',
      'function',
      'class',
      'method',
      'refactor',
      'debug',
      'fix',
      'bug',
      'feature',
      'api',
      'endpoint',
      'module',
      'component',
      'typescript',
      'javascript',
      'python',
      'rust',
      'java',
    ],
    secondary: [
      'logic',
      'algorithm',
      'data',
      'parse',
      'validate',
      'convert',
      'transform',
      'handle',
      'process',
      'create',
      'build',
      'develop',
    ],
  },
  security: {
    primary: [
      'security',
      'vulnerability',
      'auth',
      'authentication',
      'authorization',
      'encrypt',
      'decrypt',
      'secret',
      'token',
      'credential',
      'owasp',
      'cwe',
      'injection',
      'xss',
      'csrf',
      'audit',
    ],
    secondary: [
      'permission',
      'access',
      'sanitize',
      'validate',
      'escape',
      'hash',
      'password',
      'session',
      'ssl',
      'tls',
      'certificate',
    ],
  },
  architecture: {
    primary: [
      'architecture',
      'design',
      'pattern',
      'structure',
      'system',
      'scale',
      'microservice',
      'monolith',
      'distributed',
      'event-driven',
      'cqrs',
      'ddd',
      'adr',
    ],
    secondary: [
      'component',
      'service',
      'layer',
      'module',
      'interface',
      'dependency',
      'coupling',
      'cohesion',
      'boundary',
      'domain',
    ],
  },
  documentation: {
    primary: [
      'document',
      'documentation',
      'readme',
      'guide',
      'tutorial',
      'jsdoc',
      'comment',
      'explain',
      'describe',
      'api-doc',
      'changelog',
    ],
    secondary: [
      'write',
      'update',
      'clarify',
      'example',
      'usage',
      'reference',
      'spec',
      'specification',
    ],
  },
  testing: {
    primary: [
      'test',
      'testing',
      'unit',
      'integration',
      'e2e',
      'coverage',
      'mock',
      'stub',
      'assertion',
      'vitest',
      'jest',
      'cypress',
      'playwright',
    ],
    secondary: [
      'verify',
      'validate',
      'check',
      'expect',
      'assert',
      'fixture',
      'scenario',
      'case',
      'spec',
    ],
  },
  infrastructure: {
    primary: [
      'deploy',
      'infrastructure',
      'devops',
      'kubernetes',
      'k8s',
      'docker',
      'terraform',
      'ci/cd',
      'pipeline',
      'monitoring',
      'prometheus',
      'grafana',
      'aws',
      'gcp',
      'azure',
      'cloud',
    ],
    secondary: [
      'sre',
      'helm',
      'container',
      'pod',
      'service',
      'ingress',
      'scaling',
      'autoscale',
      'alerting',
      'metrics',
      'observability',
      'iac',
      'gitops',
    ],
  },
  general: {
    primary: ['help', 'assist', 'general', 'question', 'answer', 'explain'],
    secondary: ['how', 'what', 'why', 'when', 'where', 'which'],
  },
};

// ============================================================================
// Capability Keywords
// ============================================================================

/**
 * Capability keywords for determining required capabilities.
 */
export const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  code_generation: ['implement', 'create', 'build', 'write', 'generate', 'add', 'new'],
  code_review: ['review', 'audit', 'check', 'analyze', 'inspect', 'evaluate', 'assess'],
  research: ['research', 'investigate', 'explore', 'find', 'discover', 'learn', 'understand'],
  tool_use: ['run', 'execute', 'deploy', 'install', 'configure', 'setup', 'migrate'],
  collaboration: ['collaborate', 'coordinate', 'discuss', 'plan', 'decide', 'team'],
  delegation: ['delegate', 'assign', 'distribute', 'orchestrate', 'manage'],
  task_execution: ['do', 'perform', 'complete', 'finish', 'accomplish'],
};

// ============================================================================
// Complexity Indicators
// ============================================================================

/**
 * Complexity indicators - words/patterns that suggest higher complexity.
 */
export const COMPLEXITY_INDICATORS = {
  high: [
    'complex',
    'difficult',
    'challenging',
    'comprehensive',
    'complete',
    'full',
    'entire',
    'all',
    'multiple',
    'various',
    'many',
    'distributed',
    'microservice',
    'architecture',
    'refactor',
    'migration',
    'redesign',
  ],
  medium: [
    'moderate',
    'several',
    'some',
    'few',
    'update',
    'modify',
    'change',
    'improve',
    'enhance',
    'extend',
    'add',
  ],
  low: ['simple', 'basic', 'quick', 'small', 'minor', 'single', 'one', 'fix', 'typo', 'tweak'],
};
