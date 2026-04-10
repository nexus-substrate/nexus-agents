/**
 * Container Orchestration Knowledge Module
 *
 * Covers Kubernetes patterns, container best practices,
 * Helm chart design, and pod security standards.
 *
 * @module agents/experts/knowledge/devops/container-orchestration
 * (Source: Epic #643 - Phase 5a: DevOps Knowledge)
 */

import type { KnowledgeModule } from '../types.js';

export const CONTAINER_ORCHESTRATION_MODULE: KnowledgeModule = {
  id: 'devops-container-orchestration',
  domain: 'devops',
  title: 'Container Orchestration Patterns',
  tags: ['kubernetes', 'docker', 'containers', 'helm', 'pod-security'],
  sections: [
    {
      title: 'Container Image Best Practices',
      priority: 10,
      content: [
        'BASE IMAGES: use distroless or alpine; avoid full OS images',
        'MULTI-STAGE: build in one stage, copy artifacts to minimal runtime stage',
        'LAYER ORDER: least-changing layers first (OS deps, app deps, app code)',
        'USER: run as non-root; set USER directive in Dockerfile',
        'SCANNING: scan images for CVEs with grype, osv-scanner, or snyk',
        'TAGGING: never use :latest in production; pin to SHA or semver',
        'SIZE: target < 100MB for application images; smaller = faster deploys',
      ].join('\n'),
    },
    {
      title: 'Kubernetes Resource Patterns',
      priority: 9,
      content: [
        'REQUESTS/LIMITS: always set CPU and memory requests; set memory limits',
        '  requests: { cpu: "100m", memory: "128Mi" }',
        '  limits: { memory: "256Mi" }  # CPU limits optional (throttling)',
        'PROBES: liveness (restart on failure), readiness (remove from LB), startup (slow init)',
        '  livenessProbe: { httpGet: /healthz, period: 10s, failure: 3 }',
        '  readinessProbe: { httpGet: /readyz, period: 5s, failure: 2 }',
        'HPA: autoscale on CPU/memory or custom metrics; set min/max replicas',
        'PDB: PodDisruptionBudget ensures availability during node drains',
        'ANTI-AFFINITY: spread replicas across nodes/zones for HA',
      ].join('\n'),
    },
    {
      title: 'Kubernetes Security',
      priority: 9,
      content: [
        'POD SECURITY: enforce restricted PSS (Pod Security Standards)',
        'RBAC: least-privilege ServiceAccounts; no cluster-admin for workloads',
        'NETWORK POLICIES: deny-all default; explicitly allow required traffic',
        'SECRETS: use external secrets operator or sealed-secrets; avoid K8s secrets in git',
        'IMAGE POLICY: admission controller to allow only signed/approved images',
        'NAMESPACE ISOLATION: separate namespaces per team/environment',
        'AUDIT: enable K8s audit logging; alert on privileged pod creation',
      ].join('\n'),
    },
    {
      title: 'Helm Chart Patterns',
      priority: 7,
      content: [
        'STRUCTURE: Chart.yaml, values.yaml, templates/, NOTES.txt',
        'VALUES: provide sensible defaults; document all values in values.yaml',
        'TEMPLATES: use named templates (_helpers.tpl) for reusable snippets',
        'TESTING: use helm unittest or helm test hooks for validation',
        'VERSIONING: bump chart version on every change; bump appVersion with app releases',
        'DEPENDENCIES: pin sub-chart versions; use condition flags for optional components',
        'RELEASE: helm upgrade --install --atomic (rollback on failure)',
      ].join('\n'),
    },
  ],
} as const;
