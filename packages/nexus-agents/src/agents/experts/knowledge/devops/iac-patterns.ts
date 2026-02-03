/**
 * Infrastructure as Code (IaC) Knowledge Module
 *
 * Covers Terraform patterns, state management, module design,
 * drift detection, and IaC security best practices.
 *
 * @module agents/experts/knowledge/devops/iac-patterns
 * (Source: Epic #643 - Phase 5a: DevOps Knowledge)
 */

import type { KnowledgeModule } from '../types.js';

export const IAC_PATTERNS_MODULE: KnowledgeModule = {
  id: 'devops-iac-patterns',
  domain: 'devops',
  title: 'Infrastructure as Code Patterns',
  tags: ['iac', 'terraform', 'pulumi', 'cloudformation', 'infrastructure'],
  sections: [
    {
      title: 'Terraform Module Design',
      priority: 10,
      content: [
        'MODULE STRUCTURE: main.tf, variables.tf, outputs.tf, versions.tf',
        'NAMING: module-purpose (e.g., aws-vpc, gcp-gke-cluster)',
        'INPUTS: validate with variable validation blocks; provide sensible defaults',
        'OUTPUTS: expose only what consumers need; document each output',
        'VERSIONING: pin module versions in caller; use semantic versioning',
        'COMPOSITION: compose small modules into larger stacks; avoid mega-modules',
        'RULE: One module = one logical resource group (VPC, database, app)',
      ].join('\n'),
    },
    {
      title: 'State Management',
      priority: 10,
      content: [
        'REMOTE STATE: always use remote backend (S3+DynamoDB, GCS, Terraform Cloud)',
        'LOCKING: enable state locking to prevent concurrent modifications',
        'ISOLATION: separate state files per environment (dev/staging/prod)',
        'WORKSPACES: use for minor variations; prefer separate backends for environments',
        'IMPORTS: use `terraform import` for existing resources; never recreate managed infra',
        'SENSITIVE: mark sensitive outputs; encrypt state at rest',
        'ANTI-PATTERN: local state in production = data loss risk',
      ].join('\n'),
    },
    {
      title: 'Drift Detection and Remediation',
      priority: 8,
      content: [
        'DETECT: run `terraform plan` on schedule (e.g., nightly CI job)',
        'ALERT: notify on any detected drift; include resource details',
        'REMEDIATE: apply to reconcile state or update code to match reality',
        'PREVENT: restrict manual changes via IAM policies; use SCPs for guardrails',
        'AUDIT: log all infrastructure changes; correlate with IaC commits',
        'RULE: if drift is intentional, update IaC; never leave code/infra mismatch',
      ].join('\n'),
    },
    {
      title: 'IaC Security Practices',
      priority: 9,
      content: [
        'SCANNING: use tfsec, checkov, or trivy for security misconfigurations',
        'SECRETS: never hardcode credentials; use vault references or OIDC',
        'LEAST PRIVILEGE: IAM roles scoped to minimum required permissions',
        'ENCRYPTION: enable encryption by default (EBS, S3, RDS, GCS)',
        'NETWORKING: private subnets for compute; public only for load balancers',
        'COMPLIANCE: tag resources for cost allocation and ownership tracking',
        'REVIEW: require PR review for all infrastructure changes',
      ].join('\n'),
    },
  ],
} as const;
