/**
 * DevOps Knowledge Modules
 *
 * Domain knowledge for enriching DevOps/SRE expert agent prompts.
 * Contains IaC patterns, container orchestration, observability, and
 * systemd/bare-metal guidance.
 *
 * @module agents/experts/knowledge/devops
 * (Source: Epic #643 - Phase 5a: DevOps Knowledge)
 */

import type { KnowledgeModule } from '../types.js';
import { IAC_PATTERNS_MODULE } from './iac-patterns.js';
import { CONTAINER_ORCHESTRATION_MODULE } from './container-orchestration.js';
import { OBSERVABILITY_MODULE } from './observability.js';
import { SYSTEMD_BARE_METAL_MODULE } from './systemd-bare-metal.js';

export { IAC_PATTERNS_MODULE } from './iac-patterns.js';
export { CONTAINER_ORCHESTRATION_MODULE } from './container-orchestration.js';
export { OBSERVABILITY_MODULE } from './observability.js';
export { SYSTEMD_BARE_METAL_MODULE } from './systemd-bare-metal.js';

/**
 * All DevOps domain knowledge modules.
 * Registered with the KnowledgeRegistry for injection into DevOps expert prompts.
 */
export const DEVOPS_KNOWLEDGE_MODULES: readonly KnowledgeModule[] = [
  IAC_PATTERNS_MODULE,
  CONTAINER_ORCHESTRATION_MODULE,
  OBSERVABILITY_MODULE,
  SYSTEMD_BARE_METAL_MODULE,
];

/**
 * Common DevOps domain patterns for quick reference injection.
 */
export const DEVOPS_DOMAIN_PATTERNS = {
  iacModuleDesign:
    'One module = one logical resource group; pin versions; remote state with locking',
  containerSecurity: 'Distroless images; non-root user; scan for CVEs; pin image tags',
  k8sResources: 'Always set requests/limits; configure liveness/readiness probes; use PDBs',
  observability: 'Metrics + logs + traces correlated by traceId; alert on symptoms not causes',
  sloDesign: 'SLI measures user experience; SLO sets target; error budget drives release velocity',
  systemdServices:
    'Type=notify for readiness signaling; EnvironmentFile for secrets; crash-loop via StartLimitBurst',
  firewallChains:
    'INPUT=host traffic; FORWARD=container/routed; ufw route allow for bridge networks; DOCKER-USER for restrictions',
} as const;

/**
 * DevOps best practices summary for prompt injection.
 */
export const DEVOPS_BEST_PRACTICES = {
  infrastructure:
    'All infrastructure defined in code; no manual changes; drift detection on schedule',
  deployment: 'Blue-green or canary for production; automated rollback on error rate spike',
  reliability: 'Define SLOs per service; track error budgets; blameless postmortems',
  security: 'OIDC for CI auth; least-privilege IAM; encrypt at rest and in transit',
  monitoring: 'Golden signals (latency, traffic, errors, saturation); runbook per alert',
  bareMetalLinux:
    'systemd EnvironmentFile for secrets; DOCKER-USER chain for firewall; explicit --dns for container DNS',
} as const;

/**
 * Build a formatted knowledge prompt for DevOps expert prompt injection.
 *
 * @returns Formatted string with DevOps domain knowledge for system prompt injection
 */
export function getDevOpsKnowledgePrompt(): string {
  const sections = DEVOPS_KNOWLEDGE_MODULES.flatMap((module) => module.sections)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);

  const formatted = sections
    .map((section) => `### ${section.title}\n${section.content}`)
    .join('\n\n');

  return `## DevOps Domain Knowledge\n\n${formatted}`;
}
