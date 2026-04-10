/**
 * CI/CD Patterns Knowledge Module
 *
 * Actionable CI/CD pipeline patterns and deployment best practices
 * for enriching code expert agent prompts.
 *
 * @module agents/experts/knowledge/code/cicd-patterns
 * (Source: Epic #643 - Standards Absorption, Phase 1c)
 */

import type { KnowledgeModule } from '../types.js';

export const CICD_PATTERNS: KnowledgeModule = {
  id: 'code-cicd-patterns',
  domain: 'code',
  title: 'CI/CD Pipeline Patterns and Best Practices',
  tags: ['cicd', 'github-actions', 'deployment', 'pipelines', 'devops'],
  sections: [
    {
      title: 'Pipeline Stages',
      priority: 10,
      content: [
        'Standard stage order: lint -> test -> security scan -> build -> deploy.',
        'Lint: formatting (prettier/ruff), static analysis (eslint/mypy), commit message validation.',
        'Test: unit tests first (fast feedback), then integration, then e2e.',
        'Security scan: dependency audit (npm audit, pip-audit), SAST (semgrep, CodeQL), secret scanning.',
        'Build: compile, bundle, containerize. Produce versioned artifacts.',
        'Deploy: staged rollout (dev -> staging -> production). Never skip staging.',
        'Fail fast: lint and unit tests run first. Expensive steps run only after cheap ones pass.',
      ].join('\n'),
    },
    {
      title: 'GitHub Actions Patterns',
      priority: 9,
      content: [
        'Matrix strategy: test across Node versions, OS, and configurations in parallel.',
        '  strategy: { matrix: { node: ["20", "22"], os: [ubuntu-latest, macos-latest] } }',
        'Caching: cache node_modules, pip cache, build outputs. Use actions/cache with hash-based keys.',
        '  key: ${{ runner.os }}-pnpm-${{ hashFiles("pnpm-lock.yaml") }}',
        'Artifacts: upload test reports, coverage, build outputs with actions/upload-artifact.',
        'Reusable workflows: `.github/workflows/reusable-*.yml` with `workflow_call` trigger.',
        'Concurrency: `concurrency: { group: ${{ github.ref }}, cancel-in-progress: true }`.',
        'Pin action versions to full SHA, not tags: `actions/checkout@<sha>`.',
      ].join('\n'),
    },
    {
      title: 'Deployment Strategies',
      priority: 9,
      content: [
        'Blue-green: two identical environments. Switch traffic atomically. Instant rollback.',
        'Canary: route small percentage (1-5%) of traffic to new version. Monitor error rates.',
        'Rolling: gradually replace instances. Set maxUnavailable and maxSurge limits.',
        'Feature flags: deploy code disabled, enable per-user/percentage. Decouple deploy from release.',
        'Choose blue-green for: critical services, zero-downtime requirements.',
        'Choose canary for: high-traffic services, risk-sensitive changes.',
        'Choose rolling for: stateless services, cost-sensitive environments.',
        'Choose feature flags for: gradual rollout, A/B testing, quick kill-switch.',
      ].join('\n'),
    },
    {
      title: 'Branch Protection and Merge Strategies',
      priority: 8,
      content: [
        'Require PR reviews: minimum 1 approval, dismiss stale reviews on new commits.',
        'Require status checks: CI must pass before merge. Include lint, test, security.',
        'Require up-to-date branches before merge to prevent broken main.',
        'Squash merge for feature branches: clean history, single revert point.',
        'Merge commit for release branches: preserve full history.',
        'Delete branches after merge. Use `--delete-branch` with `gh pr merge`.',
        'Protect main/release branches: no force push, no deletion.',
      ].join('\n'),
    },
    {
      title: 'Secret Management in CI',
      priority: 10,
      content: [
        'GitHub Secrets: store at repo or org level. Access via ${{ secrets.NAME }}.',
        'Never echo secrets. Use `add-mask` for dynamic values: `echo "::add-mask::$TOKEN"`.',
        'OIDC for cloud auth: use workload identity federation instead of long-lived credentials.',
        '  permissions: { id-token: write } with aws-actions/configure-aws-credentials.',
        'Environment secrets: scope secrets to deployment environments (dev, staging, prod).',
        'Rotate secrets on schedule. Alert on secret access patterns.',
        'Scan for leaked secrets: use gitleaks, trufflehog in pre-commit and CI.',
      ].join('\n'),
    },
    {
      title: 'Artifact Versioning and Container Image Tagging',
      priority: 7,
      content: [
        'Semantic versioning: MAJOR.MINOR.PATCH. Automate with changesets or semantic-release.',
        'Container tags: use git SHA for traceability. Tag releases with semver.',
        '  tags: [${{ github.sha }}, latest, v${{ steps.version.outputs.version }}]',
        'Never use `latest` tag in production deployments. Always pin specific version.',
        'Sign artifacts: cosign for container images, GPG for packages.',
        'Store artifacts in registry with retention policy. Clean old pre-release images.',
        'Bill of materials: generate SBOM with syft or grype for supply chain security.',
      ].join('\n'),
    },
    {
      title: 'Rollback Procedures and Deployment Gates',
      priority: 8,
      content: [
        'Automated rollback triggers: error rate spike (>1%), latency P99 increase (>2x), health check failures.',
        'Deployment gates: require manual approval for production via GitHub Environments.',
        'Smoke tests: run basic health checks immediately after deploy. Fail = auto rollback.',
        'Database migrations: always backward-compatible. Separate migration deploy from code deploy.',
        'Keep N-1 version ready: maintain previous version artifacts for instant rollback.',
        'Runbook: document rollback steps. Include database rollback if applicable.',
        'Post-deploy monitoring window: 15-30 min observation before marking deploy successful.',
      ].join('\n'),
    },
  ],
} as const;
